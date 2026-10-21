import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { CareService } from '../care/service.js';
import { audit, emit } from '../organizations/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';
export interface RideInput {
  petId: string;
  city: string;
  originLabel: string;
  destinationLabel: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  idempotencyKey: string;
  extraPetIds?: string[];
  scheduledAt?: string | null;
  transportNotes?: string;
  accompanying?: boolean;
}
@Injectable()
export class RideService {
  constructor(private readonly care: CareService) {}
  async driver(db: PoolClient, actor: string) {
    if (
      !(
        await db.query(
          "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='driver' AND status='verified' FOR SHARE",
          [actor],
        )
      ).rowCount
    )
      throw new ForbiddenException('يلزم اعتماد سائق ساري');
  }
  async vehicle(
    actor: string,
    i: {
      plate: string;
      description: string;
      city: string;
      expiresOn: string;
      available: boolean;
      capacity: number;
      allowedSpecies: string[];
      passengerAllowed: boolean;
    },
  ) {
    return transaction(async (db) => {
      await this.driver(db, actor);
      if (i.expiresOn < new Date().toISOString().slice(0, 10))
        throw new BadRequestException('صلاحية المركبة منتهية');
      await db.query(
        'INSERT INTO driver_vehicles(user_id,plate,description,city,expires_on,available,capacity,allowed_species,passenger_allowed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET plate=$2,description=$3,city=$4,expires_on=$5,available=$6,capacity=$7,allowed_species=$8,passenger_allowed=$9',
        [
          actor,
          i.plate,
          i.description,
          i.city,
          i.expiresOn,
          i.available,
          i.capacity,
          i.allowedSpecies,
          i.passengerAllowed,
        ],
      );
      await audit(db, actor, 'taxi.vehicle_saved');
      return { status: 'saved' };
    });
  }
  async request(actor: string, i: RideInput) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `ride:${actor}:${i.idempotencyKey}`,
      ]);
      const ids = [i.petId, ...(i.extraPetIds ?? [])]
        .map((id) => id.toLowerCase())
        .sort();
      if (new Set(ids).size !== ids.length)
        throw new BadRequestException('حيوان مكرر');
      for (const petId of ids) await this.care.pet(db, actor, petId, 'booking');
      const old = (
        await db.query(
          'SELECT * FROM rides WHERE user_id=$1 AND idempotency_key=$2',
          [actor, i.idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (
          old.pet_id !== i.petId.toLowerCase() ||
          (old.scheduled_at
            ? new Date(old.scheduled_at).toISOString()
            : null) !==
            (i.scheduledAt ? new Date(i.scheduledAt).toISOString() : null) ||
          old.transport_notes !== (i.transportNotes ?? '') ||
          old.accompanying !== (i.accompanying ?? false) ||
          JSON.stringify(
            (
              await db.query(
                'SELECT pet_id FROM ride_pets WHERE ride_id=$1 ORDER BY pet_id',
                [old.id],
              )
            ).rows.map((p) => p.pet_id),
          ) !== JSON.stringify(ids) ||
          Number(old.origin_lat) !== i.originLat ||
          Number(old.origin_lng) !== i.originLng ||
          Number(old.destination_lat) !== i.destinationLat ||
          Number(old.destination_lng) !== i.destinationLng ||
          old.city !== i.city ||
          old.origin_label !== i.originLabel ||
          old.destination_label !== i.destinationLabel
        )
          throw new ConflictException();
        return old;
      }
      if (i.scheduledAt) {
        const t = new Date(i.scheduledAt).getTime();
        if (t < Date.now() + 5 * 60000 || t > Date.now() + 30 * 86400000)
          throw new BadRequestException('الموعد بين خمس دقائق وثلاثين يوماً');
      }
      const rad = (d: number) => (d * Math.PI) / 180;
      const a =
        Math.sin(rad(i.destinationLat - i.originLat) / 2) ** 2 +
        Math.cos(rad(i.originLat)) *
          Math.cos(rad(i.destinationLat)) *
          Math.sin(rad(i.destinationLng - i.originLng) / 2) ** 2;
      const km = Math.ceil(
        6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
      );
      if (km > 100) throw new BadRequestException('نطاق التجربة حتى 100 كم');
      const fare = 5000000n + BigInt(Math.max(km, 1)) * 1000000n;
      const share = (fare * 9n) / 10n;
      const r = (
        await db.query(
          'INSERT INTO rides(user_id,pet_id,city,origin_label,destination_label,origin_lat,origin_lng,destination_lat,destination_lng,fare_minor,driver_share,idempotency_key,scheduled_at,transport_notes,accompanying) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
          [
            actor,
            i.petId,
            i.city,
            i.originLabel,
            i.destinationLabel,
            i.originLat,
            i.originLng,
            i.destinationLat,
            i.destinationLng,
            fare.toString(),
            share.toString(),
            i.idempotencyKey,
            i.scheduledAt ?? null,
            i.transportNotes ?? '',
            i.accompanying ?? false,
          ],
        )
      ).rows[0];
      for (const petId of ids)
        await db.query(
          'INSERT INTO ride_pets(ride_id,pet_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [r.id, petId],
        );
      await audit(db, actor, 'taxi.ride_requested', null, { rideId: r.id });
      await emit(db, actor, 'RideRequested', r.id, 1);
      return r;
    });
  }
  async mine(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT r.*,r.fare_minor::text,r.driver_share::text,p.name pet_name,(SELECT count(*)::int FROM ride_pets WHERE ride_id=r.id) pet_count FROM rides r JOIN pets p ON p.id=r.pet_id WHERE r.user_id=$1 OR r.driver_id=$1 ORDER BY r.created_at DESC LIMIT 100',
            [actor],
          )
        ).rows,
    );
  }
  async driverHome(actor: string) {
    return transaction(async (db) => {
      await this.driver(db, actor);
      const vehicle =
        (
          await db.query(
            'SELECT *,expires_on::text FROM driver_vehicles WHERE user_id=$1',
            [actor],
          )
        ).rows[0] ?? null;
      const requests = vehicle?.available
        ? (
            await db.query(
              "SELECT r.id,r.city,r.fare_minor::text,p.species FROM rides r JOIN pets p ON p.id=r.pet_id WHERE r.status='requested' AND r.city=$1 AND $2::date>=CURRENT_DATE AND (r.scheduled_at IS NULL OR r.scheduled_at BETWEEN now()-interval '2 hours' AND now()+interval '30 minutes') AND (SELECT count(*) FROM ride_pets WHERE ride_id=r.id)<=$3 AND (NOT r.accompanying OR $5) AND NOT EXISTS(SELECT 1 FROM ride_pets rp JOIN pets pp ON pp.id=rp.pet_id WHERE rp.ride_id=r.id AND NOT ('all'=ANY($4::text[]) OR pp.species=ANY($4::text[]))) ORDER BY r.created_at LIMIT 100",
              [
                vehicle.city,
                vehicle.expires_on,
                vehicle.capacity,
                vehicle.allowed_species,
                vehicle.passenger_allowed,
              ],
            )
          ).rows
        : [];
      const wallet = (
        await db.query(
          "SELECT coalesce(sum(l.credit-l.debit),0)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id JOIN ledger_entities e ON e.id=j.entity_id WHERE e.kind='platform' AND l.account_code='2200' AND l.party_id=$1 AND j.status='posted'",
          [actor],
        )
      ).rows[0].amount;
      return { vehicle, requests, walletMinor: wallet, mode: 'sandbox' };
    });
  }
  async claim(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await this.driver(db, actor);
      const v = (
        await db.query(
          'SELECT * FROM driver_vehicles WHERE user_id=$1 AND available AND expires_on>=CURRENT_DATE FOR UPDATE',
          [actor],
        )
      ).rows[0];
      if (!v) throw new ForbiddenException('يلزم مركبة سارية ومتاحة');
      const r = (
        await db.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (
        !r ||
        r.status !== 'requested' ||
        r.city !== v.city ||
        (r.accompanying && !v.passenger_allowed)
      )
        throw new ConflictException('الرحلة غير متاحة لهذه المركبة');
      if (r.scheduled_at) {
        const t = new Date(r.scheduled_at).getTime();
        if (t > Date.now() + 30 * 60000 || t < Date.now() - 2 * 3600000)
          throw new ConflictException('الرحلة خارج نافذة الموعد');
      }
      const pets = (
        await db.query(
          'SELECT p.id,p.species FROM ride_pets rp JOIN pets p ON p.id=rp.pet_id WHERE rp.ride_id=$1 ORDER BY p.id',
          [id],
        )
      ).rows;
      if (
        pets.length > v.capacity ||
        pets.some(
          (p) =>
            !v.allowed_species.includes('all') &&
            !v.allowed_species.includes(p.species),
        )
      )
        throw new ConflictException('سعة أو أنواع المركبة لا تطابق الرحلة');
      for (const pet of pets)
        await this.care.pet(db, r.user_id, pet.id, 'booking');
      await db.query(
        "UPDATE rides SET driver_id=$2,status='accepted' WHERE id=$1",
        [id, actor],
      );
      await audit(db, actor, 'taxi.ride_accepted', null, { rideId: id });
      await emit(db, actor, 'RideAccepted', id, 2);
      return { status: 'accepted' };
    });
  }
  async transition(actor: string, id: string, status: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.driver(db, actor);
      const r = (
        await db.query(
          'SELECT * FROM rides WHERE id=$1 AND driver_id=$2 FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      const previous: Record<string, string> = {
        driver_en_route: 'accepted',
        arrived: 'driver_en_route',
        in_transit: 'arrived',
        completed: 'in_transit',
      };
      if (!r || previous[status] !== r.status)
        throw new ConflictException('انتقال الرحلة غير صالح');
      if (status === 'completed') {
        const fare = BigInt(r.fare_minor),
          share = BigInt(r.driver_share);
        await post(
          db,
          actor,
          await entity(db, null),
          `ride:${id}`,
          'رحلة منفذة وتحصيل اختباري',
          [
            { account: '1100', debit: fare },
            { account: '2200', credit: share, partyId: actor },
            { account: '4000', credit: fare - share },
          ],
        );
        await db.query('DELETE FROM ride_locations WHERE ride_id=$1', [id]);
      }
      await db.query('UPDATE rides SET status=$2 WHERE id=$1', [id, status]);
      await audit(db, actor, `taxi.${status}`, null, { rideId: id });
      return { status };
    });
  }
  async cancel(actor: string, id: string) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          'SELECT * FROM rides WHERE id=$1 AND (user_id=$2 OR driver_id=$2) FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      if (
        !['requested', 'accepted', 'driver_en_route', 'arrived'].includes(
          r.status,
        )
      )
        throw new ConflictException('لا يمكن الإلغاء في هذه الحالة');
      await db.query("UPDATE rides SET status='cancelled' WHERE id=$1", [id]);
      await db.query('DELETE FROM ride_locations WHERE ride_id=$1', [id]);
      await audit(db, actor, 'taxi.cancelled', null, { rideId: id });
      return { status: 'cancelled' };
    });
  }
  async location(
    actor: string,
    id: string,
    input?: { lat: number; lng: number; shared: boolean },
  ) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM rides WHERE id=$1 AND (user_id=$2 OR driver_id=$2) AND status IN ('accepted','driver_en_route','arrived','in_transit') FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      if (!r)
        throw new NotFoundException('الموقع متاح أثناء الرحلة النشطة فقط');
      await this.driver(db, r.driver_id);
      if (input) {
        if (actor !== r.driver_id) throw new ForbiddenException();
        await db.query(
          "INSERT INTO ride_locations(ride_id,driver_id,lat,lng,shared,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '60 seconds') ON CONFLICT(ride_id) DO UPDATE SET lat=$3,lng=$4,shared=$5,expires_at=now()+interval '60 seconds'",
          [id, actor, input.lat, input.lng, input.shared],
        );
        return { status: 'updated' };
      }
      return (
        (
          await db.query(
            'SELECT lat,lng,expires_at FROM ride_locations WHERE ride_id=$1 AND shared AND expires_at>now()',
            [id],
          )
        ).rows[0] ?? null
      );
    });
  }
  async incident(actor: string, id: string, description: string) {
    return transaction(async (db) => {
      if (
        !(
          await db.query(
            'SELECT 1 FROM rides WHERE id=$1 AND (user_id=$2 OR driver_id=$2)',
            [id, actor],
          )
        ).rowCount
      )
        throw new NotFoundException();
      const r = (
        await db.query(
          'INSERT INTO ride_incidents(ride_id,actor_id,description) VALUES($1,$2,$3) RETURNING id',
          [id, actor, description],
        )
      ).rows[0];
      await audit(db, actor, 'taxi.incident_reported', null, {
        rideId: id,
        incidentId: r.id,
      });
      return r;
    });
  }
}

export async function expireScheduledRides() {
  return transaction(async (db) => {
    const rows = (
      await db.query(
        "UPDATE rides SET status='cancelled' WHERE id IN (SELECT id FROM rides WHERE status='requested' AND scheduled_at<now()-interval '2 hours' ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 30) RETURNING id,user_id",
      )
    ).rows;
    for (const r of rows) {
      await audit(db, r.user_id, 'taxi.schedule_expired', null, {
        rideId: r.id,
      });
      await emit(db, r.user_id, 'RideReservationExpired', r.id, 2);
    }
    return rows.length;
  });
}
