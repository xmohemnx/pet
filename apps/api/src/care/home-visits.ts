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
import { CareService } from './service.js';
import { availableTime, lockScheduling } from './calendar.js';
import { entity, post, sandbox } from '../finance/ledger.js';
import { homeConsentSql, homeDoctorSql } from './home-execution.js';
export interface HomeOfferInput {
  branchId: string;
  serviceId: string;
  doctorId: string;
  name: string;
  description: string;
  city: string;
  district: string;
  species: string[];
  serviceMinor: string;
  travelMinor: string;
  travelMinutes: number;
}
export interface HomeBookingInput {
  slotId: string;
  petId: string;
  priceMinor: string;
  contactName: string;
  phone: string;
  addressLine: string;
  notes: string;
  addressConsent: true;
  medicalConsent: true;
  areaConfirmed: true;
  idempotencyKey: string;
}
const time = (value: string | Date) => new Date(value).getTime();
const activeDoctor = `EXISTS(SELECT 1 FROM professional_profiles pp JOIN doctor_affiliations f ON f.doctor_id=pp.user_id JOIN clinic_memberships m ON m.user_id=pp.user_id AND m.clinic_id=f.clinic_id WHERE pp.user_id=o.doctor_id AND pp.kind='doctor' AND pp.status='verified' AND f.clinic_id=o.clinic_id AND f.status='approved' AND m.revoked_at IS NULL AND 'doctor_member'=ANY(m.capabilities))`;
const offerColumns = `o.*,o.service_minor::text,o.travel_minor::text,o.total_minor::text,u.name doctor_name,c.name clinic_name,b.name branch_name,s.name service_name`;
const offerFrom = `FROM home_visit_offers o JOIN clinics c ON c.id=o.clinic_id JOIN auth_users u ON u.id=o.doctor_id JOIN clinic_branches b ON b.id=o.branch_id JOIN clinic_services s ON s.id=o.service_id`;
const readableAddress = `(${homeConsentSql}) AND (${homeDoctorSql})`;
const columns = `h.id,h.appointment_id,h.offer_id,h.clinic_id,h.doctor_id,h.pet_id,h.user_id,h.pet_name,h.service_name,h.city,h.district,h.service_minor::text,h.travel_minor::text,h.total_minor::text,h.status,h.version,h.created_at,h.departed_at,h.arrived_at,h.completed_at,h.cancelled_at,h.medical_consent_until,a.starts_at,a.ends_at,a.occupied_from,a.occupied_until,a.attendance_state,a.version appointment_version,u.name doctor_name,c.name clinic_name,o.name offer_name,(${readableAddress}) can_execute,
 CASE WHEN (h.user_id=$1 AND p.owner_id=$1 AND p.archived_at IS NULL) OR (${readableAddress}) THEN h.contact_name ELSE NULL END contact_name,
 CASE WHEN (h.user_id=$1 AND p.owner_id=$1 AND p.archived_at IS NULL) OR (${readableAddress}) THEN h.phone ELSE NULL END phone,
 CASE WHEN (h.user_id=$1 AND p.owner_id=$1 AND p.archived_at IS NULL) OR (${readableAddress}) THEN h.address_line ELSE NULL END address_line,
 CASE WHEN (h.user_id=$1 AND p.owner_id=$1 AND p.archived_at IS NULL) OR (${readableAddress}) THEN h.notes ELSE NULL END notes`;
