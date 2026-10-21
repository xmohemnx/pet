import { ConflictException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

export async function lockScheduling(db: PoolClient, clinicId: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `care-schedule:${clinicId}`,
  ]);
}
export async function availableTime(
  db: PoolClient,
  clinicId: string,
  doctorId: string,
  start: string | Date,
  end: string | Date,
) {
  if (
    (
      await db.query(
        "SELECT 1 FROM care_time_off WHERE clinic_id=$1 AND (doctor_id=$2 OR doctor_id IS NULL) AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3,$4,'[)')",
        [clinicId, doctorId, start, end],
      )
    ).rowCount
  )
    throw new ConflictException('الوقت يقع داخل إجازة أو إغلاق عيادة');
}
/** Baghdad currently uses UTC+03 without daylight-saving changes. */
export function weeklyStarts(
  from: string,
  through: string,
  weekday: number,
  startMinute: number,
  endMinute: number,
  duration: number,
  buffer: number,
) {
  const begin = Date.parse(`${from}T00:00:00+03:00`),
    end = Date.parse(`${through}T00:00:00+03:00`);
  if (
    !Number.isFinite(begin) ||
    !Number.isFinite(end) ||
    end < begin ||
    end - begin > 90 * 86400000 ||
    startMinute < 0 ||
    endMinute > 1440 ||
    startMinute >= endMinute ||
    duration < 15 ||
    duration > 180 ||
    buffer < 0 ||
    buffer > 60 ||
    weekday < 0 ||
    weekday > 6
  )
    throw new BadRequestException(
      'تحقق من نطاق التواريخ والدوام؛ الحد 90 يومًا',
    );
  const slots: string[] = [];
  for (let day = begin; day <= end; day += 86400000) {
    if (new Date(day + 3 * 3600000).getUTCDay() !== weekday) continue;
    for (
      let minute = startMinute;
      minute + duration + buffer <= endMinute;
      minute += duration + buffer
    )
      slots.push(new Date(day + minute * 60000).toISOString());
  }
  return slots;
}
