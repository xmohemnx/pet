import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { CareService } from '../care/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';

export interface BoardingUnitInput {
  name: string;
  species: string;
  nightPrice: string;
  maxWeightGrams: number | null;
  vaccinesRequired: boolean;
  healthRequirements: string;
}
export interface BoardingReviewInput {
  version: number;
  decision: 'approved' | 'rejected';
  weightGrams: number;
  vaccinesChecked: boolean;
  validThrough: string;
  notes: string;
  idempotencyKey: string;
}
export interface BoardingLogInput {
  kind: 'incident' | 'resolution';
  severity: 'low' | 'attention' | 'urgent';
  body: string;
  resolvesId: string | null;
  idempotencyKey: string;
}
const hash = (input: object) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');
const columns = `b.*,b.total_minor::text,b.night_price::text,b.starts_on::text,b.ends_on::text,u.clinic_id,c.name clinic_name,r.decision review_decision,r.valid_through::text review_valid_through`;
const from = `FROM boarding_bookings b JOIN boarding_units u ON u.id=b.unit_id JOIN clinics c ON c.id=u.clinic_id LEFT JOIN boarding_admission_reviews r ON r.id=b.review_id`;
const clinician = `EXISTS(SELECT 1 FROM professional_profiles pp JOIN doctor_affiliations f ON f.doctor_id=pp.user_id JOIN clinic_memberships m ON m.user_id=pp.user_id AND m.clinic_id=f.clinic_id JOIN clinics c ON c.id=m.clinic_id WHERE pp.user_id=$1 AND pp.kind='doctor' AND pp.status='verified' AND f.clinic_id=$2 AND f.status='approved' AND m.revoked_at IS NULL AND 'doctor_member'=ANY(m.capabilities) AND c.verification_status='verified')`;

