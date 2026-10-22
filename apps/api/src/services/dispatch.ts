import {
  Controller,
  Post,
  Req,
  Param,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Request } from 'express';
import { requireSession, uuid } from '../identity/session.js';
import { transaction } from '../database.js';
import { audit, emit } from '../organizations/service.js';
import { sandbox } from '../finance/ledger.js';
import { dispatchLock } from './dispatch-lock.js';
import { RideService } from './rides.js';
@Injectable()
export class DispatchService {
  async offeredRide(actor: string, id: string) {
    return transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT ride_id FROM ride_dispatch_offers WHERE id=$1 AND driver_id=$2',
          [id, actor],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row.ride_id as string;
    });
  }
  async decline(actor: string, id: string) {
    return transaction(async (db) => {
      await dispatchLock(db);
      const offer = (
        await db.query(
          'SELECT * FROM ride_dispatch_offers WHERE id=$1 AND driver_id=$2 FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!offer) throw new NotFoundException();
      if (offer.status === 'declined') return { status: 'declined' };
      if (
        offer.status !== 'pending' ||
        new Date(offer.expires_at).getTime() <= Date.now()
      )
        throw new ConflictException('انتهى عرض الرحلة');
      await db.query(
        "UPDATE ride_dispatch_offers SET status='declined' WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'taxi.dispatch_declined', null, { offerId: id });
      return { status: 'declined' };
    });
  }
}
@Controller('api/v1')
export class DispatchController {
  constructor(
    private readonly service: DispatchService,
    private readonly rides: RideService,
  ) {}
  @Post('driver/dispatch-offers/:id/accept') async accept(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    const actor = (await requireSession(r)).user.id;
    const offer = uuid(id);
    return this.rides.claim(
      actor,
      await this.service.offeredRide(actor, offer),
      offer,
    );
  }
  @Post('driver/dispatch-offers/:id/decline') async decline(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.decline((await requireSession(r)).user.id, uuid(id));
  }
}
export async function dispatchRides() {
  if (process.env.APP_ENV !== 'local') return 0;
  sandbox();
  return transaction(async (db) => {
    await dispatchLock(db);
    await db.query(
      "UPDATE ride_dispatch_offers SET status='expired' WHERE status='pending' AND expires_at<=now()",
    );
    await db.query(
      "UPDATE ride_dispatch_offers o SET status='withdrawn' WHERE status='pending' AND (NOT EXISTS(SELECT 1 FROM rides r WHERE r.id=o.ride_id AND r.status='requested') OR NOT EXISTS(SELECT 1 FROM driver_vehicles v JOIN professional_profiles p ON p.user_id=v.user_id AND p.kind='driver' AND p.status='verified' WHERE v.user_id=o.driver_id AND v.available AND v.auto_dispatch AND v.expires_on>=CURRENT_DATE) OR EXISTS(SELECT 1 FROM rides active WHERE active.driver_id=o.driver_id AND active.status IN ('accepted','driver_en_route','arrived','in_transit')))",
    );
    const rides = (
      await db.query(
        "SELECT * FROM rides r WHERE status='requested' AND auto_dispatch AND (scheduled_at IS NULL OR scheduled_at BETWEEN now()-interval '2 hours' AND now()+interval '30 minutes') AND NOT EXISTS(SELECT 1 FROM ride_dispatch_offers o WHERE o.ride_id=r.id AND o.status='pending') AND (SELECT count(*) FROM ride_dispatch_offers o WHERE o.ride_id=r.id)<10 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20",
      )
    ).rows;
    let assigned = 0;
    for (const r of rides) {
      const v = (
        await db.query(
          "SELECT v.user_id FROM driver_vehicles v JOIN professional_profiles p ON p.user_id=v.user_id AND p.kind='driver' AND p.status='verified' WHERE v.auto_dispatch AND v.available AND v.expires_on>=CURRENT_DATE AND v.city=$2 AND (NOT $3 OR v.passenger_allowed) AND v.capacity>=(SELECT count(*) FROM ride_pets WHERE ride_id=$1) AND NOT EXISTS(SELECT 1 FROM ride_pets rp JOIN pets pet ON pet.id=rp.pet_id WHERE rp.ride_id=$1 AND NOT ('all'=ANY(v.allowed_species) OR pet.species=ANY(v.allowed_species))) AND NOT EXISTS(SELECT 1 FROM rides active WHERE active.driver_id=v.user_id AND active.status IN ('accepted','driver_en_route','arrived','in_transit')) AND NOT EXISTS(SELECT 1 FROM ride_dispatch_offers o WHERE o.driver_id=v.user_id AND (o.ride_id=$1 OR o.status='pending')) ORDER BY (SELECT max(created_at) FROM ride_dispatch_offers WHERE driver_id=v.user_id) NULLS FIRST,v.user_id LIMIT 1",
          [r.id, r.city, r.accompanying],
        )
      ).rows[0];
      if (!v) continue;
      const offer = (
        await db.query(
          'INSERT INTO ride_dispatch_offers(ride_id,driver_id) VALUES($1,$2) RETURNING id',
          [r.id, v.user_id],
        )
      ).rows[0];
      await audit(db, v.user_id, 'taxi.dispatch_offered', null, {
        offerId: offer.id,
        rideId: r.id,
      });
      await emit(db, v.user_id, 'RideDispatchOffered', offer.id, 1);
      assigned++;
    }
    return assigned;
  });
}
