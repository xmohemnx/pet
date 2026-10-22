'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import type {
  IdentityMe,
  DoctorClinic,
  CareAppointment,
  CareDetail,
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
import { VisitEditor } from './visit-editor';
import { api } from '../lib/auth-client';
export function DoctorWorkspace({
  me,
  clinics,
  appointments: initial,
}: {
  me: IdentityMe;
  clinics: DoctorClinic[];
  appointments: CareAppointment[];
}) {
  const [appointments, setAppointments] = useState(initial),
    [selected, setSelected] = useState<CareAppointment | null>(null),
    [detail, setDetail] = useState<CareDetail | null>(null),
    [clinicId, setClinicId] = useState(clinics[0]?.id ?? '');
  const [resources, setResources] = useState<CareResource[]>([]),
    [resourceError, setResourceError] = useState('');
  useEffect(() => {
    if (clinicId)
      api<CareResource[]>(`clinics/${clinicId}/resources`)
        .then(setResources)
        .catch(() => setResourceError('تعذر تحميل غرف العلاج'));
  }, [clinicId]);
  const clinic = clinics.find((c) => c.id === clinicId);
  async function open(a: CareAppointment) {
    const d = await api<CareDetail>(`pets/${a.pet_id}?clinicId=${a.clinic_id}`);
    setSelected(a);
    setDetail(d);
  }
  async function refresh() {
    const rows = await api<CareAppointment[]>('doctor/appointments');
    setAppointments(rows);
    if (selected) {
      const a = rows.find((x) => x.id === selected.id);
      if (a) await open(a);
    }
  }
  const context = {
    ...me,
    activeWorkspace:
      me.workspaces.find((w) => w.persona === 'doctor') ?? me.activeWorkspace,
  };
  return (
    <IdentityShell me={context}>
      <div className="care-heading">
        <div>
          <h1>يومك في الرعاية</h1>
          <p>أوقاتك المنشورة، زياراتك المسندة، وسجلاتك الموقعة.</p>
        </div>
      </div>
      <Link className="button outline" href="/doctor/planning">
        إدارة الدوام والإجازات والملف المهني
      </Link>
      {clinicId && (
        <Link
          className="button outline"
          href={`/clinic/${clinicId}/home-visits`}
        >
          إرسال ومتابعة الزيارات المنزلية
        </Link>
      )}
      {clinicId && (
        <Link className="button outline" href={`/clinic/${clinicId}/boarding`}>
          مراجعات قبول الإقامة والحوادث
        </Link>
      )}
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>الزيارات المسندة إليك</h2>
            {!appointments.length && (
              <p className="compact-empty">لم تصلك حجوزات بعد.</p>
            )}
            {appointments.map((a) => (
              <article className="care-list-row" key={a.id}>
                <div>
                  <h3>
                    {a.pet_name} · {a.service_name}
                  </h3>
                  <p>
                    {a.clinic_name} ·{' '}
                    {a.visit_mode === 'home' ? 'زيارة منزلية · ' : ''}
                    {careDate(a.starts_at)}
                  </p>
                  <span className="small-chip">
                    {appointmentLabels[a.status]}
                    {a.status === 'confirmed'
                      ? ` · ${attendanceLabels[a.attendance_state]}`
                      : ''}
                  </span>
                </div>
                {a.status !== 'cancelled' &&
                  a.status !== 'no_show' &&
                  (a.visit_mode !== 'home' ||
                    a.home_status === 'arrived' ||
                    a.status === 'completed') && (
                    <CareAction action={() => open(a)}>
                      فتح ملف الزيارة
                    </CareAction>
                  )}
                {a.visit_mode === 'home' &&
                  a.status === 'confirmed' &&
                  a.home_status !== 'arrived' && (
                    <Link
                      className="text-link"
                      href={`/clinic/${a.clinic_id}/home-visits`}
                    >
                      إرسال الطبيب والوصول أولاً
                    </Link>
                  )}
                {a.status === 'confirmed' &&
                  (a.visit_mode !== 'home' || a.home_status === 'arrived') &&
                  a.attendance_state !== 'in_progress' && (
                    <CareAction
                      action={async () => {
                        await api(`appointments/${a.id}/attendance`, {
                          method: 'POST',
                          body: JSON.stringify({
                            state:
                              a.attendance_state === 'scheduled'
                                ? 'checked_in'
                                : 'in_progress',
                            version: a.version,
                          }),
                        });
                        await refresh();
                      }}
                    >
                      {a.attendance_state === 'scheduled'
                        ? 'تسجيل حضور الزيارة'
                        : 'بدء الزيارة'}
                    </CareAction>
                  )}
              </article>
            ))}
          </section>
          {selected && detail && (
            <VisitEditor
              key={`${selected.id}:${detail.encounters.find((e) => e.appointment_id === selected.id)?.version ?? 0}:${detail.encounters.find((e) => e.appointment_id === selected.id)?.addenda.length ?? 0}`}
              appointment={selected}
              data={detail}
              onSaved={refresh}
            />
          )}
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>نشر وقت متاح</h2>
            <p className="panel-intro">
              تختار فرعًا وخدمة من عيادة انتسابك. مدة الموعد تأتي من الخدمة،
              والتوقيت بتوقيت بغداد.
            </p>
            {clinic ? (
              <>
                <label className="care-standalone-label">
                  العيادة
                  <select
                    value={clinicId}
                    onChange={(e) => setClinicId(e.target.value)}
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <CareForm
                  key={clinicId}
                  label="نشر الوقت"
                  submit={async (f) => {
                    await api(`clinics/${clinicId}/slots`, {
                      method: 'POST',
                      body: JSON.stringify({
                        serviceId: f.get('service'),
                        branchId: f.get('branch'),
                        startsAt: localToUtc(f.get('start')),
                        ...(f.get('resource')
                          ? { resourceId: f.get('resource') }
                          : {}),
                      }),
                    });
                  }}
                >
                  <label>
                    فرع الموعد
                    <select name="branch" required>
                      <option value="">اختر الفرع</option>
                      {clinic.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    خدمة الموعد
                    <select name="service" required>
                      <option value="">اختر الخدمة</option>
                      {clinic.services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.duration_minutes} دقيقة
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    بداية الموعد بتوقيت بغداد
                    <input name="start" type="datetime-local" required />
                  </label>
                  <label>
                    غرفة الموعد
                    <select name="resource">
                      <option value="">دون غرفة</option>
                      {resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ·{' '}
                          {
                            clinic.branches.find((b) => b.id === r.branch_id)
                              ?.name
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  {resourceError && <p role="alert">{resourceError}</p>}
                </CareForm>
              </>
            ) : (
              <p>يلزم انتساب معتمد إلى عيادة لإتاحة الأوقات.</p>
            )}
          </section>
          <section className="panel care-section">
            <h2>خصوصية السجل</h2>
            <p className="panel-intro">
              فتح الملف يحتاج موافقة سارية من المالك على طبيب وعيادة الموعد.
              إلغاء الموافقة يمنع الطلب التالي، بما فيه التوقيع والإضافة.
            </p>
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