@Injectable()
export class BoardingService {
  constructor(
    private readonly org: OrganizationService,
    private readonly care: CareService,
  ) {}
  private async staff(db: PoolClient, actor: string, clinic: string) {
    await this.org.membership(actor, clinic, undefined, db);
    const m = (
      await db.query(
        'SELECT capabilities FROM clinic_memberships WHERE user_id=$1 AND clinic_id=$2 AND revoked_at IS NULL FOR SHARE',
        [actor, clinic],
      )
    ).rows[0];
    if (!m) throw new ForbiddenException();
    const doctor = (await db.query(`SELECT ${clinician} ok`, [actor, clinic]))
      .rows[0].ok as boolean;
    const admin = m.capabilities.includes('clinic_admin') as boolean;
    if (
      !doctor &&
      !m.capabilities.some((c: string) =>
        ['clinic_admin', 'receptionist', 'service_staff'].includes(c),
      )
    )
      throw new ForbiddenException('إدارة الإقامة لفريق التشغيل المخول');
    return { doctor, admin, operator: true };
  }
  private async scope(db: PoolClient, id: string) {
    const b = (await db.query(`SELECT ${columns} ${from} WHERE b.id=$1`, [id]))
      .rows[0];
    if (!b) throw new NotFoundException();
    return b;
  }
  private async locked(db: PoolClient, id: string) {
    const b = await this.scope(db, id);
    const p = (
      await db.query('SELECT * FROM pets WHERE id=$1 FOR UPDATE', [b.pet_id])
    ).rows[0];
    const current = (
      await db.query(
        `SELECT ${columns} ${from} WHERE b.id=$1 FOR UPDATE OF b`,
        [id],
      )
    ).rows[0];
    return { b: current, p };
  }
  private async today(db: PoolClient) {
    return (
      await db.query(
        "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Baghdad')::date::text today",
      )
    ).rows[0].today as string;
  }
  private async changed(
    db: PoolClient,
    actor: string,
    clinic: string,
    id: string,
    version: number,
    action: string,
  ) {
    await audit(db, actor, `boarding.${action}`, clinic, { bookingId: id });
    await emit(db, actor, `Boarding${action}`, id, version, clinic);
  }
  management(actor: string, clinic: string) {
    return transaction(async (db) => {
      const access = await this.staff(db, actor, clinic);
      const bookings = (
        await db.query(
          `SELECT ${columns} ${from} WHERE u.clinic_id=$1 ORDER BY b.created_at DESC,b.id LIMIT 200`,
          [clinic],
        )
      ).rows;
      await audit(db, actor, 'boarding.management_viewed', clinic, {
        bookingIds: bookings.map((b) => b.id),
      });
      return {
        access,
        bookings,
        units: (
          await db.query(
            'SELECT *,night_price::text FROM boarding_units WHERE clinic_id=$1 ORDER BY name LIMIT 200',
            [clinic],
          )
        ).rows,
      };
    });
  }
  detail(actor: string, id: string) {
    return transaction(async (db) => {
      const b = await this.scope(db, id);
      let access = {
        owner: false,
        doctor: false,
        admin: false,
        operator: false,
      };
      if (b.user_id === actor) {
        const p = await this.care.pet(db, actor, b.pet_id, 'profile', true);
        if (p.archived_at) throw new NotFoundException();
        access.owner = true;
      } else
        access = { ...access, ...(await this.staff(db, actor, b.clinic_id)) };
      const reviews = (
        await db.query(
          `SELECT r.id,r.doctor_id,u.name doctor_name,r.decision,r.valid_through::text,r.created_at,CASE WHEN $2 THEN r.weight_grams END weight_grams,CASE WHEN $2 THEN r.vaccines_checked END vaccines_checked,CASE WHEN $2 THEN r.notes END notes FROM boarding_admission_reviews r JOIN auth_users u ON u.id=r.doctor_id WHERE r.booking_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 100`,
          [id, access.owner || access.doctor],
        )
      ).rows;
      const incidents = (
        await db.query(
          'SELECT i.id,i.kind,i.severity,i.body,i.resolves_id,i.created_at,u.name actor_name FROM boarding_incident_log i JOIN auth_users u ON u.id=i.actor_id WHERE i.booking_id=$1 ORDER BY i.created_at,i.id LIMIT 500',
          [id],
        )
      ).rows;
      await audit(db, actor, 'boarding.detail_viewed', b.clinic_id, {
        bookingId: id,
      });
      return { booking: b, access, reviews, incidents };
    });
  }
  unit(actor: string, clinic: string, i: BoardingUnitInput) {
    return transaction(async (db) => {
      if (!(await this.staff(db, actor, clinic)).admin)
        throw new ForbiddenException();
      const u = (
        await db.query(
          'INSERT INTO boarding_units(clinic_id,name,species,night_price,max_weight_grams,vaccines_required,health_requirements) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,version',
          [
            clinic,
            i.name,
            i.species,
            i.nightPrice,
            i.maxWeightGrams,
            i.vaccinesRequired,
            i.healthRequirements,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'boarding.unit_created', clinic, { unitId: u.id });
      await emit(db, actor, 'BoardingUnitCreated', u.id, 1, clinic);
      return u;
    });
  }
  availability(
    actor: string,
    clinic: string,
    id: string,
    version: number,
    active: boolean,
  ) {
    return transaction(async (db) => {
      if (!(await this.staff(db, actor, clinic)).admin)
        throw new ForbiddenException();
      const u = (
        await db.query(
          'UPDATE boarding_units SET active=$4,version=version+1 WHERE id=$1 AND clinic_id=$2 AND version=$3 RETURNING id,version,active',
          [id, clinic, version, active],
        )
      ).rows[0];
      if (!u) throw new ConflictException('حدّث الوحدات قبل تغيير الإتاحة');
      await audit(db, actor, 'boarding.unit_availability', clinic, {
        unitId: id,
        active,
      });
      await emit(db, actor, 'BoardingUnitAvailability', id, u.version, clinic);
      return u;
    });
  }
  book(
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
      const p = await this.care.pet(db, actor, petId, 'profile', true);
      if (p.archived_at) throw new ConflictException('الحيوان مؤرشف');
      const old = (
        await db.query(
          'SELECT id,unit_id,pet_id,starts_on::text,ends_on::text FROM boarding_bookings WHERE user_id=$1 AND idempotency_key=$2',
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
          throw new ConflictException('المفتاح مستخدم لحجز مختلف');
        return { id: old.id };
      }
      const u = (
        await db.query(
          "SELECT u.* FROM boarding_units u JOIN clinics c ON c.id=u.clinic_id WHERE u.id=$1 AND u.active AND c.verification_status='verified' FOR SHARE OF u,c",
          [unitId],
        )
      ).rows[0];
      if (!u || u.species !== p.species)
        throw new BadRequestException('الوحدة لا تطابق نوع الحيوان');
      const today = await this.today(db),
        nights = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (
        start < today ||
        Date.parse(start) > Date.parse(today) + 365 * 86400000 ||
        nights < 1 ||
        nights > 90
      )
        throw new BadRequestException('الحجز خلال سنة ومن ليلة إلى تسعين ليلة');
      const amount = BigInt(u.night_price) * BigInt(nights);
      const b = (
        await db.query(
          'INSERT INTO boarding_bookings(unit_id,pet_id,user_id,starts_on,ends_on,total_minor,idempotency_key,unit_name,pet_name,night_price,max_weight_grams,vaccines_required,health_requirements,policy_accepted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) RETURNING id,version',
          [
            unitId,
            petId,
            actor,
            start,
            end,
            amount.toString(),
            key,
            u.name,
            p.name,
            u.night_price,
            u.max_weight_grams,
            u.vaccines_required,
            u.health_requirements,
          ],
        )
      ).rows[0];
      await post(
        db,
        actor,
        await entity(db, u.clinic_id),
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
          { account: '2000', credit: amount, partyId: u.clinic_id },
        ],
      );
      await this.changed(db, actor, u.clinic_id, b.id, 1, 'Booked');
      return { id: b.id };
    });
  }
  acceptPolicy(actor: string, id: string, version: number) {
    return transaction(async (db) => {
      const { b, p } = await this.locked(db, id);
      if (b.user_id !== actor || p.owner_id !== actor || p.archived_at)
        throw new NotFoundException();
      if (b.policy_accepted) return { id };
      if (b.status !== 'confirmed' || b.version !== version)
        throw new ConflictException();
      await db.query(
        'UPDATE boarding_bookings SET policy_accepted=true,version=version+1 WHERE id=$1',
        [id],
      );
      await this.changed(
        db,
        actor,
        b.clinic_id,
        id,
        b.version + 1,
        'PolicyAccepted',
      );
      return { id };
    });
  }
  review(actor: string, clinic: string, id: string, i: BoardingReviewInput) {
    return transaction(async (db) => {
      const { b, p } = await this.locked(db, id);
      if (b.clinic_id !== clinic) throw new NotFoundException();
      await this.care.doctor(db, actor, clinic);
      if (p.owner_id !== b.user_id || p.archived_at || !b.policy_accepted)
        throw new ConflictException(
          'يلزم المالك الأصلي الحالي وقبول شروط الإقامة',
        );
      const { idempotencyKey, ...payload } = i,
        signature = hash(payload);
      const old = (
        await db.query(
          'SELECT id,request_hash FROM boarding_admission_reviews WHERE booking_id=$1 AND doctor_id=$2 AND idempotency_key=$3',
          [id, actor, idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== signature) throw new ConflictException();
        return { id: old.id };
      }
      if (b.status !== 'confirmed' || b.version !== i.version)
        throw new ConflictException('المراجعة قبل الوصول؛ حدّث الحجز');
      if (
        i.validThrough < (await this.today(db)) ||
        Date.parse(i.validThrough) > Date.now() + 730 * 86400000
      )
        throw new BadRequestException('تحقق من صلاحية المراجعة');
      if (
        i.decision === 'approved' &&
        (i.validThrough < b.ends_on ||
          (b.max_weight_grams && i.weightGrams > b.max_weight_grams) ||
          (b.vaccines_required && !i.vaccinesChecked))
      )
        throw new ConflictException(
          'الوزن أو اللقاح أو الصلاحية لا يحقق شروط الوحدة',
        );
      if (
        (
          await db.query(
            'SELECT count(*)::int n FROM boarding_admission_reviews WHERE booking_id=$1',
            [id],
          )
        ).rows[0].n >= 100
      )
        throw new ConflictException('بلغ الحجز حد المراجعات');
      const r = (
        await db.query(
          'INSERT INTO boarding_admission_reviews(booking_id,doctor_id,decision,weight_grams,vaccines_checked,valid_through,notes,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
          [
            id,
            actor,
            i.decision,
            i.weightGrams,
            i.vaccinesChecked,
            i.validThrough,
            i.notes,
            idempotencyKey,
            signature,
          ],
        )
      ).rows[0];
      await db.query(
        'UPDATE boarding_bookings SET review_id=$2,version=version+1 WHERE id=$1',
        [id, r.id],
      );
      await this.changed(db, actor, clinic, id, b.version + 1, 'Reviewed');
      return r;
    });
  }
  transition(
    actor: string,
    clinic: string,
    id: string,
    status: 'checked_in' | 'completed',
    version: number,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const { b, p } = await this.locked(db, id);
      if (b.clinic_id !== clinic) throw new NotFoundException();
      await this.staff(db, actor, clinic);
      if (b.status === status) return { status };
      if (
        b.version !== version ||
        b.status !== (status === 'checked_in' ? 'confirmed' : 'checked_in')
      )
        throw new ConflictException('انتقال غير صالح أو نسخة قديمة');
      if (status === 'checked_in') {
        const day = await this.today(db);
        if (
          p.owner_id !== b.user_id ||
          p.archived_at ||
          !b.policy_accepted ||
          b.starts_on > day ||
          b.ends_on <= day ||
          b.review_decision !== 'approved' ||
          b.review_valid_through < b.ends_on
        )
          throw new ConflictException(
            'يلزم حلول فترة الإقامة ومالك حالي وقبول طبي ساري',
          );
        if (
          (
            await db.query(
              "SELECT 1 FROM boarding_bookings WHERE status='checked_in' AND id<>$1 AND (unit_id=$2 OR pet_id=$3)",
              [id, b.unit_id, b.pet_id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'يلزم تسجيل مغادرة الإقامة السابقة قبل وصول الحيوان',
          );
        const r = (
          await db.query(
            'SELECT doctor_id FROM boarding_admission_reviews WHERE id=$1',
            [b.review_id],
          )
        ).rows[0];
        await this.care.doctor(db, r.doctor_id, clinic);
      } else {
        if (
          (
            await db.query(
              "SELECT 1 FROM boarding_incident_log i WHERE booking_id=$1 AND kind='incident' AND severity='urgent' AND NOT EXISTS(SELECT 1 FROM boarding_incident_log r WHERE r.resolves_id=i.id)",
              [id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'عالج الحادث العاجل وسجل حله قبل المغادرة',
          );
        const amount = BigInt(b.total_minor);
        await post(
          db,
          actor,
          await entity(db, clinic),
          `boarding-complete:${id}`,
          'إتمام عقد إقامة اختباري',
          [
            { account: '2100', debit: amount },
            { account: '4100', credit: amount },
          ],
        );
      }
      await db.query(
        "UPDATE boarding_bookings SET status=$2,version=version+1,checked_in_at=CASE WHEN $2='checked_in' THEN now() ELSE checked_in_at END,checked_out_at=CASE WHEN $2='completed' THEN now() ELSE checked_out_at END WHERE id=$1",
        [id, status],
      );
      await this.changed(
        db,
        actor,
        clinic,
        id,
        b.version + 1,
        status === 'checked_in' ? 'CheckedIn' : 'Completed',
      );
      return { status };
    });
  }
  log(actor: string, clinic: string, id: string, i: BoardingLogInput) {
    return transaction(async (db) => {
      const { b } = await this.locked(db, id);
      if (b.clinic_id !== clinic) throw new NotFoundException();
      const access = await this.staff(db, actor, clinic);
      const { idempotencyKey, ...payload } = i,
        signature = hash(payload);
      const old = (
        await db.query(
          'SELECT id,request_hash FROM boarding_incident_log WHERE booking_id=$1 AND actor_id=$2 AND idempotency_key=$3',
          [id, actor, idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== signature) throw new ConflictException();
        return { id: old.id };
      }
      if (b.status !== 'checked_in')
        throw new ConflictException('سجل الحوادث أثناء الإقامة فقط');
      if (i.kind === 'resolution') {
        const incident = (
          await db.query(
            "SELECT severity FROM boarding_incident_log WHERE id=$1 AND booking_id=$2 AND kind='incident' AND NOT EXISTS(SELECT 1 FROM boarding_incident_log r WHERE r.resolves_id=$1)",
            [i.resolvesId, id],
          )
        ).rows[0];
        if (!incident || incident.severity !== i.severity)
          throw new ConflictException('الحادث غير متاح للحل');
        if (incident.severity === 'urgent') {
          if (!access.doctor)
            throw new ForbiddenException('حل العاجل لطبيب مخول');
          await this.care.doctor(db, actor, clinic);
        }
      } else if (i.resolvesId) throw new BadRequestException();
      if (
        i.kind === 'incident' &&
        (
          await db.query(
            "SELECT count(*)::int n FROM boarding_incident_log WHERE booking_id=$1 AND kind='incident'",
            [id],
          )
        ).rows[0].n >= 200
      )
        throw new ConflictException('بلغ الحجز حد الحوادث');
      const r = (
        await db.query(
          'INSERT INTO boarding_incident_log(booking_id,actor_id,kind,severity,body,resolves_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            id,
            actor,
            i.kind,
            i.severity,
            i.body,
            i.resolvesId,
            idempotencyKey,
            signature,
          ],
        )
      ).rows[0];
      await db.query(
        'UPDATE boarding_bookings SET version=version+1 WHERE id=$1',
        [id],
      );
      await this.changed(
        db,
        actor,
        clinic,
        id,
        b.version + 1,
        i.kind === 'incident' ? 'IncidentLogged' : 'IncidentResolved',
      );
      return r;
    });
  }
  cancel(actor: string, id: string, clinic?: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const { b, p } = await this.locked(db, id);
      if (clinic) {
        if (b.clinic_id !== clinic) throw new NotFoundException();
        if (!(await this.staff(db, actor, clinic)).admin)
          throw new ForbiddenException();
      } else if (b.user_id !== actor || p.owner_id !== actor || p.archived_at)
        throw new NotFoundException();
      if (b.status === 'cancelled') return { status: 'cancelled' };
      if (b.status !== 'confirmed')
        throw new ConflictException('الرد الكامل قبل الوصول فقط');
      const platform = await entity(db, null),
        amount = BigInt(b.total_minor);
      const balance = (
        await db.query(
          "SELECT coalesce((SELECT sum(l.credit-l.debit) FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.party_id=$2 AND l.account_code='2000' AND j.status='posted'),0)-coalesce((SELECT sum(amount_minor) FROM sandbox_payouts WHERE kind='clinic' AND party_id=$2 AND status='pending'),0) amount",
          [platform, b.clinic_id],
        )
      ).rows[0].amount;
      if (BigInt(balance) < amount)
        throw new ConflictException('يلزم تسوية مستحق العيادة قبل الرد');
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
        platform,
        `boarding-cancel:${id}`,
        'رد إقامة اختباري',
        [
          { account: '2000', debit: amount, partyId: b.clinic_id },
          { account: '1100', credit: amount },
        ],
      );
      await db.query(
        "UPDATE boarding_bookings SET status='cancelled',version=version+1 WHERE id=$1",
        [id],
      );
      await this.changed(
        db,
        actor,
        b.clinic_id,
        id,
        b.version + 1,
        'Cancelled',
      );
      return { status: 'cancelled' };
    });
  }
}
