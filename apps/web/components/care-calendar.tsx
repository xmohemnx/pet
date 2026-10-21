'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { IdentityMe, CareCalendar as Calendar } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, careDate, appointmentLabels } from './care-shared';
import { api } from '../lib/auth-client';
import { PlatformHeading, Empty } from './platform-shared';
export function CareCalendar({
  me,
  initial,
  month: initialMonth,
}: {
  me: IdentityMe;
  initial: Calendar;
  month: string;
}) {
  const [month, setMonth] = useState(initialMonth),
    [calendar, setCalendar] = useState(initial);
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="مركز الرعاية" title="تقويم رفاقك">
        المواعيد ومتابعاتك الشخصية والمتابعات التي حددها الطبيب. الإشعارات داخل
        التطبيق تراعي ساعات عدم الإزعاج.
      </PlatformHeading>
      <Link className="text-link" href="/care">
        ← مركز الرعاية
      </Link>
      <section className="panel care-section">
        <CareForm
          label="عرض الشهر"
          submit={async () =>
            setCalendar(await api<Calendar>(`me/care-calendar?month=${month}`))
          }
        >
          <label>
            الشهر بتوقيت بغداد
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
            />
          </label>
        </CareForm>
      </section>
      <div className="care-columns">
        <section className="panel care-section">
          <h2>متابعات الرعاية</h2>
          {!calendar.tasks.length && <Empty>لا متابعات لهذا الشهر.</Empty>}
          {calendar.tasks.map((t) => (
            <article className="care-section" key={t.id}>
              <h3>{t.title}</h3>
              <p>
                {t.pet_name} · {careDate(t.due_at)}
              </p>
              <p>
                {t.encounter_id ? 'حددها الطبيب في زيارة موقعة' : 'تذكير شخصي'}{' '}
                ·{' '}
                {
                  {
                    planned: 'مخطط',
                    due: 'مستحق',
                    completed: 'مكتمل',
                    skipped: 'متجاوز',
                    expired: 'منتهي',
                  }[t.status]
                }
              </p>
              <Link href={`/care/pets/${t.pet_id}`}>مراجعة ملف الحيوان</Link>
            </article>
          ))}
        </section>
        <section className="panel care-section">
          <h2>المواعيد</h2>
          {!calendar.appointments.length && (
            <Empty>لا مواعيد لهذا الشهر.</Empty>
          )}
          {calendar.appointments.map((a) => (
            <article key={a.id} className="care-section">
              <h3>
                {a.pet_name} · {a.clinic_name}
              </h3>
              <p>
                {a.doctor_name} · {careDate(a.starts_at)} ·{' '}
                {appointmentLabels[a.status]}
              </p>
              <Link href={`/care/pets/${a.pet_id}`}>ملف الحيوان</Link>
            </article>
          ))}
        </section>
      </div>
    </IdentityShell>
  );
}
