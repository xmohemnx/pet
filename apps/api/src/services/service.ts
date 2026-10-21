import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { CareService } from '../care/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';
import {
  planEntitlementsSql,
  subscriptionEntitlementsSql,
  subscriptionStateSql,
} from './plans.js';
@Injectable()
export class ServicesService {
  constructor(
    private readonly org: OrganizationService,
    private readonly care: CareService,
  ) {}
  async catalog() {
    return transaction(async (db) => ({
      plans: (
        await db.query(
          `SELECT p.*,p.price_minor::text,c.name clinic_name,s.name service_name,b.name branch_name,${planEntitlementsSql} entitlements FROM care_plans p JOIN clinics c ON c.id=p.clinic_id JOIN clinic_services s ON s.id=p.service_id LEFT JOIN clinic_branches b ON b.id=p.branch_id WHERE p.active AND s.active AND c.verification_status='verified' AND NOT EXISTS(SELECT 1 FROM care_plan_entitlements pe JOIN clinic_services cs ON cs.id=pe.service_id WHERE pe.plan_id=p.id AND NOT cs.active) ORDER BY p.name LIMIT 100`,
        )
      ).rows,
      units: (
        await db.query(
          "SELECT u.*,u.night_price::text,c.name clinic_name FROM boarding_units u JOIN clinics c ON c.id=u.clinic_id WHERE u.active AND c.verification_status='verified' ORDER BY u.name LIMIT 100",
        )
      ).rows,
    }));
  }
  async mine(actor: string) {
    return transaction(async (db) => ({
      subscriptions: (
        await db.query(
          `SELECT s.*,s.price_minor::text,p.name,p.service_id,p.valid_days,p.waiting_days,pet.name pet_name,b.name branch_name,${subscriptionStateSql} state,${subscriptionEntitlementsSql} entitlements,(SELECT n.id FROM care_subscriptions n WHERE n.predecessor_id=s.id) successor_id FROM care_subscriptions s JOIN care_plans p ON p.id=s.plan_id JOIN pets pet ON pet.id=s.pet_id LEFT JOIN clinic_branches b ON b.id=s.branch_id WHERE s.user_id=$1 AND pet.owner_id=$1 AND pet.archived_at IS NULL ORDER BY s.created_at DESC LIMIT 200`,
          [actor],
        )
      ).rows,
      boarding: (
        await db.query(
          'SELECT b.*,b.total_minor::text,u.name,u.clinic_id,p.name pet_name FROM boarding_bookings b JOIN boarding_units u ON u.id=b.unit_id JOIN pets p ON p.id=b.pet_id WHERE b.user_id=$1 ORDER BY b.created_at DESC',
          [actor],
        )
      ).rows,
      transfers: (
        await db.query(
          "SELECT t.id,t.pet_id,t.from_id,t.to_id,t.expires_at,p.name FROM pet_transfers t JOIN pets p ON p.id=t.pet_id WHERE (t.to_id=$1 OR t.from_id=$1) AND t.status='pending' AND t.expires_at>now()",
          [actor],
        )
      ).rows,
    }));
  }
  async clinic(actor: string, clinic: string) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, undefined, db);
      return {
        branches: (
          await db.query(
            'SELECT id,name FROM clinic_branches WHERE clinic_id=$1 ORDER BY name',
            [clinic],
          )
        ).rows,
        plans: (
          await db.query(
            `SELECT p.*,p.price_minor::text,b.name branch_name,${planEntitlementsSql} entitlements FROM care_plans p LEFT JOIN clinic_branches b ON b.id=p.branch_id WHERE p.clinic_id=$1 ORDER BY p.name LIMIT 200`,
            [clinic],
          )
        ).rows,
        sales: (
          await this.org.membership(actor, clinic, undefined, db)
        ).capabilities.includes('clinic_admin')
          ? (
              await db.query(
                `SELECT p.id,p.name,count(s.id)::int subscriptions,coalesce(sum(s.price_minor) FILTER(WHERE s.status NOT IN ('cancelled','upgraded')),0)::text sold_minor,coalesce(sum((SELECT coalesce(sum(u.recognized_minor),0) FROM entitlement_usage u WHERE u.subscription_id=s.id)),0)::text recognized_minor FROM care_plans p LEFT JOIN care_subscriptions s ON s.plan_id=p.id WHERE p.clinic_id=$1 GROUP BY p.id ORDER BY p.name`,
                [clinic],
              )
            ).rows
          : [],
        units: (
          await db.query(
            'SELECT *,night_price::text FROM boarding_units WHERE clinic_id=$1',
            [clinic],
          )
        ).rows,
        boarding: (
          await db.query(
            'SELECT b.*,p.name pet_name,u.name unit_name FROM boarding_bookings b JOIN boarding_units u ON u.id=b.unit_id JOIN pets p ON p.id=b.pet_id WHERE u.clinic_id=$1 ORDER BY b.starts_on DESC LIMIT 100',
            [clinic],
          )
        ).rows,
      };
    });
  }
  async unit(
    actor: string,
    clinic: string,
    i: { name: string; species: string; nightPrice: string },
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const r = (
        await db.query(
          'INSERT INTO boarding_units(clinic_id,name,species,night_price) VALUES($1,$2,$3,$4) RETURNING *',
          [clinic, i.name, i.species, i.nightPrice],
        )
      ).rows[0];
      await audit(db, actor, 'services.boarding_unit_created', clinic, {
        unitId: r.id,
      });
      return r;
    });
  }
  async book(
    actor: string,
    unitId: string,
    petId: string,
    start: string,
    end: string,
    key: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const p = await this.care.pet(db, actor, petId, 'booking');
      if (p.archived_at) throw new ConflictException('ملف الحيوان مؤرشف');
      const old = (
        await db.query(
          'SELECT *,starts_on::text,ends_on::text FROM boarding_bookings WHERE user_id=$1 AND idempotency_key=$2',
          [actor, key],
        )
      ).rows[0];
      if (old) {
        if (
          old.unit_id !== unitId ||
          old.pet_id !== petId ||
          old.starts_on !== start ||
          old.ends_on !== end
        )
          throw new ConflictException();
        return old;
      }
      const unit = (
        await db.query(
          "SELECT u.* FROM boarding_units u JOIN clinics c ON c.id=u.clinic_id WHERE u.id=$1 AND u.active AND c.verification_status='verified'",
          [unitId],
        )
      ).rows[0];
      if (!unit || unit.species !== p.species)
        throw new BadRequestException('الوحدة لا تطابق نوع الحيوان');
      const nights = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (
        start < new Date().toISOString().slice(0, 10) ||
        nights < 1 ||
        nights > 90
      )
        throw new BadRequestException(
          'فترة الإقامة من ليلة إلى 90 ليلة في المستقبل',
        );
      const amount = BigInt(unit.night_price) * BigInt(nights);
      const b = (
        await db.query(
          'INSERT INTO boarding_bookings(unit_id,pet_id,user_id,starts_on,ends_on,total_minor,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [unitId, petId, actor, start, end, amount.toString(), key],
        )
      ).rows[0];
      await post(
        db,
        actor,
        await entity(db, unit.clinic_id),
        `boarding:${b.id}`,
        'إقامة اختبارية مؤجلة',
        [
          { account: '1200', debit: amount },
          { account: '2100', credit: amount },
        ],
      );
      await post(
        db,
        actor,
        await entity(db, null),
        `boarding:${b.id}`,
        'تحصيل إقامة اختباري',
        [
          { account: '1100', debit: amount },
          { account: '2000', credit: amount, partyId: unit.clinic_id },
        ],
      );
      await audit(db, actor, 'services.boarding_booked', unit.clinic_id, {
        bookingId: b.id,
      });
      return b;
    });
  }
  async cancelBoarding(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const b = (
        await db.query(
          'SELECT b.*,u.clinic_id FROM boarding_bookings b JOIN boarding_units u ON u.id=b.unit_id WHERE b.id=$1 FOR UPDATE OF b',
          [id],
        )
      ).rows[0];
      if (!b) throw new NotFoundException();
      await this.care.pet(db, actor, b.pet_id, 'booking');
      if (b.status !== 'confirmed')
        throw new ConflictException('الإلغاء قبل تسجيل الوصول فقط');
      const amount = BigInt(b.total_minor);
      await post(
        db,
        actor,
        await entity(db, b.clinic_id),
        `boarding-cancel:${id}`,
        'إلغاء إقامة قبل الحضور',
        [
          { account: '2100', debit: amount },
          { account: '1200', credit: amount },
        ],
      );
      await post(
        db,
        actor,
        await entity(db, null),
        `boarding-cancel:${id}`,
        'رد إقامة اختباري',
        [
          { account: '2000', debit: amount, partyId: b.clinic_id },
          { account: '1100', credit: amount },
        ],
      );
      await db.query(
        "UPDATE boarding_bookings SET status='cancelled' WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'services.boarding_cancelled', b.clinic_id, {
        bookingId: id,
      });
      return { status: 'cancelled' };
    });
  }
  async transition(
    actor: string,
    clinic: string,
    id: string,
    status: 'checked_in' | 'completed',
    healthReviewed: boolean,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const m = await this.org.membership(actor, clinic, undefined, db);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'receptionist', 'doctor_member'].includes(c),
        )
      )
        throw new ForbiddenException();
      const b = (
        await db.query(
          'SELECT b.*,u.clinic_id,b.starts_on::text,b.ends_on::text FROM boarding_bookings b JOIN boarding_units u ON u.id=b.unit_id WHERE b.id=$1 AND u.clinic_id=$2 FOR UPDATE OF b',
          [id, clinic],
        )
      ).rows[0];
      if (
        !b ||
        b.status !== (status === 'checked_in' ? 'confirmed' : 'checked_in')
      )
        throw new ConflictException();
      if (
        status === 'checked_in' &&
        (!healthReviewed || b.starts_on > new Date().toISOString().slice(0, 10))
      )
        throw new ConflictException(
          'يتطلب الحضور حلول تاريخ الوصول ومراجعة المتطلبات الصحية',
        );
      if (status === 'completed') {
        const amount = BigInt(b.total_minor);
        await post(
          db,
          actor,
          await entity(db, clinic),
          `boarding-complete:${id}`,
          'إقامة منفذة',
          [
            { account: '2100', debit: amount },
            { account: '4100', credit: amount },
          ],
        );
      }
      await db.query('UPDATE boarding_bookings SET status=$2 WHERE id=$1', [
        id,
        status,
      ]);
      await audit(db, actor, `services.boarding_${status}`, clinic, {
        bookingId: id,
      });
      return { status };
    });
  }
  async messages(actor: string, id: string, body?: string, key?: string) {
    return transaction(async (db) => {
      const a = (await db.query('SELECT * FROM appointments WHERE id=$1', [id]))
        .rows[0];
      if (!a) throw new NotFoundException();
      if (a.doctor_id === actor)
        await this.care.medical(db, actor, a.pet_id, a.clinic_id);
      else await this.care.pet(db, actor, a.pet_id, 'medical');
      await audit(db, actor, 'medical.conversation_read', a.clinic_id, {
        appointmentId: id,
      });
      if (body) {
        const existing = (
          await db.query(
            'SELECT * FROM care_messages WHERE actor_id=$1 AND idempotency_key=$2',
            [actor, key],
          )
        ).rows[0];
        if (existing) {
          if (existing.appointment_id !== id || existing.body !== body)
            throw new ConflictException();
          return existing;
        }
        return (
          await db.query(
            'INSERT INTO care_messages(appointment_id,actor_id,body,idempotency_key) VALUES($1,$2,$3,$4) RETURNING *',
            [id, actor, body, key],
          )
        ).rows[0];
      }
      return (
        await db.query(
          'SELECT m.id,m.actor_id,m.body,m.created_at,u.name FROM care_messages m JOIN auth_users u ON u.id=m.actor_id WHERE appointment_id=$1 ORDER BY m.created_at LIMIT 200',
          [id],
        )
      ).rows;
    });
  }
  async transfer(actor: string, petId: string, email: string) {
    return transaction(async (db) => {
      await this.care.pet(db, actor, petId, 'profile', true);
      const user = (
        await db.query(
          'SELECT id FROM auth_users WHERE lower(email)=$1 AND "emailVerified"',
          [email.toLowerCase()],
        )
      ).rows[0];
      if (!user || user.id === actor)
        throw new BadRequestException('أدخل حسابًا موثقًا آخر');
      await db.query(
        "UPDATE pet_transfers SET status='cancelled' WHERE pet_id=$1 AND status='pending'",
        [petId],
      );
      const t = (
        await db.query(
          'INSERT INTO pet_transfers(pet_id,from_id,to_id) VALUES($1,$2,$3) RETURNING *',
          [petId, actor, user.id],
        )
      ).rows[0];
      await audit(db, actor, 'pet.transfer_requested', null, {
        transferId: t.id,
      });
      return t;
    });
  }
  async acceptTransfer(actor: string, id: string) {
    return transaction(async (db) => {
      const loc = (
        await db.query('SELECT pet_id FROM pet_transfers WHERE id=$1', [id])
      ).rows[0];
      if (!loc) throw new NotFoundException();
      await db.query('SELECT id FROM pets WHERE id=$1 FOR UPDATE', [
        loc.pet_id,
      ]);
      const t = (
        await db.query(
          'SELECT t.*,p.owner_id FROM pet_transfers t JOIN pets p ON p.id=t.pet_id WHERE t.id=$1 FOR UPDATE OF t',
          [id],
        )
      ).rows[0];
      if (t.to_id !== actor) throw new NotFoundException();
      if (
        t.status !== 'pending' ||
        new Date(t.expires_at) <= new Date() ||
        t.owner_id !== t.from_id
      )
        throw new ConflictException('النقل لم يعد متاحًا');
      if (
        (
          await db.query(
            "SELECT 1 FROM appointments WHERE pet_id=$1 AND status='confirmed'",
            [t.pet_id],
          )
        ).rowCount ||
        (
          await db.query(
            "SELECT 1 FROM boarding_bookings WHERE pet_id=$1 AND status IN ('confirmed','checked_in')",
            [t.pet_id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'أكمل أو ألغِ الحجوزات النشطة قبل نقل الملكية',
        );
      await db.query(
        'UPDATE pets SET owner_id=$2,version=version+1 WHERE id=$1',
        [t.pet_id, actor],
      );
      await db.query(
        'UPDATE pet_guardians SET revoked_at=now() WHERE pet_id=$1',
        [t.pet_id],
      );
      await db.query(
        'UPDATE medical_consents SET revoked_at=now() WHERE pet_id=$1',
        [t.pet_id],
      );
      await db.query("UPDATE pet_transfers SET status='accepted' WHERE id=$1", [
        id,
      ]);
      await db.query(
        "UPDATE adoption_listings SET status='removed',version=version+1 WHERE pet_id=$1 AND status IN ('pending','active','paused')",
        [t.pet_id],
      );
      await db.query(
        'INSERT INTO pet_ownership_history(pet_id,from_id,to_id,transfer_id) VALUES($1,$2,$3,$4)',
        [t.pet_id, t.from_id, actor, id],
      );
      await audit(db, actor, 'pet.ownership_transferred', null, {
        petId: t.pet_id,
        transferId: id,
      });
      await emit(db, actor, 'PetOwnershipTransferred', id, 1);
      return { status: 'accepted', petId: t.pet_id };
    });
  }
  async weight(actor: string, petId: string, grams?: number, date?: string) {
    return transaction(async (db) => {
      await this.care.pet(db, actor, petId, 'medical');
      if (grams) {
        if (date! > new Date().toISOString().slice(0, 10))
          throw new BadRequestException();
        await db.query(
          'INSERT INTO pet_weights(pet_id,actor_id,grams,measured_on) VALUES($1,$2,$3,$4)',
          [petId, actor, grams, date],
        );
        await db.query(
          'UPDATE pets SET weight_grams=$2,version=version+1 WHERE id=$1',
          [petId, grams],
        );
        await audit(db, actor, 'pet.weight_recorded', null, { petId });
      }
      return (
        await db.query(
          'SELECT id,grams,measured_on::text FROM pet_weights WHERE pet_id=$1 ORDER BY measured_on DESC LIMIT 100',
          [petId],
        )
      ).rows;
    });
  }
}
