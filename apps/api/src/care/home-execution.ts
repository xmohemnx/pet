import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { entity, post, sandbox } from '../finance/ledger.js';
import { audit, emit } from '../organizations/service.js';

export const homeConsentSql = `p.owner_id=h.user_id AND p.archived_at IS NULL AND EXISTS(SELECT 1 FROM medical_consents mc WHERE mc.pet_id=h.pet_id AND mc.clinic_id=h.clinic_id AND mc.doctor_id=h.doctor_id AND mc.granted_by=p.owner_id AND mc.revoked_at IS NULL AND mc.expires_at>clock_timestamp())`;
export const homeDoctorSql = `EXISTS(SELECT 1 FROM professional_profiles pp JOIN doctor_affiliations f ON f.doctor_id=pp.user_id JOIN clinic_memberships m ON m.user_id=pp.user_id AND m.clinic_id=f.clinic_id JOIN clinics cl ON cl.id=m.clinic_id WHERE pp.user_id=h.doctor_id AND pp.kind='doctor' AND pp.status='verified' AND f.clinic_id=h.clinic_id AND f.status='approved' AND m.revoked_at IS NULL AND 'doctor_member'=ANY(m.capabilities) AND cl.verification_status='verified')`;
/** Caller holds the pet, then appointment locks; financial signing holds 823702 first. */
export async function homeExecution(
  db: PoolClient,
  actor: string,
  appointmentId: string,
  signing = false,
) {
  const h = (
    await db.query(
      `SELECT h.*,${homeConsentSql} consent_valid FROM home_visit_bookings h JOIN pets p ON p.id=h.pet_id WHERE h.appointment_id=$1 FOR UPDATE OF h`,
      [appointmentId],
    )
  ).rows[0];
  if (!h) return null;
  sandbox();
  if (h.doctor_id !== actor)
    throw new ForbiddenException('تنفيذ الزيارة للطبيب المسند فقط');
  if (h.status !== 'arrived' || !h.consent_valid)
    throw new ConflictException('يلزم وصول الطبيب وملكية وموافقة طبية ساريتان');
  if (
    signing &&
    !(
      await db.query(
        "SELECT 1 FROM appointments WHERE id=$1 AND attendance_state='in_progress'",
        [appointmentId],
      )
    ).rowCount
  )
    throw new ConflictException('ابدأ العلاج قبل توقيع الزيارة المنزلية');
  return h;
}
export async function completeHomeVisit(
  db: PoolClient,
  actor: string,
  appointmentId: string,
) {
  const h = await homeExecution(db, actor, appointmentId, true);
  if (!h) return;
  const amount = BigInt(h.total_minor);
  await post(
    db,
    actor,
    await entity(db, h.clinic_id),
    `home-complete:${h.id}`,
    'إتمام زيارة منزلية موقعة اختبارية',
    [
      { account: '2100', debit: amount },
      { account: '4100', credit: amount },
    ],
  );
  await db.query(
    "UPDATE home_visit_bookings SET status='completed',completed_at=now(),version=version+1 WHERE id=$1",
    [h.id],
  );
  await db.query(
    "INSERT INTO home_visit_events(booking_id,actor_id,state) VALUES($1,$2,'completed')",
    [h.id, actor],
  );
  await audit(db, actor, 'home_visit.completed', h.clinic_id, {
    bookingId: h.id,
    appointmentId,
  });
  await emit(db, actor, 'HomeVisitCompleted', h.id, h.version + 1, h.clinic_id);
}
