import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { CareService } from '../care/service.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';
import { lockScheduling, availableTime } from '../care/calendar.js';
export interface GroomingAddon {
  code: string;
  name: string;
  priceMinor: string;
  minutes: number;
}
export interface GroomingBookingInput {
  slotId: string;
  petId: string;
  addonCodes: string[];
  priceMinor: string;
  photosConsent: boolean;
  idempotencyKey: string;
}
const digest = (i: unknown) =>
  createHash('sha256').update(JSON.stringify(i)).digest('hex');
export const groomingPhotoAccessSql = `SELECT 1 FROM grooming_photos gp JOIN grooming_bookings b ON b.id=gp.booking_id JOIN pets p ON p.id=b.pet_id JOIN clinics c ON c.id=b.clinic_id WHERE gp.asset_id=$2 AND b.photos_consent AND b.status='completed' AND ((b.user_id=$1 AND (p.owner_id=$1 OR EXISTS(SELECT 1 FROM pet_guardians g WHERE g.pet_id=p.id AND g.user_id=$1 AND g.revoked_at IS NULL AND 'booking'=ANY(g.scopes)))) OR (c.verification_status='verified' AND EXISTS(SELECT 1 FROM clinic_memberships m WHERE m.clinic_id=b.clinic_id AND m.user_id=$1 AND m.revoked_at IS NULL AND ('clinic_admin'=ANY(m.capabilities) OR (b.staff_id=$1 AND 'service_staff'=ANY(m.capabilities))))))`;
@Injectable()
export class GroomingService {
  constructor(
    private readonly care: CareService,
    private readonly org: OrganizationService,
  ) {}
  async staff(
    db: PoolClient,
    actor: string,
    clinic: string,
    assigned?: string,
  ) {
    const m = await this.org.membership(actor, clinic, undefined, db);
    if (
      !m.capabilities.includes('clinic_admin') &&
      !(
        m.capabilities.includes('service_staff') &&
        (!assigned || assigned === actor)
      )
    )
      throw new ForbiddenException('يلزم موظف الخدمة المعين أو مدير العيادة');
    if (
      !(
        await db.query(
          "SELECT 1 FROM clinic_memberships WHERE user_id=$1 AND clinic_id=$2 AND revoked_at IS NULL AND capabilities && ARRAY['clinic_admin','service_staff'] FOR SHARE",
          [actor, clinic],
        )
      ).rowCount
    )
      throw new ForbiddenException();
    return m;
  }
  catalog() {
    return transaction(async (db) => ({
      services: (
        await db.query(
          "SELECT s.*,s.price_minor::text,c.name clinic_name,b.name branch_name,b.city FROM grooming_services s JOIN clinics c ON c.id=s.clinic_id JOIN clinic_branches b ON b.id=s.branch_id WHERE s.active AND c.verification_status='verified' ORDER BY s.name,s.id LIMIT 200",
        )
      ).rows,
      slots: (
        await db.query(
          "SELECT sl.id,sl.service_id,sl.starts_at,sl.ends_at,u.name staff_name,r.name resource_name FROM grooming_slots sl JOIN grooming_services s ON s.id=sl.service_id JOIN clinics c ON c.id=sl.clinic_id JOIN auth_users u ON u.id=sl.staff_id JOIN clinic_memberships m ON m.user_id=sl.staff_id AND m.clinic_id=sl.clinic_id JOIN clinic_resources r ON r.id=sl.resource_id WHERE sl.active AND s.active AND r.active AND m.revoked_at IS NULL AND m.capabilities && ARRAY['clinic_admin','service_staff'] AND c.verification_status='verified' AND sl.starts_at>now()+interval '5 minutes' AND sl.starts_at<=now()+interval '90 days' AND NOT EXISTS(SELECT 1 FROM clinic_booking_occupancy o WHERE o.active AND (o.staff_id=sl.staff_id OR o.resource_id=sl.resource_id) AND tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(sl.starts_at,sl.ends_at,'[)')) ORDER BY sl.starts_at,sl.id LIMIT 500",
        )
      ).rows,
    }));
  }
  mine(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT b.*,b.total_minor::text,p.name pet_name,u.name staff_name,r.name resource_name,c.name clinic_name,(SELECT jsonb_build_object('rating',v.rating,'body',v.body) FROM grooming_reviews v WHERE v.booking_id=b.id) review,CASE WHEN b.photos_consent THEN coalesce((SELECT jsonb_agg(g.asset_id) FROM grooming_photos g WHERE g.booking_id=b.id),'[]') ELSE '[]'::jsonb END photos FROM grooming_bookings b JOIN pets p ON p.id=b.pet_id JOIN auth_users u ON u.id=b.staff_id JOIN clinic_resources r ON r.id=b.resource_id JOIN clinics c ON c.id=b.clinic_id WHERE b.user_id=$1 AND (p.owner_id=$1 OR EXISTS(SELECT 1 FROM pet_guardians g WHERE g.pet_id=p.id AND g.user_id=$1 AND g.revoked_at IS NULL AND 'booking'=ANY(g.scopes))) ORDER BY b.created_at DESC LIMIT 200`,
            [actor],
          )
        ).rows,
    );
  }
  management(actor: string, clinic: string) {
    return transaction(async (db) => {
      const m = await this.org.membership(actor, clinic, undefined, db);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'receptionist', 'service_staff'].includes(c),
        )
      )
        throw new ForbiddenException();
      return {
        services: (
          await db.query(
            'SELECT *,price_minor::text FROM grooming_services WHERE clinic_id=$1 ORDER BY name',
            [clinic],
          )
        ).rows,
        branches: (
          await db.query(
            'SELECT id,name FROM clinic_branches WHERE clinic_id=$1 ORDER BY name',
            [clinic],
          )
        ).rows,
        resources: (
          await db.query(
            'SELECT id,branch_id,name FROM clinic_resources WHERE clinic_id=$1 AND active ORDER BY name',
            [clinic],
          )
        ).rows,
        staff: (
          await db.query(
            "SELECT m.user_id id,u.name FROM clinic_memberships m JOIN auth_users u ON u.id=m.user_id WHERE m.clinic_id=$1 AND m.revoked_at IS NULL AND m.capabilities && ARRAY['clinic_admin','service_staff'] ORDER BY u.name",
            [clinic],
          )
        ).rows,
        slots: (
          await db.query(
            "SELECT sl.* FROM grooming_slots sl WHERE sl.clinic_id=$1 AND sl.starts_at>now()-interval '1 day' ORDER BY sl.starts_at LIMIT 500",
            [clinic],
          )
        ).rows,
        bookings: (
          await db.query(
            "SELECT b.*,b.total_minor::text,p.name pet_name,u.name staff_name,r.name resource_name,CASE WHEN b.photos_consent THEN coalesce((SELECT jsonb_agg(g.asset_id) FROM grooming_photos g WHERE g.booking_id=b.id),'[]') ELSE '[]'::jsonb END photos FROM grooming_bookings b JOIN pets p ON p.id=b.pet_id JOIN auth_users u ON u.id=b.staff_id JOIN clinic_resources r ON r.id=b.resource_id WHERE b.clinic_id=$1 AND ($3 OR b.staff_id=$2) ORDER BY b.starts_at DESC LIMIT 200",
            [
              clinic,
              actor,
              m.capabilities.some((c: string) =>
                ['clinic_admin', 'receptionist'].includes(c),
              ),
            ],
          )
        ).rows,
      };
    });
  }
  create(
    actor: string,
    clinic: string,
    i: {
      branchId: string;
      name: string;
      description: string;
      species: string[];
      priceMinor: string;
      minutes: number;
      addons: GroomingAddon[];
    },
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      if (
        BigInt(i.priceMinor) +
          i.addons.reduce((s, a) => s + BigInt(a.priceMinor), 0n) >
        999999999999n
      )
        throw new BadRequestException('إجمالي السعر يتجاوز الحد');
      if (
        new Set(i.addons.map((a) => a.code)).size !== i.addons.length ||
        i.minutes + i.addons.reduce((s, a) => s + a.minutes, 0) > 360
      )
        throw new BadRequestException('إضافات مكررة أو مدة تتجاوز ست ساعات');
      if (
        !(
          await db.query(
            'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2',
            [i.branchId, clinic],
          )
        ).rowCount
      )
        throw new BadRequestException('الفرع لا يتبع العيادة');
      const s = (
        await db.query(
          'INSERT INTO grooming_services(clinic_id,branch_id,name,description,species,price_minor,duration_minutes,addons) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            clinic,
            i.branchId,
            i.name,
            i.description,
            [...new Set(i.species)],
            i.priceMinor,
            i.minutes,
            JSON.stringify(i.addons),
          ],
        )
      ).rows[0];
      await audit(db, actor, 'grooming.service_created', clinic, {
        serviceId: s.id,
      });
      await emit(db, actor, 'GroomingServiceCreated', s.id, 1, clinic);
      return s;
    });
  }
  slot(
    actor: string,
    clinic: string,
    i: {
      serviceId: string;
      staffId: string;
      resourceId: string;
      startsAt: string;
      endsAt: string;
    },
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      await this.staff(db, i.staffId, clinic, i.staffId);
      const s = (
        await db.query(
          'SELECT * FROM grooming_services WHERE id=$1 AND clinic_id=$2 AND active',
          [i.serviceId, clinic],
        )
      ).rows[0];
      if (
        !s ||
        !(
          await db.query(
            'SELECT 1 FROM clinic_resources WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active',
            [i.resourceId, clinic, s.branch_id],
          )
        ).rowCount
      )
        throw new BadRequestException('الخدمة والغرفة يجب أن تتبعا الفرع نفسه');
      const start = Date.parse(i.startsAt),
        end = Date.parse(i.endsAt);
      if (
        start < Date.now() + 300000 ||
        start > Date.now() + 90 * 86400000 ||
        end - start < s.duration_minutes * 60000 ||
        end - start > 360 * 60000
      )
        throw new BadRequestException(
          'نافذة الموعد لا تطابق المدة أو مهلة 90 يوماً',
        );
      const sl = (
        await db.query(
          'INSERT INTO grooming_slots(service_id,clinic_id,branch_id,staff_id,resource_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            s.id,
            clinic,
            s.branch_id,
            i.staffId,
            i.resourceId,
            i.startsAt,
            i.endsAt,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'grooming.slot_created', clinic, {
        slotId: sl.id,
      });
      await emit(db, actor, 'GroomingSlotCreated', sl.id, 1, clinic);
      return sl;
    });
  }
  availability(
    actor: string,
    clinic: string,
    kind: 'service' | 'slot',
    id: string,
    active: boolean,
    version: number,
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const table = kind === 'service' ? 'grooming_services' : 'grooming_slots';
      const row = (
        await db.query(
          `UPDATE ${table} SET active=$3,version=version+1 WHERE id=$1 AND clinic_id=$2 AND version=$4 RETURNING version`,
          [id, clinic, active, version],
        )
      ).rows[0];
      if (!row)
        throw new ConflictException('حدث الخدمة أو الموعد قبل تغيير الإتاحة');
      await audit(db, actor, 'grooming.availability_updated', clinic, {
        kind,
        id,
        active,
      });
      await emit(
        db,
        actor,
        'GroomingAvailabilityUpdated',
        id,
        row.version,
        clinic,
      );
      return { active, version: row.version };
    });
  }
  book(actor: string, i: GroomingBookingInput) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const scope = (
        await db.query('SELECT clinic_id FROM grooming_slots WHERE id=$1', [
          i.slotId,
        ])
      ).rows[0];
      if (!scope) throw new ConflictException('الموعد غير متاح');
      await lockScheduling(db, scope.clinic_id);
      const pet = await this.care.pet(db, actor, i.petId, 'booking');
      if (pet.archived_at) throw new ConflictException('ملف الحيوان مؤرشف');
      const codes = [...i.addonCodes].sort();
      if (new Set(codes).size !== codes.length)
        throw new BadRequestException('إضافة مكررة');
      const hash = digest({ ...i, addonCodes: codes });
      const old = (
        await db.query(
          'SELECT * FROM grooming_bookings WHERE user_id=$1 AND idempotency_key=$2',
          [actor, i.idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new ConflictException('المفتاح مستخدم لمحتوى مختلف');
        return old;
      }
      const sl = (
        await db.query(
          "SELECT sl.*,s.name,s.price_minor,s.duration_minutes,s.species,s.addons FROM grooming_slots sl JOIN grooming_services s ON s.id=sl.service_id JOIN clinics c ON c.id=sl.clinic_id JOIN clinic_resources r ON r.id=sl.resource_id WHERE sl.id=$1 AND sl.active AND s.active AND r.active AND c.verification_status='verified' FOR UPDATE OF sl FOR SHARE OF s,c,r",
          [i.slotId],
        )
      ).rows[0];
      if (
        !sl ||
        new Date(sl.starts_at).getTime() < Date.now() + 300000 ||
        !sl.species.includes(pet.species)
      )
        throw new ConflictException('الموعد أو نوع الحيوان غير مؤهل');
      await this.staff(db, sl.staff_id, sl.clinic_id, sl.staff_id);
      const addons: GroomingAddon[] = codes.map((code) => {
        const a = sl.addons.find((a: GroomingAddon) => a.code === code);
        if (!a) throw new BadRequestException('إضافة غير متاحة');
        return a;
      });
      const amount =
          BigInt(sl.price_minor) +
          addons.reduce((s, a) => s + BigInt(a.priceMinor), 0n),
        minutes =
          sl.duration_minutes + addons.reduce((s, a) => s + a.minutes, 0);
      const end = new Date(new Date(sl.starts_at).getTime() + minutes * 60000);
      if (amount.toString() !== i.priceMinor || end > new Date(sl.ends_at))
        throw new ConflictException(
          'السعر أو مدة الإضافات تغيرا؛ راجع الاختيار',
        );
      await availableTime(db, sl.clinic_id, sl.staff_id, sl.starts_at, end);
      const b = (
        await db.query(
          'INSERT INTO grooming_bookings(slot_id,clinic_id,pet_id,user_id,staff_id,resource_id,service_name,total_minor,addons,starts_at,ends_at,photos_consent,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
          [
            sl.id,
            sl.clinic_id,
            i.petId,
            actor,
            sl.staff_id,
            sl.resource_id,
            sl.name,
            amount.toString(),
            JSON.stringify(addons),
            sl.starts_at,
            end.toISOString(),
            i.photosConsent,
            i.idempotencyKey,
            hash,
          ],
        )
      ).rows[0];
      await post(
        db,
        actor,
        await entity(db, sl.clinic_id),
        `grooming:${b.id}`,
        'تحصيل تجميل اختباري مؤجل',
        [
          { account: '1200', debit: amount },
          { account: '2100', credit: amount },
        ],
      );
      await post(
        db,
        actor,
        await entity(db, null),
        `grooming:${b.id}`,
        'تحصيل تجميل نيابة عن العيادة',
        [
          { account: '1100', debit: amount },
          { account: '2000', credit: amount, partyId: sl.clinic_id },
        ],
      );
      await audit(db, actor, 'grooming.booked', sl.clinic_id, {
        bookingId: b.id,
      });
      await emit(db, actor, 'GroomingBooked', b.id, 1, sl.clinic_id);
      return b;
    });
  }
  transition(
    actor: string,
    clinic: string,
    id: string,
    status: 'in_progress' | 'completed',
    photos: string[],
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const b = (
        await db.query(
          'SELECT * FROM grooming_bookings WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (!b) throw new NotFoundException();
      await this.staff(db, actor, clinic, b.staff_id);
      if (b.status === status) return { status };
      if (
        (status === 'in_progress' && b.status !== 'confirmed') ||
        (status === 'completed' && b.status !== 'in_progress')
      )
        throw new ConflictException('انتقال حالة غير صالح');
      if (
        status === 'in_progress' &&
        new Date(b.starts_at).getTime() > Date.now() + 1800000
      )
        throw new ConflictException(
          'بدء التنفيذ قبل الموعد بنصف ساعة كحد أقصى',
        );
      if (status === 'in_progress') {
        const pet = await this.care.pet(db, b.user_id, b.pet_id, 'booking');
        if (pet.archived_at) throw new ConflictException('ملف الحيوان مؤرشف');
      }
      if (
        photos.length &&
        (status !== 'completed' ||
          !b.photos_consent ||
          new Set(photos).size !== photos.length)
      )
        throw new BadRequestException('الصور عند الإتمام فقط وبموافقة العميل');
      for (const asset of photos) {
        if (
          !(
            await db.query(
              "SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND pet_id IS NULL AND kind='image' AND status='ready' FOR SHARE",
              [asset, actor],
            )
          ).rowCount
        )
          throw new BadRequestException('صورة إتمام غير متاحة');
        await db.query(
          'INSERT INTO grooming_photos(booking_id,asset_id) VALUES($1,$2)',
          [id, asset],
        );
      }
      if (status === 'completed') {
        const amount = BigInt(b.total_minor);
        await post(
          db,
          actor,
          await entity(db, clinic),
          `grooming-complete:${id}`,
          'اعتراف بخدمة تجميل منفذة',
          [
            { account: '2100', debit: amount },
            { account: '4100', credit: amount },
          ],
        );
      }
      await db.query(
        "UPDATE grooming_bookings SET status=$2,version=version+1,started_at=CASE WHEN $2='in_progress' THEN now() ELSE started_at END,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END WHERE id=$1",
        [id, status],
      );
      await audit(db, actor, `grooming.${status}`, clinic, { bookingId: id });
      await emit(db, actor, 'GroomingUpdated', id, b.version + 1, clinic);
      return { status };
    });
  }
  cancel(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const b = (
        await db.query(
          'SELECT * FROM grooming_bookings WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!b) throw new NotFoundException();
      if (b.user_id === actor)
        await this.care.pet(db, actor, b.pet_id, 'booking');
      else await this.org.membership(actor, b.clinic_id, 'clinic_admin', db);
      if (b.status === 'cancelled') return { status: 'cancelled' };
      if (
        b.status !== 'confirmed' ||
        (actor === b.user_id && new Date(b.starts_at) <= new Date())
      )
        throw new ConflictException('الإلغاء قبل بدء التنفيذ والموعد فقط');
      const platform = await entity(db, null),
        amount = BigInt(b.total_minor);
      const available = (
        await db.query(
          "SELECT coalesce((SELECT sum(l.credit-l.debit) FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.party_id=$2 AND l.account_code='2000' AND j.status='posted'),0)-coalesce((SELECT sum(amount_minor) FROM sandbox_payouts WHERE kind='clinic' AND party_id=$2 AND status='pending'),0) amount",
          [platform, b.clinic_id],
        )
      ).rows[0].amount;
      if (BigInt(available) < amount)
        throw new ConflictException('تحتاج العيادة تسوية المستحق قبل الرد');
      await post(
        db,
        actor,
        await entity(db, b.clinic_id),
        `grooming-cancel:${id}`,
        'إلغاء تجميل ورد المؤجل',
        [
          { account: '2100', debit: amount },
          { account: '1200', credit: amount },
        ],
      );
      await post(
        db,
        actor,
        platform,
        `grooming-cancel:${id}`,
        'رد تجميل اختباري',
        [
          { account: '2000', debit: amount, partyId: b.clinic_id },
          { account: '1100', credit: amount },
        ],
      );
      await db.query(
        "UPDATE grooming_bookings SET status='cancelled',version=version+1 WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'grooming.cancelled', b.clinic_id, {
        bookingId: id,
      });
      await emit(
        db,
        actor,
        'GroomingCancelled',
        id,
        b.version + 1,
        b.clinic_id,
      );
      return { status: 'cancelled' };
    });
  }
  withdrawPhotos(actor: string, id: string) {
    return transaction(async (db) => {
      const b = (
        await db.query(
          'SELECT * FROM grooming_bookings WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!b) throw new NotFoundException();
      await this.care.pet(db, actor, b.pet_id, 'booking');
      if (b.photos_consent) {
        await db.query(
          'UPDATE grooming_bookings SET photos_consent=false,version=version+1 WHERE id=$1',
          [id],
        );
        await audit(db, actor, 'grooming.photos_consent_revoked', b.clinic_id, {
          bookingId: id,
        });
        await emit(
          db,
          actor,
          'GroomingPhotosRevoked',
          id,
          b.version + 1,
          b.clinic_id,
        );
      }
      return { photosConsent: false };
    });
  }
  review(actor: string, id: string, i: { rating: number; body: string }) {
    return transaction(async (db) => {
      const b = (
        await db.query(
          "SELECT * FROM grooming_bookings WHERE id=$1 AND user_id=$2 AND status='completed' FOR SHARE",
          [id, actor],
        )
      ).rows[0];
      if (!b) throw new NotFoundException();
      await this.care.pet(db, actor, b.pet_id, 'booking');
      const v = (
        await db.query(
          'INSERT INTO grooming_reviews(booking_id,user_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING booking_id',
          [id, actor, i.rating, i.body],
        )
      ).rows[0];
      if (!v) throw new ConflictException('سبق تقييم هذا الحجز');
      await audit(db, actor, 'grooming.reviewed', b.clinic_id, {
        bookingId: id,
      });
      return i;
    });
  }
}
