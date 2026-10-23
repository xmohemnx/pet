'use client';
import { DashboardSummary } from './dashboard-summary';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
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
import {
  WorkspaceHeading,
  WorkspaceLink,
  WorkspaceEmpty,
  baghdadDay,
} from './workspace-overview';
export function DoctorWorkspace({
  me,
  clinics,
  appointments: initial,
}: {
  me: IdentityMe;
  clinics: DoctorClinic[];
  appointments: CareAppointment[];
}) {
  const publishRef = useRef<HTMLDetailsElement>(null);
  function openPublisher() {
    if (publishRef.current) {
      publishRef.current.open = true;
      publishRef.current.scrollIntoView({ block: 'start' });
      publishRef.current.querySelector<HTMLSelectElement>('select')?.focus();
    }
  }
  const [view, setView] = useState<'today' | 'upcoming' | 'all'>('today');
  const today = baghdadDay();
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
  const todayAppointments = appointments.filter(
    (a) => baghdadDay(a.starts_at) === today,
  );
  const upcoming = appointments.filter(
    (a) => a.status === 'confirmed' && baghdadDay(a.starts_at) >= today,
  );
  const visible = (
    view === 'today'
      ? todayAppointments
      : view === 'upcoming'
        ? upcoming
        : appointments
  )
    .slice()
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
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
      <div className="role-desk doctor-desk">
        <WorkspaceHeading
          title="يومك في الرعاية"
          description="الزيارة أولًا. تابع الحضور وافتح الملف ووثّق الرعاية من مكان واحد."
          action={
            <Link className="button primary" href="/doctor/planning">
              <CalendarDays size={18} aria-hidden="true" />
              إدارة جدول العمل
            </Link>
          }
        />
        <DashboardSummary
          kind="doctor"
          revision={appointments.filter((a) => a.status === 'completed').length}
        />
        <nav className="desk-tabs" aria-label="تصفية زيارات الطبيب">
          <button
            aria-pressed={view === 'today'}
            onClick={() => setView('today')}
          >
            اليوم <span>{todayAppointments.length}</span>
          </button>
          <button
            aria-pressed={view === 'upcoming'}
            onClick={() => setView('upcoming')}
          >
            القادمة <span>{upcoming.length}</span>
          </button>
          <button aria-pressed={view === 'all'} onClick={() => setView('all')}>
            كل الزيارات <span>{appointments.length}</span>
          </button>
        </nav>
        <div className="desk-body">
          <div className="desk-main">
            <section className="desk-panel">
              <div className="desk-section-heading">
                <div>
                  <h2>الزيارات المسندة إليك</h2>
                  <p>
                    {view === 'today'
                      ? 'جدول اليوم بتوقيت بغداد'
                      : view === 'upcoming'
                        ? 'المواعيد المؤكدة من اليوم وما بعده'
                        : 'سجل الزيارات بجميع حالاته'}
                  </p>
                </div>
                <span className="desk-count">{visible.length} زيارة</span>
              </div>
              {!visible.length && (
                <WorkspaceEmpty
                  title={
                    view === 'today'
                      ? 'جدول اليوم خالٍ من الزيارات'
                      : 'لا زيارات في هذه القائمة'
                  }
                  action={
                    view === 'today' && upcoming.length > 0 ? (
                      <button
                        className="button outline"
                        onClick={() => setView('upcoming')}
                      >
                        عرض الزيارات القادمة
                      </button>
                    ) : (
                      <button
                        className="button outline"
                        onClick={openPublisher}
                      >
                        <Plus size={18} aria-hidden="true" />
                        نشر وقت للحجز
                      </button>
                    )
                  }
                >
                  تظهر هنا الحجوزات المسندة إليك. يمكنك إتاحة أوقاتك للحجز من
                  العيادة المرتبطة بك.
                </WorkspaceEmpty>
              )}
              {visible.map((a) => (
                <article className="care-list-row doctor-visit-row" key={a.id}>
                  <time className="visit-time" dateTime={a.starts_at}>
                    {new Intl.DateTimeFormat('ar-IQ', {
                      timeZone: 'Asia/Baghdad',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(a.starts_at))}
                  </time>
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
                      <CareAction variant="outline" action={() => open(a)}>
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
          <aside className="desk-aside">
            <section className="desk-panel doctor-tools">
              <h2>مساحة العمل الطبي</h2>
              <nav aria-label="أقسام عمل الطبيب">
                <WorkspaceLink
                  href="/doctor/portfolio"
                  title="ملفي المهني والنتائج"
                >
                  سجّل النتائج الموثقة واعرض أعمالك المعتمدة.
                </WorkspaceLink>
                <WorkspaceLink
                  href="/doctor/planning"
                  title="الدوام والملف المهني"
                >
                  نظّم الدوام والإجازات وبياناتك المهنية.
                </WorkspaceLink>
                {clinicId && (
                  <>
                    <WorkspaceLink
                      href={`/clinic/${clinicId}/home-visits`}
                      title="الزيارات المنزلية"
                    >
                      تابع الإرسال والوصول قبل بدء الزيارة.
                    </WorkspaceLink>
                    <WorkspaceLink
                      href={`/clinic/${clinicId}/boarding`}
                      title="مراجعات الإقامة"
                    >
                      راجع القبول والحوادث التي تحتاج قرارًا طبيًا.
                    </WorkspaceLink>
                  </>
                )}
              </nav>
            </section>
            <details
              className="desk-administration doctor-publisher"
              ref={publishRef}
              id="publish-time"
            >
              <summary>
                نشر وقت متاح<span>إتاحة موعد جديد للحجز</span>
              </summary>
              <section className="care-section">
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
                                clinic.branches.find(
                                  (b) => b.id === r.branch_id,
                                )?.name
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
            </details>
            <section className="desk-note">
              <h2>خصوصية السجل</h2>
              <p className="panel-intro">
                فتح الملف يحتاج موافقة سارية من المالك على طبيب وعيادة الموعد.
                إلغاء الموافقة يمنع الطلب التالي، بما فيه التوقيع والإضافة.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </IdentityShell>
  );
}
