import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { availableTime, lockScheduling } from './calendar.js';
import { homeExecution, completeHomeVisit } from './home-execution.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { requireAccountType } from '../identity/account-policy.js';
import type {
  PetInput,
  VisitContent,
} from '../../../../packages/contracts/src/index.js';
const appointmentsSql = `SELECT a.*,p.name pet_name,u.name doctor_name,c.name clinic_name,s.name service_name,e.id encounter_id,h.id home_visit_id,h.status home_status FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN auth_users u ON u.id=a.doctor_id JOIN clinics c ON c.id=a.clinic_id JOIN appointment_slots sl ON sl.id=a.slot_id JOIN clinic_services s ON s.id=sl.service_id LEFT JOIN encounters e ON e.appointment_id=a.id LEFT JOIN home_visit_bookings h ON h.appointment_id=a.id`;
@Injectable()
export class CareService {
  constructor(private readonly organizations: OrganizationService) {}
  async pet(
    db: PoolClient,
    actor: string,
    id: string,
    scope = 'profile',
    ownerOnly = false,
  ) {
    const p = (
      await db.query(
        "SELECT *,to_char(birth_date,'YYYY-MM-DD') birth_date FROM pets WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!p) throw new NotFoundException('الحيوان غير متاح');
    if (p.owner_id === actor)
      return { ...p, scopes: ['profile', 'medical', 'booking', 'owner'] };
    if (ownerOnly) throw new NotFoundException('الحيوان غير متاح');
    const g = (
      await db.query(
        'SELECT scopes FROM pet_guardians WHERE pet_id=$1 AND user_id=$2 AND revoked_at IS NULL',
        [id, actor],
      )
    ).rows[0];
    if (!g?.scopes.includes(scope))
      throw new NotFoundException('الحيوان غير متاح');
    return { ...p, scopes: g.scopes as string[] };
  }
  async doctor(db: PoolClient, actor: string, clinicId: string) {
    await requireAccountType(actor, ['doctor'], db);
    const profile = await db.query(
      "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='doctor' AND status='verified' FOR SHARE",
      [actor],
    );
    if (!profile.rowCount) throw new ForbiddenException('يلزم اعتماد طبي ساري');
    await db.query('SELECT id FROM clinics WHERE id=$1 FOR SHARE', [clinicId]);
    await this.organizations.membership(actor, clinicId, 'doctor_member', db);
    const member = await db.query(
      "SELECT 1 FROM clinic_memberships WHERE user_id=$1 AND clinic_id=$2 AND revoked_at IS NULL AND capabilities @> ARRAY['doctor_member'] FOR SHARE",
      [actor, clinicId],
    );
    const affiliation = await db.query(
      "SELECT 1 FROM doctor_affiliations WHERE doctor_id=$1 AND clinic_id=$2 AND status='approved' FOR SHARE",
      [actor, clinicId],
    );
    if (!member.rowCount || !affiliation.rowCount)
      throw new ForbiddenException('يلزم انتساب طبي ساري');
  }
  async medical(
    db: PoolClient,
    actor: string,
    petId: string,
    clinicId: string,
  ) {
    const p = (
      await db.query('SELECT * FROM pets WHERE id=$1 FOR UPDATE', [petId])
    ).rows[0];
    if (!p) throw new NotFoundException();
    await this.doctor(db, actor, clinicId);
    const consent = await db.query(
      'SELECT 1 FROM medical_consents WHERE pet_id=$1 AND clinic_id=$2 AND doctor_id=$3 AND revoked_at IS NULL AND expires_at>now()',
      [petId, clinicId, actor],
    );
    const relation = await db.query(
      "SELECT 1 FROM appointments WHERE pet_id=$1 AND clinic_id=$2 AND doctor_id=$3 AND status IN ('confirmed','completed')",
      [petId, clinicId, actor],
    );
    if (!consent.rowCount || !relation.rowCount)
      throw new ForbiddenException(
        'يلزم موعد مسند إليك وموافقة طبية سارية من المالك',
      );
    return p;
  }
  async list(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT p.id,p.name,p.species,p.breed,p.sex,p.archived_at,p.owner_id,p.version,CASE WHEN p.owner_id=$1 THEN ARRAY['owner','profile','medical','booking'] ELSE g.scopes END scopes FROM pets p LEFT JOIN pet_guardians g ON g.pet_id=p.id AND g.user_id=$1 AND g.revoked_at IS NULL WHERE p.owner_id=$1 OR g.scopes @> ARRAY['profile'] ORDER BY p.created_at DESC LIMIT 100`,
            [actor],
          )
        ).rows,
    );
  }
  async savePet(actor: string, input: PetInput, id?: string, version?: number) {
    return transaction(async (db) => {
      if (id) {
        const p = await this.pet(db, actor, id, 'profile', true);
        if (p.version !== version)
          throw new ConflictException('تغير الملف؛ أعد تحميله');
      }
      const petId = id ?? randomUUID();
      const values = [
        petId,
        actor,
        input.name,
        input.species,
        input.breed,
        input.sex,
        input.birthDate,
        input.birthEstimated,
        input.weightGrams,
        input.neutered,
        input.color,
        input.microchip,
        input.allergies,
        input.chronicConditions,
        input.emergencyContact,
      ];
      await db.query(
        `INSERT INTO pets(id,owner_id,name,species,breed,sex,birth_date,birth_estimated,weight_grams,neutered,color,microchip,allergies,chronic_conditions,emergency_contact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET name=$3,species=$4,breed=$5,sex=$6,birth_date=$7,birth_estimated=$8,weight_grams=$9,neutered=$10,color=$11,microchip=$12,allergies=$13,chronic_conditions=$14,emergency_contact=$15,version=pets.version+1`,
        values,
      );
      const row = (
        await db.query('SELECT version FROM pets WHERE id=$1', [petId])
      ).rows[0];
      await audit(db, actor, id ? 'pet.updated' : 'pet.created', null, {
        petId,
      });
      await emit(
        db,
        actor,
        id ? 'PetUpdated' : 'PetCreated',
        petId,
        row.version,
      );
      return { id: petId, version: row.version };
    });
  }
  async archive(actor: string, id: string) {
    return transaction(async (db) => {
      await this.pet(db, actor, id, 'profile', true);
      await db.query(
        'UPDATE pets SET archived_at=now(),version=version+1 WHERE id=$1',
        [id],
      );
      await audit(db, actor, 'pet.archived', null, { petId: id });
      return { status: 'archived' };
    });
  }
  async guardian(actor: string, id: string, email: string, scopes: string[]) {
    return transaction(async (db) => {
      await this.pet(db, actor, id, 'profile', true);
      const target = (
        await db.query(
          'SELECT id FROM auth_users WHERE lower(email)=$1 AND "emailVerified"=true',
          [email.toLowerCase()],
        )
      ).rows[0];
      if (!target || target.id === actor)
        throw new BadRequestException('أدخل بريد حساب موثق آخر');
      await db.query(
        'INSERT INTO pet_guardians(pet_id,user_id,scopes) VALUES($1,$2,$3) ON CONFLICT(pet_id,user_id) DO UPDATE SET scopes=$3,revoked_at=NULL',
        [id, target.id, scopes],
      );
      await audit(db, actor, 'pet.guardian_granted', null, {
        petId: id,
        guardianId: target.id,
      });
      return { status: 'saved' };
    });
  }
  async revokeGuardian(actor: string, id: string, userId: string) {
    return transaction(async (db) => {
      await this.pet(db, actor, id, 'profile', true);
      await db.query(
        'UPDATE pet_guardians SET revoked_at=now() WHERE pet_id=$1 AND user_id=$2',
        [id, userId],
      );
      await audit(db, actor, 'pet.guardian_revoked', null, {
        petId: id,
        guardianId: userId,
      });
      return { status: 'revoked' };
    });
  }
  async consent(
    actor: string,
    id: string,
    clinicId: string,
    doctorId: string,
    expiresAt: string,
  ) {
    return transaction(async (db) => {
      await this.pet(db, actor, id, 'profile', true);
      await this.doctor(db, doctorId, clinicId);
      const expiry = new Date(expiresAt).getTime();
      if (expiry <= Date.now() || expiry > Date.now() + 90 * 86400000)
        throw new BadRequestException('الموافقة بين الآن و90 يومًا');
      await db.query(
        'INSERT INTO medical_consents(pet_id,clinic_id,doctor_id,expires_at,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(pet_id,clinic_id,doctor_id) DO UPDATE SET expires_at=$4,revoked_at=NULL,granted_by=$5',
        [id, clinicId, doctorId, expiresAt, actor],
      );
      await audit(db, actor, 'medical.consent_granted', clinicId, {
        petId: id,
        doctorId,
      });
      return { status: 'saved' };
    });
  }
  async revokeConsent(
    actor: string,
    id: string,
    clinicId: string,
    doctorId: string,
  ) {
    return transaction(async (db) => {
      await this.pet(db, actor, id, 'profile', true);
      await db.query(
        'UPDATE medical_consents SET revoked_at=now() WHERE pet_id=$1 AND clinic_id=$2 AND doctor_id=$3',
        [id, clinicId, doctorId],
      );
      await audit(db, actor, 'medical.consent_revoked', clinicId, {
        petId: id,
        doctorId,
      });
      return { status: 'revoked' };
    });
  }
  async detail(actor: string, id: string, doctorClinic?: string) {
    return transaction(async (db) => {
      const p = doctorClinic
        ? {
            ...(await this.medical(db, actor, id, doctorClinic)),
            scopes: ['profile', 'medical'],
          }
        : await this.pet(db, actor, id);
      const hasMedical = p.scopes.includes('medical');
      if (hasMedical)
        await audit(db, actor, 'medical.record_read', doctorClinic ?? null, {
          petId: id,
        });
      if (!hasMedical) {
        delete p.allergies;
        delete p.chronic_conditions;
        delete p.microchip;
        delete p.emergency_contact;
      }
      const owner = p.owner_id === actor;
      const guardians = owner
        ? (
            await db.query(
              'SELECT g.user_id,u.name,u.email,g.scopes FROM pet_guardians g JOIN auth_users u ON u.id=g.user_id WHERE pet_id=$1 AND revoked_at IS NULL',
              [id],
            )
          ).rows
        : [];
      const consents = owner
        ? (
            await db.query(
              'SELECT m.clinic_id,m.doctor_id,u.name doctor_name,c.name clinic_name,m.expires_at FROM medical_consents m JOIN auth_users u ON u.id=m.doctor_id JOIN clinics c ON c.id=m.clinic_id WHERE pet_id=$1 AND m.revoked_at IS NULL AND m.expires_at>now()',
              [id],
            )
          ).rows
        : [];
      const appointments =
        hasMedical || p.scopes.includes('booking')
          ? (
              await db.query(
                `${appointmentsSql} WHERE a.pet_id=$1 ${doctorClinic ? 'AND a.doctor_id=$2 AND a.clinic_id=$3' : ''} ORDER BY a.starts_at DESC LIMIT 100`,
                doctorClinic ? [id, actor, doctorClinic] : [id],
              )
            ).rows
          : [];
      const encounters = hasMedical
        ? (
            await db.query(
              `SELECT e.*,u.name doctor_name,c.name clinic_name,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'note',a.note,'signed_at',a.signed_at) ORDER BY a.signed_at) FROM encounter_addenda a WHERE a.encounter_id=e.id),'[]'::jsonb) addenda,COALESCE((SELECT jsonb_agg(l ORDER BY l.ordinal) FROM medical_lab_orders l WHERE l.encounter_id=e.id),'[]'::jsonb) lab_orders FROM encounters e JOIN auth_users u ON u.id=e.doctor_id JOIN clinics c ON c.id=e.clinic_id WHERE e.pet_id=$1 AND (e.signed_at IS NOT NULL ${doctorClinic ? 'OR (e.doctor_id=$2 AND e.clinic_id=$3)' : ''}) ORDER BY e.created_at DESC LIMIT 100`,
              doctorClinic ? [id, actor, doctorClinic] : [id],
            )
          ).rows
        : [];
      const tasks = hasMedical
        ? (
            await db.query(
              "SELECT *,CASE WHEN status='planned' AND expires_at<=now() THEN 'expired' WHEN status='planned' AND due_at<=now() THEN 'due' ELSE status END status FROM care_tasks WHERE pet_id=$1 ORDER BY due_at LIMIT 100",
              [id],
            )
          ).rows
        : [];
      return { pet: p, guardians, consents, appointments, encounters, tasks };
    });
  }
  async slots(doctorId?: string, clinicId?: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT sl.id,sl.clinic_id,sl.doctor_id,sl.starts_at,sl.ends_at,sl.resource_id,sl.buffer_minutes,s.price_minor::text,c.name clinic_name,u.name doctor_name,s.name service_name,b.name branch_name FROM appointment_slots sl JOIN clinics c ON c.id=sl.clinic_id AND c.verification_status='verified' JOIN clinic_services s ON s.id=sl.service_id AND s.active JOIN clinic_branches b ON b.id=sl.branch_id JOIN auth_users u ON u.id=sl.doctor_id JOIN professional_profiles p ON p.user_id=sl.doctor_id AND p.kind='doctor' AND p.status='verified' JOIN doctor_affiliations f ON f.doctor_id=sl.doctor_id AND f.clinic_id=sl.clinic_id AND f.status='approved' JOIN clinic_memberships m ON m.user_id=sl.doctor_id AND m.clinic_id=sl.clinic_id AND m.revoked_at IS NULL AND m.capabilities @> ARRAY['doctor_member'] WHERE ($1::uuid IS NULL OR sl.doctor_id=$1) AND ($2::uuid IS NULL OR sl.clinic_id=$2) AND sl.visit_mode='clinic' AND sl.starts_at>now() AND sl.cancelled_at IS NULL AND (sl.resource_id IS NULL OR EXISTS(SELECT 1 FROM clinic_resources r WHERE r.id=sl.resource_id AND r.active)) AND NOT EXISTS(SELECT 1 FROM care_time_off o WHERE o.clinic_id=sl.clinic_id AND (o.doctor_id=sl.doctor_id OR o.doctor_id IS NULL) AND tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(sl.starts_at,sl.ends_at+(sl.buffer_minutes::text||' minutes')::interval,'[)')) AND NOT EXISTS(SELECT 1 FROM appointments a WHERE (a.slot_id=sl.id AND a.status IN ('confirmed','completed')) OR ((a.doctor_id=sl.doctor_id OR (sl.resource_id IS NOT NULL AND a.resource_id=sl.resource_id)) AND a.status='confirmed' AND tstzrange(a.occupied_from,a.occupied_until,'[)') && tstzrange(sl.starts_at,sl.ends_at+(sl.buffer_minutes::text||' minutes')::interval,'[)'))) ORDER BY sl.starts_at LIMIT 100`,
            [doctorId ?? null, clinicId ?? null],
          )
        ).rows,
    );
  }
  async clinics(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT c.id,c.name,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)),'[]') FROM clinic_branches b WHERE b.clinic_id=c.id) branches,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'duration_minutes',s.duration_minutes)),'[]') FROM clinic_services s WHERE s.clinic_id=c.id AND s.active) services FROM clinics c JOIN clinic_memberships m ON m.clinic_id=c.id AND m.user_id=$1 AND m.revoked_at IS NULL JOIN professional_profiles p ON p.user_id=$1 AND p.kind='doctor' AND p.status='verified' JOIN doctor_affiliations f ON f.doctor_id=$1 AND f.clinic_id=c.id AND f.status='approved' WHERE c.verification_status='verified' AND m.capabilities @> ARRAY['doctor_member']`,
            [actor],
          )
        ).rows,
    );
  }
  async services(actor: string, clinicId: string) {
    return transaction(async (db) => {
      await this.organizations.membership(actor, clinicId, undefined, db);
      return (
        await db.query(
          'SELECT id,name,duration_minutes,buffer_minutes,price_minor::text,requires_resource,active FROM clinic_services WHERE clinic_id=$1 ORDER BY name',
          [clinicId],
        )
      ).rows;
    });
  }
  async service(
    actor: string,
    clinicId: string,
    name: string,
    duration: number,
    options: {
      bufferMinutes: number;
      priceMinor: string;
      requiresResource: boolean;
    } = { bufferMinutes: 0, priceMinor: '0', requiresResource: false },
  ) {
    return transaction(async (db) => {
      await this.organizations.membership(actor, clinicId, 'clinic_admin', db);
      const r = (
        await db.query(
          'INSERT INTO clinic_services(clinic_id,name,duration_minutes,buffer_minutes,price_minor,requires_resource) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            clinicId,
            name,
            duration,
            options.bufferMinutes,
            options.priceMinor,
            options.requiresResource,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'care.service_created', clinicId, {
        serviceId: r.id,
      });
      return r;
    });
  }
  async publish(
    actor: string,
    clinicId: string,
    serviceId: string,
    branchId: string,
    startsAt: string,
    resourceId?: string,
  ) {
    return transaction(async (db) => {
      await lockScheduling(db, clinicId);
      await this.doctor(db, actor, clinicId);
      const service = (
        await db.query(
          'SELECT duration_minutes,buffer_minutes,requires_resource FROM clinic_services WHERE id=$1 AND clinic_id=$2 AND active',
          [serviceId, clinicId],
        )
      ).rows[0];
      const branch = await db.query(
        'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2',
        [branchId, clinicId],
      );
      if (!service || !branch.rowCount)
        throw new BadRequestException('الخدمة والفرع يجب أن يتبعا العيادة');
      if (new Date(startsAt).getTime() <= Date.now())
        throw new BadRequestException('اختر وقتًا في المستقبل');
      if (service.requires_resource && !resourceId)
        throw new BadRequestException('الخدمة تحتاج غرفة علاج');
      if (
        resourceId &&
        !(
          await db.query(
            'SELECT 1 FROM clinic_resources WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active',
            [resourceId, clinicId, branchId],
          )
        ).rowCount
      )
        throw new BadRequestException('الغرفة لا تتبع الفرع أو غير متاحة');
      await availableTime(
        db,
        clinicId,
        actor,
        startsAt,
        new Date(
          Date.parse(startsAt) +
            (service.duration_minutes + service.buffer_minutes) * 60000,
        ),
      );
      const r = (
        await db.query(
          "INSERT INTO appointment_slots(clinic_id,doctor_id,service_id,branch_id,starts_at,ends_at,buffer_minutes,resource_id) VALUES($1,$2,$3,$4,$5,$5::timestamptz+($6::text||' minutes')::interval,$7,$8) RETURNING *",
          [
            clinicId,
            actor,
            serviceId,
            branchId,
            startsAt,
            service.duration_minutes,
            service.buffer_minutes,
            resourceId ?? null,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'care.slot_published', clinicId, { slotId: r.id });
      return r;
    });
  }
  async book(actor: string, petId: string, slotId: string, key: string) {
    return transaction(async (db) => {
      // Serialize retries before reading the stored result, even when their pet differs.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${actor}:${key}`,
      ]);
      const previous = (
        await db.query(
          'SELECT * FROM appointments WHERE requester_id=$1 AND idempotency_key=$2',
          [actor, key],
        )
      ).rows[0];
      const scope = (
        await db.query('SELECT clinic_id FROM appointment_slots WHERE id=$1', [
          slotId,
        ])
      ).rows[0];
      if (!scope) throw new ConflictException('الموعد لم يعد متاحًا');
      await lockScheduling(db, scope.clinic_id);
      await this.pet(db, actor, petId, 'booking');
      if (previous) {
        if (
          previous.visit_mode !== 'clinic' ||
          previous.pet_id !== petId ||
          previous.slot_id !== slotId
        )
          throw new ConflictException('مفتاح المحاولة مستخدم لحجز مختلف');
        return previous;
      }
      const pet = (
        await db.query('SELECT archived_at FROM pets WHERE id=$1', [petId])
      ).rows[0];
      if (pet.archived_at) throw new ConflictException('الحيوان مؤرشف');
      const sl = (
        await db.query(
          "SELECT sl.*,s.price_minor::text service_price_minor FROM appointment_slots sl JOIN clinic_services s ON s.id=sl.service_id AND s.active WHERE sl.id=$1 AND sl.visit_mode='clinic' AND sl.cancelled_at IS NULL AND sl.starts_at>now() FOR UPDATE OF sl",
          [slotId],
        )
      ).rows[0];
      if (!sl) throw new ConflictException('الموعد لم يعد متاحًا');
      await this.doctor(db, sl.doctor_id, sl.clinic_id);
      const occupiedUntil = new Date(
        new Date(sl.ends_at).getTime() + sl.buffer_minutes * 60000,
      );
      await availableTime(
        db,
        sl.clinic_id,
        sl.doctor_id,
        sl.starts_at,
        occupiedUntil,
      );
      if (
        sl.resource_id &&
        !(
          await db.query(
            'SELECT 1 FROM clinic_resources WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active',
            [sl.resource_id, sl.clinic_id, sl.branch_id],
          )
        ).rowCount
      )
        throw new ConflictException('الغرفة لم تعد متاحة');
      if (
        (
          await db.query(
            "SELECT 1 FROM appointments WHERE slot_id=$1 AND status IN ('confirmed','completed')",
            [slotId],
          )
        ).rowCount
      )
        throw new ConflictException('الموعد محجوز');
      const r = (
        await db.query(
          'INSERT INTO appointments(slot_id,pet_id,clinic_id,doctor_id,requester_id,starts_at,ends_at,idempotency_key,resource_id,occupied_until,service_price_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
          [
            slotId,
            petId,
            sl.clinic_id,
            sl.doctor_id,
            actor,
            sl.starts_at,
            sl.ends_at,
            key,
            sl.resource_id,
            occupiedUntil,
            sl.service_price_minor,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'appointment.booked', sl.clinic_id, {
        appointmentId: r.id,
        petId,
      });
      await emit(db, actor, 'AppointmentConfirmed', r.id, 1, sl.clinic_id);
      return r;
    });
  }
  async cancel(actor: string, id: string) {
    return transaction(async (db) => {
      const found = (
        await db.query(
          'SELECT pet_id,visit_mode FROM appointments WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (!found) throw new NotFoundException();
      await this.pet(db, actor, found.pet_id, 'booking');
      if (found.visit_mode === 'home')
        throw new ConflictException(
          'ألغِ الزيارة المنزلية من صفحة الخدمة لتسوية الرد',
        );
      const a = (
        await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (a.status !== 'confirmed' || a.attendance_state !== 'scheduled')
        throw new ConflictException('لا يمكن إلغاء هذه الحالة');
      if (
        (
          await db.query('SELECT 1 FROM encounters WHERE appointment_id=$1', [
            id,
          ])
        ).rowCount
      )
        throw new ConflictException('بدأ توثيق الزيارة؛ تواصل مع الطبيب');
      await db.query(
        "UPDATE appointments SET status='cancelled',version=version+1 WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'appointment.cancelled', a.clinic_id, {
        appointmentId: id,
      });
      await emit(
        db,
        actor,
        'AppointmentCancelled',
        id,
        a.version + 1,
        a.clinic_id,
      );
      return { status: 'cancelled' };
    });
  }
  async doctorAppointments(actor: string) {
    return transaction(async (db) => {
      const rows = (
        await db.query(
          `${appointmentsSql} WHERE a.doctor_id=$1 AND EXISTS(SELECT 1 FROM professional_profiles p JOIN doctor_affiliations f ON f.doctor_id=p.user_id JOIN clinic_memberships m ON m.user_id=p.user_id AND m.clinic_id=f.clinic_id JOIN clinics cl ON cl.id=f.clinic_id WHERE p.user_id=$1 AND p.kind='doctor' AND p.status='verified' AND f.status='approved' AND f.clinic_id=a.clinic_id AND m.revoked_at IS NULL AND m.capabilities @> ARRAY['doctor_member'] AND cl.verification_status='verified') ORDER BY a.starts_at DESC LIMIT 100`,
          [actor],
        )
      ).rows;
      return rows;
    });
  }
  async draft(
    actor: string,
    appointmentId: string,
    content: VisitContent,
    version: number,
  ) {
    return transaction(async (db) => {
      const initial = (
        await db.query(
          'SELECT * FROM appointments WHERE id=$1 AND doctor_id=$2',
          [appointmentId, actor],
        )
      ).rows[0];
      if (!initial) throw new NotFoundException();
      await this.medical(db, actor, initial.pet_id, initial.clinic_id);
      const a = (
        await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [
          appointmentId,
        ])
      ).rows[0];
      if (a.status !== 'confirmed')
        throw new ConflictException('الموعد غير مفتوح');
      if (a.visit_mode === 'home') await homeExecution(db, actor, a.id);
      const e = (
        await db.query(
          'SELECT * FROM encounters WHERE appointment_id=$1 FOR UPDATE',
          [appointmentId],
        )
      ).rows[0];
      if (e?.signed_at || version !== (e?.version ?? 0))
        throw new ConflictException('تغيرت المسودة أو وقعت؛ أعد التحميل');
      const r = e
        ? (
            await db.query(
              'UPDATE encounters SET content=$2,version=version+1 WHERE id=$1 RETURNING *',
              [e.id, content],
            )
          ).rows[0]
        : (
            await db.query(
              'INSERT INTO encounters(appointment_id,pet_id,doctor_id,clinic_id,content) VALUES($1,$2,$3,$4,$5) RETURNING *',
              [appointmentId, a.pet_id, actor, a.clinic_id, content],
            )
          ).rows[0];
      await audit(db, actor, 'medical.draft_saved', a.clinic_id, {
        encounterId: r.id,
      });
      return r;
    });
  }
  async sign(actor: string, id: string, version: number) {
    return transaction(async (db) => {
      const e0 = (
        await db.query(
          'SELECT * FROM encounters WHERE id=$1 AND doctor_id=$2',
          [id, actor],
        )
      ).rows[0];
      if (!e0) throw new NotFoundException();
      if (
        (
          await db.query(
            'SELECT 1 FROM home_visit_bookings WHERE appointment_id=$1',
            [e0.appointment_id],
          )
        ).rowCount
      )
        await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.medical(db, actor, e0.pet_id, e0.clinic_id);
      const a = (
        await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [
          e0.appointment_id,
        ])
      ).rows[0];
      const e = (
        await db.query('SELECT * FROM encounters WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (e.signed_at || e.version !== version || a.status !== 'confirmed')
        throw new ConflictException('السجل وقع أو تغير؛ أعد التحميل');
      if (a.visit_mode === 'home') await homeExecution(db, actor, a.id, true);
      // Do not complete a visit for a future slot.
      if (new Date(a.starts_at).getTime() > Date.now())
        throw new ConflictException('لا يمكن توقيع زيارة قبل وقت الموعد');
      await db.query(
        'UPDATE encounters SET signed_at=now(),version=version+1 WHERE id=$1',
        [id],
      );
      for (const [ordinal, lab] of (e.content as VisitContent).labs.entries()) {
        await db.query(
          "INSERT INTO medical_lab_orders(encounter_id,ordinal,test,status,result,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='reviewed' THEN now() END)",
          [
            id,
            ordinal,
            lab.test,
            lab.status,
            lab.result,
            lab.status === 'reviewed' ? actor : null,
          ],
        );
      }
      for (const f of (e.content as VisitContent).followUps) {
        await db.query(
          'INSERT INTO care_tasks(pet_id,encounter_id,created_by,title,due_at) VALUES($1,$2,$3,$4,$5)',
          [e.pet_id, id, actor, f.title, f.dueAt],
        );
      }
      await db.query(
        "UPDATE appointments SET status='completed',version=version+1 WHERE id=$1",
        [e.appointment_id],
      );
      if (a.visit_mode === 'home') await completeHomeVisit(db, actor, a.id);
      await audit(db, actor, 'medical.visit_signed', e.clinic_id, {
        encounterId: id,
        petId: e.pet_id,
      });
      await emit(db, actor, 'VisitSigned', id, e.version + 1, e.clinic_id);
      await emit(
        db,
        actor,
        'AppointmentCompleted',
        a.id,
        a.version + 1,
        e.clinic_id,
      );
      return { status: 'signed' };
    });
  }
  async addendum(actor: string, id: string, note: string) {
    return transaction(async (db) => {
      const e = (
        await db.query(
          'SELECT * FROM encounters WHERE id=$1 AND doctor_id=$2 AND signed_at IS NOT NULL',
          [id, actor],
        )
      ).rows[0];
      if (!e) throw new NotFoundException();
      await this.medical(db, actor, e.pet_id, e.clinic_id);
      const r = (
        await db.query(
          'INSERT INTO encounter_addenda(encounter_id,doctor_id,note) VALUES($1,$2,$3) RETURNING *',
          [id, actor, note],
        )
      ).rows[0];
      await audit(db, actor, 'medical.addendum_signed', e.clinic_id, {
        encounterId: id,
        addendumId: r.id,
      });
      await emit(db, actor, 'MedicalAddendumSigned', r.id, 1, e.clinic_id);
      return r;
    });
  }
  async reviewLab(
    actor: string,
    encounterId: string,
    labId: string,
    result: string,
  ) {
    return transaction(async (db) => {
      const e = (
        await db.query(
          'SELECT * FROM encounters WHERE id=$1 AND doctor_id=$2 AND signed_at IS NOT NULL',
          [encounterId, actor],
        )
      ).rows[0];
      if (!e) throw new NotFoundException();
      await this.medical(db, actor, e.pet_id, e.clinic_id);
      const lab = (
        await db.query(
          "UPDATE medical_lab_orders SET status='reviewed',result=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1 AND encounter_id=$2 AND status='requested' RETURNING id",
          [labId, encounterId, result, actor],
        )
      ).rows[0];
      if (!lab)
        throw new ConflictException(
          'الفحص غير متاح أو اعتمدت نتيجته؛ للتصحيح أضف إضافة موقعة',
        );
      await audit(db, actor, 'medical.lab_reviewed', e.clinic_id, {
        encounterId,
        labId,
      });
      await emit(db, actor, 'LabResultReviewed', labId, 1, e.clinic_id);
      return { status: 'reviewed' };
    });
  }
  async task(
    actor: string,
    petId: string,
    title: string,
    dueAt: string,
    expiresAt?: string,
  ) {
    return transaction(async (db) => {
      await this.pet(db, actor, petId, 'medical');
      if (expiresAt && Date.parse(expiresAt) <= Date.parse(dueAt))
        throw new BadRequestException('انتهاء المهمة يجب أن يلي موعدها');
      const r = (
        await db.query(
          'INSERT INTO care_tasks(pet_id,created_by,title,due_at,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [petId, actor, title, dueAt, expiresAt ?? null],
        )
      ).rows[0];
      await audit(db, actor, 'care.task_created', null, {
        petId,
        taskId: r.id,
      });
      return r;
    });
  }
  async resolveTask(
    actor: string,
    id: string,
    status: 'completed' | 'skipped',
  ) {
    return transaction(async (db) => {
      const t = (await db.query('SELECT * FROM care_tasks WHERE id=$1', [id]))
        .rows[0];
      if (!t) throw new NotFoundException();
      await this.pet(db, actor, t.pet_id, 'medical');
      const r = await db.query(
        "UPDATE care_tasks SET status=$2,resolved_at=now(),resolved_by=$3 WHERE id=$1 AND status='planned' AND (expires_at IS NULL OR expires_at>now()) RETURNING id",
        [id, status, actor],
      );
      if (!r.rowCount) throw new ConflictException('حسمت المهمة سابقًا');
      await audit(db, actor, 'care.task_resolved', null, {
        petId: t.pet_id,
        taskId: id,
        status,
      });
      return { status };
    });
  }
}
