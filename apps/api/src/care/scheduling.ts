import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { CareService } from './service.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { lockScheduling, availableTime, weeklyStarts } from './calendar.js';
import type { PoolClient } from 'pg';

@Injectable()
export class SchedulingService {
  constructor(
    private readonly care: CareService,
    private readonly organizations: OrganizationService,
  ) {}
  async receptionist(db: PoolClient, actor: string, clinicId: string) {
    const membership = await this.organizations.membership(
      actor,
      clinicId,
      undefined,
      db,
    );
    if (
      !membership.capabilities.some((c: string) =>
        ['clinic_admin', 'receptionist'].includes(c),
      )
    )
      throw new ForbiddenException('يلزم تفويض استقبال أو إدارة العيادة');
  }
  async resources(
    actor: string,
    clinicId: string,
    input?: { branchId: string; name: string },
  ) {
    return transaction(async (db) => {
      await this.organizations.membership(
        actor,
        clinicId,
        input ? 'clinic_admin' : undefined,
        db,
      );
      if (input) {
        if (
          !(
            await db.query(
              'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2',
              [input.branchId, clinicId],
            )
          ).rowCount
        )
          throw new BadRequestException('الفرع لا يتبع العيادة');
        await db.query(
          'INSERT INTO clinic_resources(clinic_id,branch_id,name) VALUES($1,$2,$3)',
          [clinicId, input.branchId, input.name],
        );
        await audit(db, actor, 'care.resource_created', clinicId);
      }
      return (
        await db.query(
          'SELECT id,branch_id,name,active FROM clinic_resources WHERE clinic_id=$1 ORDER BY name',
          [clinicId],
        )
      ).rows;
    });
  }
  async plan(actor: string, clinicId: string) {
    return transaction(async (db) => {
      await this.care.doctor(db, actor, clinicId);
      return {
        rules: (
          await db.query(
            'SELECT * FROM doctor_working_hours WHERE doctor_id=$1 AND clinic_id=$2 AND active ORDER BY weekday,start_minute',
            [actor, clinicId],
          )
        ).rows,
        timeOff: (
          await db.query(
            'SELECT * FROM care_time_off WHERE clinic_id=$1 AND (doctor_id=$2 OR doctor_id IS NULL) AND ends_at>now() ORDER BY starts_at',
            [clinicId, actor],
          )
        ).rows,
        resources: (
          await db.query(
            'SELECT id,branch_id,name FROM clinic_resources WHERE clinic_id=$1 AND active ORDER BY name',
            [clinicId],
          )
        ).rows,
      };
    });
  }
  async rule(
    actor: string,
    clinicId: string,
    i: {
      branchId: string;
      serviceId: string;
      resourceId?: string;
      weekday: number;
      startMinute: number;
      endMinute: number;
    },
  ) {
    return transaction(async (db) => {
      await lockScheduling(db, clinicId);
      await this.care.doctor(db, actor, clinicId);
      const service = (
        await db.query(
          'SELECT * FROM clinic_services WHERE id=$1 AND clinic_id=$2 AND active',
          [i.serviceId, clinicId],
        )
      ).rows[0];
      if (
        !(
          await db.query(
            'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2',
            [i.branchId, clinicId],
          )
        ).rowCount
      )
        throw new BadRequestException('الفرع لا يتبع العيادة');
      if (
        !service ||
        i.endMinute - i.startMinute <
          service.duration_minutes + service.buffer_minutes
      )
        throw new BadRequestException('الدوام لا يتسع لمدة الخدمة والفاصل');
      if (service.requires_resource && !i.resourceId)
        throw new BadRequestException('هذه الخدمة تحتاج غرفة علاج');
      if (
        i.resourceId &&
        !(
          await db.query(
            'SELECT 1 FROM clinic_resources WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active',
            [i.resourceId, clinicId, i.branchId],
          )
        ).rowCount
      )
        throw new BadRequestException('الغرفة لا تتبع فرع الخدمة');
      const rule = (
        await db.query(
          'INSERT INTO doctor_working_hours(doctor_id,clinic_id,branch_id,service_id,resource_id,weekday,start_minute,end_minute) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            actor,
            clinicId,
            i.branchId,
            i.serviceId,
            i.resourceId ?? null,
            i.weekday,
            i.startMinute,
            i.endMinute,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'care.working_hours_created', clinicId, {
        ruleId: rule.id,
      });
      return rule;
    });
  }
  async removeRule(actor: string, clinicId: string, id: string) {
    return transaction(async (db) => {
      await lockScheduling(db, clinicId);
      await this.care.doctor(db, actor, clinicId);
      if (
        !(
          await db.query(
            'UPDATE doctor_working_hours SET active=false WHERE id=$1 AND doctor_id=$2 AND clinic_id=$3 RETURNING id',
            [id, actor, clinicId],
          )
        ).rowCount
      )
        throw new NotFoundException();
      await db.query(
        "UPDATE appointment_slots sl SET cancelled_at=now() WHERE working_hours_id=$1 AND starts_at>now() AND NOT EXISTS(SELECT 1 FROM appointments a WHERE a.slot_id=sl.id AND a.status IN ('confirmed','completed'))",
        [id],
      );
      await audit(db, actor, 'care.working_hours_removed', clinicId, {
        ruleId: id,
      });
      return { status: 'removed' };
    });
  }
  async generate(
    actor: string,
    clinicId: string,
    id: string,
    from: string,
    through: string,
  ) {
    return transaction(async (db) => {
      await lockScheduling(db, clinicId);
      await this.care.doctor(db, actor, clinicId);
      const r = (
        await db.query(
          'SELECT w.*,s.duration_minutes,s.buffer_minutes,s.requires_resource FROM doctor_working_hours w JOIN clinic_services s ON s.id=w.service_id AND s.active WHERE w.id=$1 AND w.doctor_id=$2 AND w.clinic_id=$3 AND w.active',
          [id, actor, clinicId],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      if (
        r.resource_id &&
        !(
          await db.query(
            'SELECT 1 FROM clinic_resources WHERE id=$1 AND active',
            [r.resource_id],
          )
        ).rowCount
      )
        throw new ConflictException('الغرفة غير متاحة');
      let created = 0,
        skipped = 0;
      for (const startsAt of weeklyStarts(
        from,
        through,
        r.weekday,
        r.start_minute,
        r.end_minute,
        r.duration_minutes,
        r.buffer_minutes,
      )) {
        const endsAt = new Date(
          Date.parse(startsAt) +
            (r.duration_minutes + r.buffer_minutes) * 60000,
        ).toISOString();
        if (Date.parse(startsAt) <= Date.now()) {
          skipped++;
          continue;
        }
        try {
          await availableTime(db, clinicId, actor, startsAt, endsAt);
        } catch (error) {
          if (error instanceof ConflictException) {
            skipped++;
            continue;
          }
          throw error;
        }
        const inserted = await db.query(
          "INSERT INTO appointment_slots(clinic_id,doctor_id,service_id,branch_id,resource_id,buffer_minutes,starts_at,ends_at,working_hours_id) VALUES($1,$2,$3,$4,$5,$6,$7,$7::timestamptz+($8::text||' minutes')::interval,$9) ON CONFLICT(working_hours_id,starts_at) WHERE working_hours_id IS NOT NULL DO NOTHING",
          [
            clinicId,
            actor,
            r.service_id,
            r.branch_id,
            r.resource_id,
            r.buffer_minutes,
            startsAt,
            r.duration_minutes,
            id,
          ],
        );
        created += inserted.rowCount ?? 0;
      }
      await audit(db, actor, 'care.slots_generated', clinicId, {
        ruleId: id,
        created,
        skipped,
      });
      return { created, skipped };
    });
  }
  async timeOff(
    actor: string,
    clinicId: string,
    i: { startsAt: string; endsAt: string; reason: string },
    clinicWide = false,
  ) {
    return transaction(async (db) => {
      await lockScheduling(db, clinicId);
      if (clinicWide)
        await this.organizations.membership(
          actor,
          clinicId,
          'clinic_admin',
          db,
        );
      else await this.care.doctor(db, actor, clinicId);
      if (
        Date.parse(i.endsAt) <= Date.parse(i.startsAt) ||
        Date.parse(i.endsAt) - Date.parse(i.startsAt) > 31 * 86400000
      )
        throw new BadRequestException('نطاق الإجازة غير صالح؛ الحد 31 يومًا');
      if (
        (
          await db.query(
            "SELECT 1 FROM appointments WHERE clinic_id=$1 AND ($2::uuid IS NULL OR doctor_id=$2) AND status='confirmed' AND tstzrange(starts_at,occupied_until,'[)') && tstzrange($3,$4,'[)')",
            [clinicId, clinicWide ? null : actor, i.startsAt, i.endsAt],
          )
        ).rowCount
      )
        throw new ConflictException(
          'توجد حجوزات مؤكدة؛ عالجها قبل تسجيل الإجازة',
        );
      const row = (
        await db.query(
          'INSERT INTO care_time_off(clinic_id,doctor_id,starts_at,ends_at,reason,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            clinicId,
            clinicWide ? null : actor,
            i.startsAt,
            i.endsAt,
            i.reason,
            actor,
          ],
        )
      ).rows[0];
      await db.query(
        "UPDATE appointment_slots SET cancelled_at=now() WHERE clinic_id=$1 AND ($2::uuid IS NULL OR doctor_id=$2) AND tstzrange(starts_at,ends_at+(buffer_minutes::text||' minutes')::interval,'[)') && tstzrange($3,$4,'[)') AND starts_at>now()",
        [clinicId, clinicWide ? null : actor, i.startsAt, i.endsAt],
      );
      await audit(db, actor, 'care.time_off_created', clinicId, {
        timeOffId: row.id,
        clinicWide,
      });
      return row;
    });
  }
  async removeTimeOff(actor: string, clinicId: string, id: string) {
    return transaction(async (db) => {
      await lockScheduling(db, clinicId);
      const item = (
        await db.query(
          'SELECT doctor_id FROM care_time_off WHERE id=$1 AND clinic_id=$2',
          [id, clinicId],
        )
      ).rows[0];
      if (!item) throw new NotFoundException();
      if (item.doctor_id === actor) await this.care.doctor(db, actor, clinicId);
      else
        await this.organizations.membership(
          actor,
          clinicId,
          'clinic_admin',
          db,
        );
      await db.query('DELETE FROM care_time_off WHERE id=$1', [id]);
      await audit(db, actor, 'care.time_off_removed', clinicId, {
        timeOffId: id,
      });
      return { status: 'removed' };
    });
  }
  async clinicDay(actor: string, clinicId: string, date: string) {
    return transaction(async (db) => {
      await this.receptionist(db, actor, clinicId);
      return {
        appointments: (
          await db.query(
            "SELECT a.id,a.version,a.status,a.attendance_state,a.checked_in_at,a.started_at,a.starts_at,a.ends_at,p.name pet_name,u.name doctor_name,s.name service_name,r.name resource_name FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN auth_users u ON u.id=a.doctor_id JOIN appointment_slots sl ON sl.id=a.slot_id JOIN clinic_services s ON s.id=sl.service_id LEFT JOIN clinic_resources r ON r.id=a.resource_id WHERE a.clinic_id=$1 AND a.starts_at>=($2::date::timestamp AT TIME ZONE 'Asia/Baghdad') AND a.starts_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Baghdad') ORDER BY a.starts_at",
            [clinicId, date],
          )
        ).rows,
        timeOff: (
          await db.query(
            'SELECT id,doctor_id,starts_at,ends_at,reason FROM care_time_off WHERE clinic_id=$1 AND ends_at>now() ORDER BY starts_at LIMIT 100',
            [clinicId],
          )
        ).rows,
      };
    });
  }
  async attendance(
    actor: string,
    id: string,
    state: 'checked_in' | 'in_progress' | 'no_show',
    version: number,
  ) {
    return transaction(async (db) => {
      const initial = (
        await db.query('SELECT * FROM appointments WHERE id=$1', [id])
      ).rows[0];
      if (!initial) throw new NotFoundException();
      await lockScheduling(db, initial.clinic_id);
      if (initial.doctor_id === actor)
        await this.care.doctor(db, actor, initial.clinic_id);
      else {
        await this.receptionist(db, actor, initial.clinic_id);
        if (state === 'in_progress')
          throw new ForbiddenException('بدء العلاج للطبيب المسند فقط');
      }
      const a = (
        await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (
        (state === 'no_show' && a.status === 'no_show') ||
        (a.status === 'confirmed' && a.attendance_state === state)
      )
        return a;
      if (a.status !== 'confirmed' || a.version !== version)
        throw new ConflictException('تغيرت حالة الموعد؛ أعد التحميل');
      if (state === 'no_show') {
        if (
          Date.now() < new Date(a.ends_at).getTime() ||
          a.attendance_state !== 'scheduled' ||
          (
            await db.query('SELECT 1 FROM encounters WHERE appointment_id=$1', [
              id,
            ])
          ).rowCount
        )
          throw new ConflictException(
            'لا يسجل غياب قبل نهاية الموعد أو بعد بدء الزيارة',
          );
        await db.query(
          "UPDATE appointments SET status='no_show',version=version+1 WHERE id=$1",
          [id],
        );
      } else {
        if (
          Date.now() < new Date(a.starts_at).getTime() - 30 * 60000 ||
          Date.now() > new Date(a.ends_at).getTime() + 2 * 3600000
        )
          throw new ConflictException('الحضور متاح قرب الموعد فقط');
        if (
          (state === 'checked_in' && a.attendance_state !== 'scheduled') ||
          (state === 'in_progress' && a.attendance_state !== 'checked_in')
        )
          throw new ConflictException('انتقال غير صالح');
        await db.query(
          "UPDATE appointments SET attendance_state=$2,checked_in_at=COALESCE(checked_in_at,now()),started_at=CASE WHEN $2='in_progress' THEN now() ELSE started_at END,version=version+1 WHERE id=$1",
          [id, state],
        );
      }
      await db.query(
        'INSERT INTO appointment_state_history(appointment_id,actor_id,state) VALUES($1,$2,$3)',
        [id, actor, state],
      );
      await audit(db, actor, 'appointment.attendance_changed', a.clinic_id, {
        appointmentId: id,
        state,
      });
      await emit(
        db,
        actor,
        'AppointmentAttendanceChanged',
        id,
        a.version + 1,
        a.clinic_id,
      );
      return (await db.query('SELECT * FROM appointments WHERE id=$1', [id]))
        .rows[0];
    });
  }
  async profile(
    actor: string,
    i?: { specialty: string; bio: string; languages: string[] },
  ) {
    return transaction(async (db) => {
      if (
        !(
          await db.query(
            "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='doctor' AND status='verified' FOR SHARE",
            [actor],
          )
        ).rowCount
      )
        throw new ForbiddenException('يلزم اعتماد طبي ساري');
      if (i) {
        await db.query(
          'INSERT INTO doctor_public_profiles(user_id,specialty,bio,languages) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET specialty=$2,bio=$3,languages=$4,updated_at=now()',
          [actor, i.specialty, i.bio, i.languages],
        );
        await audit(db, actor, 'care.directory_profile_saved');
      }
      return (
        (
          await db.query(
            'SELECT * FROM doctor_public_profiles WHERE user_id=$1',
            [actor],
          )
        ).rows[0] ?? null
      );
    });
  }
  async directory(q: string, city: string, specialty: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT u.id,u.name,dp.specialty,dp.bio,dp.languages,c.id clinic_id,c.name clinic_name,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'city',b.city)),'[]') FROM clinic_branches b WHERE b.clinic_id=c.id) branches,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'duration_minutes',s.duration_minutes,'price_minor',s.price_minor::text)),'[]') FROM clinic_services s WHERE s.clinic_id=c.id AND s.active) services,
       (SELECT count(*)::int FROM doctor_reviews r WHERE r.doctor_id=u.id) review_count,
       (SELECT round(avg(r.rating),1)::text FROM doctor_reviews r WHERE r.doctor_id=u.id) rating
       FROM doctor_public_profiles dp JOIN auth_users u ON u.id=dp.user_id JOIN professional_profiles p ON p.user_id=u.id AND p.kind='doctor' AND p.status='verified'
       JOIN doctor_affiliations f ON f.doctor_id=u.id AND f.status='approved' JOIN clinics c ON c.id=f.clinic_id AND c.verification_status='verified'
       JOIN clinic_memberships m ON m.user_id=u.id AND m.clinic_id=c.id AND m.revoked_at IS NULL AND m.capabilities @> ARRAY['doctor_member']
       WHERE (u.name ILIKE $1 OR c.name ILIKE $1) AND dp.specialty ILIKE $3 AND EXISTS(SELECT 1 FROM clinic_branches b WHERE b.clinic_id=c.id AND b.city ILIKE $2) ORDER BY u.name,c.name LIMIT 60`,
            [`%${q}%`, `%${city}%`, `%${specialty}%`],
          )
        ).rows,
    );
  }
  async review(actor: string, id: string, rating: number, body: string) {
    return transaction(async (db) => {
      const a = (
        await db.query(
          "SELECT a.doctor_id FROM appointments a JOIN pets p ON p.id=a.pet_id WHERE a.id=$1 AND p.owner_id=$2 AND a.requester_id=$2 AND a.status='completed'",
          [id, actor],
        )
      ).rows[0];
      if (!a) throw new NotFoundException('التقييم لمالك زيارة مكتملة فقط');
      await db.query(
        'INSERT INTO doctor_reviews(appointment_id,user_id,doctor_id,rating,body) VALUES($1,$2,$3,$4,$5)',
        [id, actor, a.doctor_id, rating, body],
      );
      await audit(db, actor, 'care.doctor_reviewed', null, {
        appointmentId: id,
      });
      return { status: 'saved' };
    });
  }
}
