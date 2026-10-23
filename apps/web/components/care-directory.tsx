'use client';
import { useState } from 'react';
import type {
  IdentityMe,
  DoctorDirectoryEntry,
  AvailableSlot,
  Pet,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import Link from 'next/link';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import { api } from '../lib/auth-client';
import { mutate, PlatformHeading, Empty } from './platform-shared';
export function CareDirectory({
  me,
  initial,
  pets,
}: {
  me: IdentityMe;
  initial: DoctorDirectoryEntry[];
  pets: Pet[];
}) {
  const [doctors, setDoctors] = useState(initial),
    [selected, setSelected] = useState<DoctorDirectoryEntry | null>(null),
    [slots, setSlots] = useState<AvailableSlot[]>([]),
    [confirmation, setConfirmation] = useState(''),
    [attempt, setAttempt] = useState<{
      token: string;
      pet: string;
      slot: string;
    } | null>(null);
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="مركز الرعاية" title="اختر طبيب رفيقك">
        أطباء معتمدون في Petra، وخدمات وفروع وأوقات متاحة. الأسعار استرشادية؛ لا
        تحصيل إلكتروني لحجز الموعد.
      </PlatformHeading>
      <Link className="text-link" href="/care">
        ← مركز الرعاية
      </Link>
      <section className="panel care-section">
        <CareForm
          label="البحث في دليل الأطباء"
          submit={async (f) => {
            setDoctors(
              await api<DoctorDirectoryEntry[]>(
                `care/directory?q=${encodeURIComponent(String(f.get('q')))}&city=${encodeURIComponent(String(f.get('city')))}&specialty=${encodeURIComponent(String(f.get('specialty')))}`,
              ),
            );
            setSelected(null);
          }}
        >
          <div className="care-fields">
            <label>
              اسم الطبيب أو العيادة
              <input name="q" maxLength={100} />
            </label>
            <label>
              المدينة
              <input name="city" maxLength={100} />
            </label>
            <label>
              التخصص
              <input name="specialty" maxLength={100} />
            </label>
          </div>
        </CareForm>
      </section>
      {!doctors.length && <Empty>لا أطباء مطابقين حاليًا.</Empty>}
      <div className="care-slot-grid">
        {doctors.map((d) => (
          <section className="panel care-section" key={d.id + d.clinic_id}>
            <span className="small-chip">{d.specialty}</span>
            <h2>
              <Link href={`/professional-profiles/doctor/${d.id}`}>
                {d.name}
              </Link>
            </h2>
            <Link
              className="text-link"
              href={`/professional-profiles/clinic/${d.clinic_id}`}
            >
              الملف المهني للعيادة
            </Link>
            <p>
              {d.clinic_name} · {d.branches.map((b) => b.city).join('، ')}
            </p>
            <p>{d.bio}</p>
            <p>اللغات: {d.languages.join('، ')}</p>
            <p>
              {d.review_count
                ? `${d.rating} / 5 · ${d.review_count} تقييم زيارة مكتملة`
                : 'لا تقييمات موثقة بعد'}
            </p>
            {d.services.map((s) => (
              <p key={s.id}>
                {s.name} · {s.duration_minutes} دقيقة ·{' '}
                {formatIqd(s.price_minor)}
              </p>
            ))}
            <CareAction
              action={async () => {
                setSelected(d);
                setAttempt(null);
                setConfirmation('');
                setSlots(
                  await api<AvailableSlot[]>(
                    `care/slots?doctorId=${d.id}&clinicId=${d.clinic_id}`,
                  ),
                );
              }}
            >
              عرض أوقات هذا الطبيب
            </CareAction>
          </section>
        ))}
      </div>
      {selected && (
        <section className="panel care-section">
          <h2>الحجز مع {selected.name}</h2>
          {!slots.length ? (
            <Empty>لا أوقات متاحة لهذا الطبيب.</Empty>
          ) : !pets.length ? (
            <Link href="/care">أضف حيوانًا قبل الحجز</Link>
          ) : (
            <CareForm
              label="تأكيد موعد الطبيب"
              submit={async (f) => {
                const pet = String(f.get('pet')),
                  slot = String(f.get('slot'));
                const token =
                  attempt?.pet === pet && attempt.slot === slot
                    ? attempt.token
                    : crypto.randomUUID();
                setAttempt({ token, pet, slot });
                const a = await mutate<{ id: string }>('appointments', {
                  petId: f.get('pet'),
                  slotId: f.get('slot'),
                  idempotencyKey: token,
                });
                setConfirmation(
                  `حُفظ الموعد ${a.id.slice(0, 8)}. راجعه في ملف الحيوان؛ مشاركة السجل تحتاج موافقتك المنفصلة.`,
                );
                setAttempt(null);
                setSlots(
                  await api<AvailableSlot[]>(
                    `care/slots?doctorId=${selected.id}&clinicId=${selected.clinic_id}`,
                  ),
                );
              }}
            >
              <label>
                حيوان الموعد
                <select name="pet" required>
                  <option value="">اختر الحيوان</option>
                  {pets
                    .filter(
                      (p) => p.scopes.includes('booking') && !p.archived_at,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                الوقت المتاح
                <select name="slot" required>
                  <option value="">اختر الوقت</option>
                  {slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {careDate(s.starts_at)} · {s.service_name} ·{' '}
                      {s.branch_name} · {formatIqd(s.price_minor)}
                    </option>
                  ))}
                </select>
              </label>
            </CareForm>
          )}
          {confirmation && <p role="status">{confirmation}</p>}
        </section>
      )}
    </IdentityShell>
  );
}
