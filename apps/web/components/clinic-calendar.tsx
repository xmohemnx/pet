'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  ClinicInfo,
  CareAppointment,
  CareTimeOff,
  CareResource,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import {
  CareForm,
  CareAction,
  careDate,
  localToUtc,
  appointmentLabels,
  attendanceLabels,
} from './care-shared';
import { api } from '../lib/auth-client';
import { mutate, PlatformHeading, Empty } from './platform-shared';
export interface ClinicCalendarData {
  appointments: (CareAppointment & { resource_name: string | null })[];
  timeOff: CareTimeOff[];
}
export function ClinicCalendar({
  me,
  clinic,
  initial,
  initialResources,
  today,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: ClinicCalendarData;
  initialResources: CareResource[];
  today: string;
}) {
  const [date, setDate] = useState(today),
    [data, setData] = useState(initial),
    [resources, setResources] = useState(initialResources);
  const admin = clinic.capabilities.includes('clinic_admin'),
    base = `clinics/${clinic.id}`;
  async function refresh() {
    setData(await api<ClinicCalendarData>(`${base}/calendar?date=${date}`));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="تقويم العيادة والاستقبال">
        الحضور وحالة الموعد فقط؛ لا يفتح الاستقبال الملاحظات الطبية.
      </PlatformHeading>
      <Link className="text-link" href={`/clinic/${clinic.id}`}>
        ← العيادة
      </Link>
      <section className="panel care-section">
        <CareForm label="عرض مواعيد اليوم" submit={refresh}>
          <label>
            تاريخ اليوم بتوقيت بغداد
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        </CareForm>
      </section>
      <div className="care-columns">
        <div className="care-stack">
          {!data.appointments.length && (
            <Empty>لا مواعيد في التاريخ المحدد.</Empty>
          )}
          {data.appointments.map((a) => (
            <section className="panel care-section" key={a.id}>
              <h2>
                {a.pet_name} · {a.service_name}
              </h2>
              <p>
                {a.doctor_name} · {careDate(a.starts_at)}
              </p>
              <p>{a.resource_name ?? 'دون غرفة مخصصة'}</p>
              <span className="small-chip">
                {appointmentLabels[a.status]} ·{' '}
                {attendanceLabels[a.attendance_state]}
              </span>
              {a.visit_mode === 'home' && (
                <Link
                  className="text-link"
                  href={`/clinic/${clinic.id}/home-visits`}
                >
                  متابعة الزيارة المنزلية
                </Link>
              )}
              {a.visit_mode !== 'home' &&
                a.status === 'confirmed' &&
                a.attendance_state === 'scheduled' && (
                  <div className="care-actions">
                    {(['checked_in', 'no_show'] as const).map((state) => (
                      <CareAction
                        key={state}
                        action={async () => {
                          await mutate(`appointments/${a.id}/attendance`, {
                            state,
                            version: a.version,
                          });
                          await refresh();
                        }}
                      >
                        {state === 'checked_in'
                          ? 'تسجيل الحضور'
                          : 'تسجيل عدم الحضور'}
                      </CareAction>
                    ))}
                  </div>
                )}
            </section>
          ))}
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>غرف العلاج</h2>
            {resources.map((r) => (
              <p key={r.id}>
                {r.name} ·{' '}
                {clinic.branches.find((b) => b.id === r.branch_id)?.name}
              </p>
            ))}
            {admin && (
              <CareForm
                label="إضافة غرفة علاج"
                submit={async (f) => {
                  setResources(
                    await mutate<CareResource[]>(`${base}/resources`, {
                      name: f.get('name'),
                      branchId: f.get('branch'),
                    }),
                  );
                }}
              >
                <label>
                  اسم الغرفة
                  <input name="name" maxLength={100} required />
                </label>
                <label>
                  فرع الغرفة
                  <select name="branch" required>
                    {clinic.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              </CareForm>
            )}
          </section>
          {admin && (
            <section className="panel care-section">
              <h2>إغلاق العيادة</h2>
              <p>يرفض الحفظ إذا تعارض مع حجز مؤكد.</p>
              <CareForm
                label="حفظ إغلاق العيادة"
                submit={async (f) => {
                  await mutate(`${base}/closures`, {
                    startsAt: localToUtc(f.get('start')),
                    endsAt: localToUtc(f.get('end')),
                    reason: f.get('reason'),
                  });
                  await refresh();
                }}
              >
                <label>
                  بداية الإغلاق
                  <input name="start" type="datetime-local" required />
                </label>
                <label>
                  نهاية الإغلاق
                  <input name="end" type="datetime-local" required />
                </label>
                <label>
                  سبب تشغيلي
                  <input name="reason" minLength={2} maxLength={300} required />
                </label>
              </CareForm>
            </section>
          )}
          <section className="panel care-section">
            <h2>الإجازات والإغلاقات</h2>
            {data.timeOff.map((o) => (
              <div key={o.id}>
                <p>
                  {o.reason} · {careDate(o.starts_at)} – {careDate(o.ends_at)}
                </p>
                {admin && (
                  <CareAction
                    action={async () => {
                      await api(`${base}/time-off/${o.id}`, {
                        method: 'DELETE',
                      });
                      await refresh();
                    }}
                  >
                    إلغاء الإجازة أو الإغلاق
                  </CareAction>
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