const bookingFrom = `FROM home_visit_bookings h JOIN appointments a ON a.id=h.appointment_id JOIN pets p ON p.id=h.pet_id JOIN auth_users u ON u.id=h.doctor_id JOIN clinics c ON c.id=h.clinic_id JOIN home_visit_offers o ON o.id=h.offer_id`;
@Injectable()
export class HomeVisitsService {
  constructor(
    private readonly org: OrganizationService,
    private readonly care: CareService,
  ) {}
  async staff(db: PoolClient, actor: string, clinic: string) {
    await this.org.membership(actor, clinic, undefined, db);
    const m = (
      await db.query(
        'SELECT capabilities FROM clinic_memberships WHERE user_id=$1 AND clinic_id=$2 AND revoked_at IS NULL FOR SHARE',
        [actor, clinic],
      )
    ).rows[0];
    if (!m) throw new ForbiddenException();
    if (
      m.capabilities.some((c: string) =>
        ['clinic_admin', 'receptionist'].includes(c),
      )
    )
      return { all: true, admin: m.capabilities.includes('clinic_admin') };
    await this.care.doctor(db, actor, clinic);
    return { all: false, admin: false };
  }
  catalog(city = '') {
    return transaction(async (db) => ({
      offers: (
        await db.query(
          `SELECT ${offerColumns} ${offerFrom} WHERE o.active AND s.active AND c.verification_status='verified' AND ${activeDoctor} AND ($1='' OR o.city=$1) ORDER BY o.city,o.name,o.id LIMIT 200`,
          [city],
        )
      ).rows,
      slots: (
        await db.query(
          `SELECT sl.id,sl.home_offer_id offer_id,sl.starts_at,sl.ends_at FROM appointment_slots sl JOIN home_visit_offers o ON o.id=sl.home_offer_id JOIN clinics c ON c.id=o.clinic_id JOIN clinic_services s ON s.id=o.service_id WHERE sl.visit_mode='home' AND sl.cancelled_at IS NULL AND o.active AND s.active AND c.verification_status='verified' AND ${activeDoctor} AND ($1='' OR o.city=$1) AND sl.starts_at>clock_timestamp()+interval '15 minutes' AND sl.starts_at<=clock_timestamp()+interval '30 days' AND NOT EXISTS(SELECT 1 FROM appointments a WHERE a.slot_id=sl.id AND a.status IN ('confirmed','completed')) AND NOT EXISTS(SELECT 1 FROM clinic_booking_occupancy oc WHERE oc.active AND oc.staff_id=sl.doctor_id AND tstzrange(oc.starts_at,oc.ends_at,'[)') && tstzrange(sl.starts_at-make_interval(mins=>o.travel_minutes),sl.ends_at+make_interval(mins=>o.travel_minutes+o.buffer_minutes),'[)')) AND NOT EXISTS(SELECT 1 FROM care_time_off t WHERE t.clinic_id=o.clinic_id AND (t.doctor_id=o.doctor_id OR t.doctor_id IS NULL) AND tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(sl.starts_at-make_interval(mins=>o.travel_minutes),sl.ends_at+make_interval(mins=>o.travel_minutes+o.buffer_minutes),'[)')) ORDER BY sl.starts_at,sl.id LIMIT 500`,
          [city],
        )
      ).rows,
    }));
  }
  mine(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT ${columns} ${bookingFrom} WHERE h.user_id=$1 AND p.owner_id=$1 AND p.archived_at IS NULL ORDER BY h.created_at DESC LIMIT 200`,
            [actor],
          )
        ).rows,
    );
  }
  management(actor: string, clinic: string) {
    return transaction(async (db) => {
      const access = await this.staff(db, actor, clinic);
      const bookings = (
        await db.query(
          `SELECT ${columns} ${bookingFrom} WHERE h.clinic_id=$2 AND ($3 OR h.doctor_id=$1) ORDER BY h.created_at DESC LIMIT 200`,
          [actor, clinic, access.all],
        )
      ).rows;
      await audit(db, actor, 'home_visit.dispatch_viewed', clinic, {
        bookingIds: bookings.map((b) => b.id),
      });
      return {
        admin: access.admin,
        offers: (
          await db.query(
            `SELECT ${offerColumns} ${offerFrom} WHERE o.clinic_id=$1 AND ($2 OR o.doctor_id=$3) ORDER BY o.name LIMIT 200`,
            [clinic, access.all, actor],
          )
        ).rows,
        slots: (
          await db.query(
            "SELECT sl.id,sl.home_offer_id offer_id,sl.starts_at,sl.ends_at,sl.cancelled_at FROM appointment_slots sl WHERE sl.clinic_id=$1 AND sl.visit_mode='home' AND ($2 OR sl.doctor_id=$3) AND sl.starts_at>now()-interval '1 day' ORDER BY sl.starts_at LIMIT 500",
            [clinic, access.all, actor],
          )
        ).rows,
        bookings,
        branches: (
          await db.query(
            'SELECT id,name FROM clinic_branches WHERE clinic_id=$1 ORDER BY name',
            [clinic],
          )
        ).rows,
        services: (
          await db.query(
            'SELECT id,name FROM clinic_services WHERE clinic_id=$1 AND active AND NOT requires_resource ORDER BY name',
            [clinic],
          )
        ).rows,
        doctors: (
          await db.query(
            "SELECT u.id,u.name FROM auth_users u JOIN clinic_memberships m ON m.user_id=u.id JOIN professional_profiles pp ON pp.user_id=u.id AND pp.kind='doctor' JOIN doctor_affiliations f ON f.doctor_id=u.id AND f.clinic_id=m.clinic_id WHERE m.clinic_id=$1 AND m.revoked_at IS NULL AND 'doctor_member'=ANY(m.capabilities) AND pp.status='verified' AND f.status='approved' ORDER BY u.name",
            [clinic],
          )
        ).rows,
      };
    });
  }
  detail(actor: string, id: string) {
    return transaction(async (db) => {
      const h = (
        await db.query('SELECT * FROM home_visit_bookings WHERE id=$1', [id])
      ).rows[0];
      if (!h) throw new NotFoundException();
      if (h.user_id === actor) {
        const p = await this.care.pet(db, actor, h.pet_id, 'profile', true);
        if (p.archived_at) throw new NotFoundException();
      } else {
        const access = await this.staff(db, actor, h.clinic_id);
        if (!access.all && h.doctor_id !== actor) throw new NotFoundException();
      }
      const result = (
        await db.query(`SELECT ${columns} ${bookingFrom} WHERE h.id=$2`, [
          actor,
          id,
        ])
      ).rows[0];
      await audit(db, actor, 'home_visit.receipt_viewed', h.clinic_id, {
        bookingId: id,
      });
      return result;
    });
  }
  create(actor: string, clinic: string, i: HomeOfferInput) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      await this.care.doctor(db, i.doctorId, clinic);
      const s = (
        await db.query(
          'SELECT * FROM clinic_services WHERE id=$1 AND clinic_id=$2 AND active AND NOT requires_resource FOR SHARE',
          [i.serviceId, clinic],
        )
      ).rows[0];
      if (
        !s ||
        !(
          await db.query(
            'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2 FOR SHARE',
            [i.branchId, clinic],
          )
        ).rowCount
      )
        throw new NotFoundException('الخدمة أو الفرع غير متاح');
      const total = BigInt(i.serviceMinor) + BigInt(i.travelMinor);
      if (
        total <= 0n ||
        total > 999999999999n ||
        new Set(i.species).size !== i.species.length
      )
        throw new BadRequestException('تحقق من المبلغ والأنواع');
      const o = (
        await db.query(
          'INSERT INTO home_visit_offers(clinic_id,branch_id,service_id,doctor_id,name,description,city,district,species,service_minor,travel_minor,duration_minutes,buffer_minutes,travel_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,version',
          [
            clinic,
            i.branchId,
            i.serviceId,
            i.doctorId,
            i.name,
            i.description,
            i.city,
            i.district,
            i.species,
            i.serviceMinor,
            i.travelMinor,
            s.duration_minutes,
            s.buffer_minutes,
            i.travelMinutes,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'home_visit.offer_created', clinic, {
        offerId: o.id,
      });
      await emit(db, actor, 'HomeVisitOfferCreated', o.id, 1, clinic);
      return o;
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
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const o = (
        await db.query(
          'UPDATE home_visit_offers SET active=$4,version=version+1 WHERE id=$1 AND clinic_id=$2 AND version=$3 RETURNING id,version,active',
          [id, clinic, version, active],
        )
      ).rows[0];
      if (!o) throw new ConflictException('حدّث العروض قبل تغيير الإتاحة');
      await audit(db, actor, 'home_visit.offer_availability', clinic, {
        offerId: id,
        active,
      });
      await emit(
        db,
        actor,
        'HomeVisitOfferAvailability',
        id,
        o.version,
        clinic,
      );
      return o;
    });
  }
  publish(actor: string, clinic: string, offerId: string, startsAt: string) {
    return transaction(async (db) => {
      await lockScheduling(db, clinic);
      const access = await this.staff(db, actor, clinic);
      const o = (
        await db.query(
          'SELECT * FROM home_visit_offers WHERE id=$1 AND clinic_id=$2 AND active FOR SHARE',
          [offerId, clinic],
        )
      ).rows[0];
      if (!o) throw new NotFoundException();
      if (!access.admin && actor !== o.doctor_id)
        throw new ForbiddenException('نشر الأوقات للطبيب المسند أو المدير');
      await this.care.doctor(db, o.doctor_id, clinic);
      if (
        time(startsAt) < Date.now() + 15 * 60000 ||
        time(startsAt) > Date.now() + 30 * 86400000
      )
        throw new BadRequestException(
          'الموعد بين خمس عشرة دقيقة وثلاثين يوماً',
        );
      await availableTime(
        db,
        clinic,
        o.doctor_id,
        new Date(time(startsAt) - o.travel_minutes * 60000),
        new Date(
          time(startsAt) +
            (o.duration_minutes + o.buffer_minutes + o.travel_minutes) * 60000,
        ),
      );
      const old = (
        await db.query(
          'SELECT id FROM appointment_slots WHERE home_offer_id=$1 AND starts_at=$2 AND cancelled_at IS NULL',
          [offerId, startsAt],
        )
      ).rows[0];
      if (old) return old;
      const sl = (
        await db.query(
          "INSERT INTO appointment_slots(clinic_id,doctor_id,service_id,branch_id,starts_at,ends_at,buffer_minutes,visit_mode,home_offer_id) VALUES($1,$2,$3,$4,$5,$5::timestamptz+make_interval(mins=>$6),$7,'home',$8) RETURNING id",
          [
            clinic,
            o.doctor_id,
            o.service_id,
            o.branch_id,
            startsAt,
            o.duration_minutes,
            o.buffer_minutes,
            offerId,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'home_visit.slot_published', clinic, {
        slotId: sl.id,
        offerId,
      });
      return sl;
    });
  }
  book(actor: string, i: HomeBookingInput) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const scope = (
        await db.query(
          "SELECT clinic_id FROM appointment_slots WHERE id=$1 AND visit_mode='home'",
          [i.slotId],
        )
      ).rows[0];
      if (!scope) throw new NotFoundException();
      await lockScheduling(db, scope.clinic_id);
      const pet = await this.care.pet(db, actor, i.petId, 'profile', true);
      if (pet.archived_at) throw new ConflictException('الحيوان مؤرشف');
      const { idempotencyKey, ...payload } = i,
        hash = createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');
      const old = (
        await db.query(
          'SELECT id,request_hash FROM home_visit_bookings WHERE user_id=$1 AND idempotency_key=$2',
          [actor, idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new ConflictException('المفتاح مستخدم لطلب مختلف');
        return { id: old.id };
      }
      const sl = (
        await db.query(
          "SELECT sl.*,o.id offer_id,o.species,o.name,o.city,o.district,o.service_minor::text,o.travel_minor::text,o.total_minor::text,o.duration_minutes,o.travel_minutes FROM appointment_slots sl JOIN home_visit_offers o ON o.id=sl.home_offer_id JOIN clinics c ON c.id=sl.clinic_id JOIN clinic_services s ON s.id=sl.service_id WHERE sl.id=$1 AND sl.visit_mode='home' AND sl.cancelled_at IS NULL AND sl.starts_at>clock_timestamp()+interval '15 minutes' AND sl.starts_at<=clock_timestamp()+interval '30 days' AND o.active AND s.active AND c.verification_status='verified' FOR UPDATE OF sl FOR SHARE OF o,c,s",
          [i.slotId],
        )
      ).rows[0];
      if (!sl) throw new ConflictException('الوقت أو الخدمة لم يعد متاحاً');
      await this.care.doctor(db, sl.doctor_id, sl.clinic_id);
      if (!sl.species.includes(pet.species) || sl.total_minor !== i.priceMinor)
        throw new ConflictException('نوع الحيوان أو السعر لا يطابق العرض');
      const from = new Date(time(sl.starts_at) - sl.travel_minutes * 60000),
        until = new Date(
          time(sl.ends_at) + (sl.travel_minutes + sl.buffer_minutes) * 60000,
        );
      await availableTime(db, sl.clinic_id, sl.doctor_id, from, until);
      if (
        (
          await db.query(
            "SELECT 1 FROM appointments WHERE slot_id=$1 AND status IN ('confirmed','completed')",
            [i.slotId],
          )
        ).rowCount
      )
        throw new ConflictException('الموعد محجوز');
      const a = (
        await db.query(
          "INSERT INTO appointments(slot_id,pet_id,clinic_id,doctor_id,requester_id,starts_at,ends_at,occupied_from,occupied_until,service_price_minor,idempotency_key,visit_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'home') RETURNING id",
          [
            i.slotId,
            i.petId,
            sl.clinic_id,
            sl.doctor_id,
            actor,
            sl.starts_at,
            sl.ends_at,
            from,
            until,
            sl.service_minor,
            idempotencyKey,
          ],
        )
      ).rows[0];
      const consentUntil = new Date(time(sl.ends_at) + 86400000);
      await db.query(
        'INSERT INTO medical_consents(pet_id,clinic_id,doctor_id,expires_at,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(pet_id,clinic_id,doctor_id) DO UPDATE SET expires_at=CASE WHEN medical_consents.revoked_at IS NULL AND medical_consents.granted_by=$5 THEN greatest(medical_consents.expires_at,EXCLUDED.expires_at) ELSE EXCLUDED.expires_at END,granted_by=$5,revoked_at=NULL',
        [i.petId, sl.clinic_id, sl.doctor_id, consentUntil, actor],
      );
      const h = (
        await db.query(
          'INSERT INTO home_visit_bookings(appointment_id,offer_id,clinic_id,doctor_id,pet_id,user_id,pet_name,service_name,city,district,service_minor,travel_minor,contact_name,phone,address_line,notes,address_consent,medical_consent_until,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,$19) RETURNING id',
          [
            a.id,
            sl.offer_id,
            sl.clinic_id,
            sl.doctor_id,
            i.petId,
            actor,
            pet.name,
            sl.name,
            sl.city,
            sl.district,
            sl.service_minor,
            sl.travel_minor,
            i.contactName,
            i.phone,
            i.addressLine,
            i.notes,
            consentUntil,
            idempotencyKey,
            hash,
          ],
        )
      ).rows[0];
      const amount = BigInt(sl.total_minor);
      await post(
        db,
        actor,
        await entity(db, sl.clinic_id),
        `home:${h.id}`,
        'حجز زيارة منزلية اختباري مؤجل',
        [
          { account: '1200', debit: amount },
          { account: '2100', credit: amount },
        ],
      );
      await post(
        db,
        actor,
        await entity(db, null),
        `home:${h.id}`,
        'تحصيل زيارة منزلية اختباري',
        [
          { account: '1100', debit: amount },
          { account: '2000', credit: amount, partyId: sl.clinic_id },
        ],
      );
      await db.query(
        "INSERT INTO home_visit_events(booking_id,actor_id,state) VALUES($1,$2,'confirmed')",
        [h.id, actor],
      );
      await audit(db, actor, 'home_visit.booked', sl.clinic_id, {
        bookingId: h.id,
        appointmentId: a.id,
      });
      await emit(db, actor, 'AppointmentConfirmed', a.id, 1, sl.clinic_id);
      await emit(db, actor, 'HomeVisitBooked', h.id, 1, sl.clinic_id);
      return { id: h.id };
    });
  }
  dispatch(
    actor: string,
    id: string,
    version: number,
    state: 'en_route' | 'arrived',
  ) {
    return transaction(async (db) => {
      const initial = (
        await db.query(
          'SELECT h.*,a.starts_at,a.ends_at FROM home_visit_bookings h JOIN appointments a ON a.id=h.appointment_id WHERE h.id=$1',
          [id],
        )
      ).rows[0];
      if (!initial) throw new NotFoundException();
      if (initial.doctor_id !== actor)
        throw new ForbiddenException('الإرسال والوصول للطبيب المسند فقط');
      await lockScheduling(db, initial.clinic_id);
      await this.care.medical(db, actor, initial.pet_id, initial.clinic_id);
      const p = (
        await db.query('SELECT owner_id,archived_at FROM pets WHERE id=$1', [
          initial.pet_id,
        ])
      ).rows[0];
      if (p.owner_id !== initial.user_id || p.archived_at)
        throw new ConflictException('تغيرت ملكية الحيوان أو أُرشف');
      const a = (
        await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [
          initial.appointment_id,
        ])
      ).rows[0];
      const h = (
        await db.query(
          'SELECT * FROM home_visit_bookings WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (h.status === state) return { id, version: h.version };
      if (
        h.version !== version ||
        a.status !== 'confirmed' ||
        h.status !== (state === 'en_route' ? 'confirmed' : 'en_route')
      )
        throw new ConflictException('انتقال غير صالح أو حالة قديمة');
      if (
        Date.now() <
          time(a.starts_at) - (state === 'en_route' ? 120 : 30) * 60000 ||
        Date.now() > time(a.ends_at) + 2 * 3600000
      )
        throw new ConflictException('الإرسال أو الوصول خارج نافذة الموعد');
      await db.query(
        "UPDATE home_visit_bookings SET status=$2,departed_at=coalesce(departed_at,now()),arrived_at=CASE WHEN $2='arrived' THEN now() ELSE arrived_at END,version=version+1 WHERE id=$1",
        [id, state],
      );
      await db.query(
        'INSERT INTO home_visit_events(booking_id,actor_id,state) VALUES($1,$2,$3)',
        [id, actor, state],
      );
      await audit(db, actor, 'home_visit.dispatched', h.clinic_id, {
        bookingId: id,
        state,
      });
      await emit(
        db,
        actor,
        'HomeVisitDispatchChanged',
        id,
        h.version + 1,
        h.clinic_id,
      );
      return { id, version: h.version + 1 };
    });
  }
  cancel(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const scope = (
        await db.query('SELECT * FROM home_visit_bookings WHERE id=$1', [id])
      ).rows[0];
      if (!scope) throw new NotFoundException();
      await lockScheduling(db, scope.clinic_id);
      if (scope.user_id === actor) {
        const p = await this.care.pet(db, actor, scope.pet_id, 'profile', true);
        if (p.archived_at)
          throw new ConflictException('الحيوان مؤرشف؛ راجع العيادة');
      } else {
        await this.org.membership(actor, scope.clinic_id, 'clinic_admin', db);
        await db.query('SELECT id FROM pets WHERE id=$1 FOR UPDATE', [
          scope.pet_id,
        ]);
      }
      const a = (
          await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [
            scope.appointment_id,
          ])
        ).rows[0],
        h = (
          await db.query(
            'SELECT * FROM home_visit_bookings WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
      if (h.status === 'cancelled') return { status: 'cancelled' };
      if (
        a.status !== 'confirmed' ||
        a.attendance_state !== 'scheduled' ||
        (h.user_id === actor && time(a.starts_at) <= Date.now()) ||
        (
          await db.query('SELECT 1 FROM encounters WHERE appointment_id=$1', [
            a.id,
          ])
        ).rowCount
      )
        throw new ConflictException(
          'الإلغاء قبل بدء العلاج أو توثيق الزيارة؛ العميل قبل الموعد',
        );
      const platform = await entity(db, null),
        amount = BigInt(h.total_minor);
      const available = (
        await db.query(
          "SELECT coalesce((SELECT sum(l.credit-l.debit) FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.party_id=$2 AND l.account_code='2000' AND j.status='posted'),0)-coalesce((SELECT sum(amount_minor) FROM sandbox_payouts WHERE kind='clinic' AND party_id=$2 AND status='pending'),0) amount",
          [platform, h.clinic_id],
        )
      ).rows[0].amount;
      if (BigInt(available) < amount)
        throw new ConflictException('تحتاج العيادة تسوية المستحق قبل الرد');
      await post(
        db,
        actor,
        await entity(db, h.clinic_id),
        `home-cancel:${id}`,
        'رد زيارة منزلية غير منفذة',
        [
          { account: '2100', debit: amount },
          { account: '1200', credit: amount },
        ],
      );
      await post(
        db,
        actor,
        platform,
        `home-cancel:${id}`,
        'رد تحصيل زيارة منزلية اختبارية',
        [
          { account: '2000', debit: amount, partyId: h.clinic_id },
          { account: '1100', credit: amount },
        ],
      );
      await db.query(
        "UPDATE home_visit_bookings SET status='cancelled',cancelled_at=now(),version=version+1 WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE appointments SET status='cancelled',version=version+1 WHERE id=$1",
        [a.id],
      );
      await db.query(
        "INSERT INTO home_visit_events(booking_id,actor_id,state) VALUES($1,$2,'cancelled')",
        [id, actor],
      );
      await audit(db, actor, 'home_visit.cancelled', h.clinic_id, {
        bookingId: id,
      });
      await emit(
        db,
        actor,
        'HomeVisitCancelled',
        id,
        h.version + 1,
        h.clinic_id,
      );
      await emit(
        db,
        actor,
        'AppointmentCancelled',
        a.id,
        a.version + 1,
        h.clinic_id,
      );
      return { status: 'cancelled' };
    });
  }
}
