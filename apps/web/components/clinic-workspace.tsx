'use client';
import Link from 'next/link';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import {
  Building2,
  Users,
  Mail,
  MapPin,
  ArrowUpLeft,
  ShieldCheck,
} from 'lucide-react';
import type { IdentityMe, ClinicInfo } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { ClinicServices } from './clinic-services';
import { api } from '../lib/auth-client';
import {
  WorkspaceHeading,
  WorkspaceLink,
  WorkspaceEmpty,
} from './workspace-overview';
import { careDate, appointmentLabels } from './care-shared';
import type { ClinicCalendarData } from './clinic-calendar';
const capNames: Record<string, string> = {
  clinic_admin: 'إدارة العيادة',
  receptionist: 'الاستقبال',
  commerce_manager: 'التجارة',
  inventory_clerk: 'المخزون',
  clinic_accountant: 'محاسبة العيادة',
  cashier: 'أمين صندوق',
  doctor_member: 'طبيب عضو',
  service_staff: 'تنفيذ خدمات التجميل',
};
interface Member {
  id: string;
  name: string;
  email: string;
  capabilities: string[];
}
interface Affiliation {
  id: string;
  name: string;
  status: string;
  doctor_id: string;
}
export function ClinicWorkspace({
  me,
  clinic,
  calendar,
  calendarError,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  calendar?: ClinicCalendarData;
  calendarError?: boolean;
}) {
  const administrationRef = useRef<HTMLDetailsElement>(null);
  const openAdministration = () => {
    if (administrationRef.current) administrationRef.current.open = true;
  };
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [branches, setBranches] = useState(clinic.branches);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = clinic.capabilities.includes('clinic_admin');
  const base = `clinics/${clinic.id}`;
  async function refresh() {
    if (!isAdmin) return;
    const [m, a] = await Promise.all([
      api<Member[]>(`${base}/members`),
      api<Affiliation[]>(`${base}/affiliations`),
    ]);
    setMembers(m);
    setAffiliations(a);
    setTeamLoaded(true);
  }
  useEffect(() => {
    refresh().catch(() => setError('تعذر تحميل فريق العيادة'));
  }, [clinic.id]);
  async function action(fn: () => Promise<void>) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إتمام العملية');
    } finally {
      setBusy(false);
    }
  }
  function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void action(async () => {
      const r = await api<{ delivery: string; message?: string }>(
        `${base}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: f.get('email'),
            capabilities: f.getAll('capabilities'),
          }),
        },
      );
      setMessage(
        r.delivery === 'sent'
          ? 'حُفظت الدعوة وأُرسل البريد. يقبلها صاحب البريد الموثّق من حسابه.'
          : r.message || 'حُفظت الدعوة لكن تعذر إرسال البريد.',
      );
      form.reset();
    });
  }
  function branch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void action(async () => {
      const b = await api<ClinicInfo['branches'][number]>(`${base}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: f.get('name'), city: f.get('city') }),
      });
      setBranches([...branches, b]);
      setMessage('حُفظ الفرع الجديد.');
      form.reset();
    });
  }
  function member(e: FormEvent<HTMLFormElement>, m: Member) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action(async () => {
      await api(`${base}/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          capabilities: f.getAll('capabilities'),
          revoke: false,
        }),
      });
      setMessage('حُدّثت صلاحيات العضو.');
      await refresh();
    });
  }
  const context = {
    ...me,
    activeWorkspace:
      me.workspaces.find((w) => w.clinicId === clinic.id) || me.activeWorkspace,
  };
  return (
    <IdentityShell me={context}>
      <div className="role-desk clinic-desk">
        <WorkspaceHeading
          title={clinic.name}
          description="مساحة الفريق اليومية. المواعيد والخدمات والإدارة بحسب صلاحياتك."
          action={
            <a
              href="#clinic-administration"
              onClick={openAdministration}
              className="button outline"
            >
              الفريق والفروع
            </a>
          }
        />
        <div className="clinic-work-surface">
          <section className="desk-panel clinic-agenda">
            <div className="desk-section-heading">
              <div>
                <h2>استقبال اليوم</h2>
                <p>مواعيد العيادة بتوقيت بغداد</p>
              </div>
              {calendar && (
                <span className="desk-count">
                  {calendar.appointments.length} موعد
                </span>
              )}
            </div>
            {calendarError ? (
              <WorkspaceEmpty
                title="تعذر تحميل مواعيد اليوم"
                action={
                  <Link
                    className="button outline"
                    href={`${base.replace('clinics/', '/clinic/')}/calendar`}
                  >
                    إعادة المحاولة من التقويم
                  </Link>
                }
              >
                لم نتمكن من جلب المواعيد. لا تعني هذه الحالة أن جدول العيادة
                فارغ.
              </WorkspaceEmpty>
            ) : calendar ? (
              calendar.appointments.length ? (
                <div className="clinic-agenda-list">
                  {calendar.appointments.slice(0, 4).map((a) => (
                    <article key={a.id}>
                      <time dateTime={a.starts_at}>
                        {careDate(a.starts_at)}
                      </time>
                      <div>
                        <h3>
                          {a.pet_name} · {a.service_name}
                        </h3>
                        <p>{a.doctor_name}</p>
                      </div>
                      <span className="small-chip">
                        {appointmentLabels[a.status]}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <WorkspaceEmpty
                  title="لا مواعيد في جدول اليوم"
                  action={
                    <Link
                      className="button primary"
                      href={`/clinic/${clinic.id}/calendar`}
                    >
                      افتح تقويم العيادة
                    </Link>
                  }
                >
                  راجع الأيام القادمة، أو جهّز غرف العلاج وأوقات الفريق من
                  التقويم.
                </WorkspaceEmpty>
              )
            ) : (
              <WorkspaceEmpty title="مهامك داخل العيادة">
                تعرض هذه المساحة الأقسام المسموح بها لعضويتك. بيانات الاستقبال
                متاحة لأصحاب صلاحية إدارة المواعيد.
              </WorkspaceEmpty>
            )}
            {calendar && calendar.appointments.length > 0 && (
              <Link
                className="text-link"
                href={`/clinic/${clinic.id}/calendar`}
              >
                جميع المواعيد وتسجيل الحضور
              </Link>
            )}
          </section>
          <aside className="clinic-context desk-note">
            <h2>العيادة وفريقها</h2>
            <dl>
              <div>
                <dt>الفروع المرتبطة</dt>
                <dd>{branches.length}</dd>
              </div>
              {isAdmin && (
                <>
                  <div>
                    <dt>أعضاء الفريق</dt>
                    <dd>{teamLoaded ? members.length : 'جارٍ التحميل…'}</dd>
                  </div>
                  <div>
                    <dt>طلبات انتساب معلّقة</dt>
                    <dd>
                      {teamLoaded
                        ? affiliations.filter((a) => a.status === 'pending')
                            .length
                        : 'جارٍ التحميل…'}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <a
              className="text-link"
              href="#clinic-administration"
              onClick={openAdministration}
            >
              إدارة الفروع والصلاحيات
            </a>
          </aside>
        </div>
        <section className="desk-panel clinic-departments">
          <div className="desk-section-heading">
            <div>
              <h2>أقسام العمل</h2>
              <p>وصول مباشر إلى أدوات الفريق المخوّل.</p>
            </div>
          </div>
          <nav
            className="clinic-department-list"
            aria-label="أقسام عمل العيادة"
          >
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'receptionist'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/calendar`}
                title="المواعيد والاستقبال"
              >
                جدول الحجوزات والحضور وغرف العلاج.
              </WorkspaceLink>
            )}
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'receptionist', 'doctor_member'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/home-visits`}
                title="الزيارات المنزلية"
              >
                إسناد الطبيب ومتابعة الإرسال والوصول.
              </WorkspaceLink>
            )}
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'commerce_manager'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/commerce`}
                title="التجارة والمخزون"
              >
                طلبات المنتجات ومتابعة مخزون العيادة.
              </WorkspaceLink>
            )}
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'inventory_clerk'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/inventory`}
                title="مخزون العيادة"
              >
                الكميات وحركة المخزون داخل العيادة.
              </WorkspaceLink>
            )}
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'clinic_accountant', 'cashier'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/finance`}
                title="المالية والمحاسبة"
              >
                الصندوق والقيود والتقارير المالية.
              </WorkspaceLink>
            )}
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'receptionist', 'service_staff'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/grooming`}
                title="العناية والتجميل"
              >
                مواعيد العناية وتنفيذ الخدمة.
              </WorkspaceLink>
            )}
            <WorkspaceLink
              href={`/clinic/${clinic.id}/services`}
              title="الخدمات والباقات"
            >
              خدمات العيادة والباقات والإقامة والإنقاذ.
            </WorkspaceLink>
            {clinic.capabilities.some((c) =>
              ['clinic_admin', 'doctor_member'].includes(c),
            ) && (
              <WorkspaceLink
                href={`/clinic/${clinic.id}/library`}
                title="مكتبة الرعاية"
              >
                تحرير المحتوى ومراجعته.
              </WorkspaceLink>
            )}
          </nav>
        </section>
        <details
          ref={administrationRef}
          className="desk-administration"
          id="clinic-administration"
        >
          <summary>
            إدارة الفريق والفروع <span>العضويات والدعوات وطلبات الانتساب</span>
          </summary>
          <div className="clinic-reference">
            <span>معرّف العيادة لطلب الانتساب</span>
            <bdi>{clinic.id}</bdi>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="form-success" role="status">
              {message}
            </div>
          )}
          <div className="account-grid">
            <div className="account-primary">
              <section className="panel">
                <div className="panel-heading">
                  <h2>فروع العيادة</h2>
                  <MapPin size={22} />
                </div>
                {!branches.length ? (
                  <div className="compact-empty">
                    <Building2 />
                    <p>لا توجد فروع مضافة بعد.</p>
                  </div>
                ) : (
                  branches.map((b) => (
                    <article className="simple-row" key={b.id}>
                      <strong>{b.name}</strong>
                      <span>{b.city}</span>
                    </article>
                  ))
                )}
                {isAdmin && (
                  <form
                    className="identity-form section-form"
                    onSubmit={branch}
                  >
                    <div className="form-row">
                      <label>
                        اسم الفرع
                        <input
                          name="name"
                          minLength={2}
                          maxLength={100}
                          required
                        />
                      </label>
                      <label>
                        المدينة
                        <input
                          name="city"
                          minLength={2}
                          maxLength={100}
                          required
                        />
                      </label>
                    </div>
                    <button className="button outline small" disabled={busy}>
                      إضافة فرع <ArrowUpLeft size={16} />
                    </button>
                  </form>
                )}
              </section>
              {isAdmin && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>أعضاء الفريق</h2>
                    <Users size={22} />
                  </div>
                  {members.map((m) => (
                    <article className="team-member" key={m.id}>
                      <div className="team-heading">
                        <div>
                          <strong>{m.name}</strong>
                          <small>
                            <bdi>{m.email}</bdi>
                          </small>
                        </div>
                        {m.id === me.user.id && (
                          <span className="small-chip">أنت</span>
                        )}
                      </div>
                      <p>
                        {m.capabilities.map((c) => capNames[c] || c).join('، ')}
                      </p>
                      {m.id !== me.user.id && (
                        <details className="member-details">
                          <summary>إدارة صلاحيات العضو</summary>
                          <form
                            onSubmit={(e) => member(e, m)}
                            className="identity-form"
                          >
                            <fieldset className="capability-grid">
                              <legend>
                                الصلاحيات الممنوحة داخل هذه العيادة
                              </legend>
                              {Object.entries(capNames).map(([c, label]) => (
                                <label key={`${m.id}-${c}`}>
                                  <input
                                    type="checkbox"
                                    name="capabilities"
                                    value={c}
                                    defaultChecked={m.capabilities.includes(c)}
                                  />
                                  {label}
                                </label>
                              ))}
                            </fieldset>
                            <div className="member-actions">
                              <button
                                className="button outline small"
                                disabled={busy}
                              >
                                حفظ الصلاحيات
                              </button>
                              <button
                                className="button danger small"
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'إلغاء عضوية هذا المستخدم في العيادة؟ سيتوقف وصوله فورًا.',
                                    )
                                  )
                                    void action(async () => {
                                      await api(`${base}/members/${m.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({
                                          capabilities: m.capabilities,
                                          revoke: true,
                                        }),
                                      });
                                      setMessage(
                                        'أُلغيت العضوية وأوقف الوصول إلى هذه العيادة.',
                                      );
                                      await refresh();
                                    });
                                }}
                              >
                                إلغاء العضوية
                              </button>
                            </div>
                          </form>
                        </details>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {isAdmin && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>طلبات انتساب الأطباء</h2>
                    <ShieldCheck size={22} />
                  </div>
                  {!affiliations.length ? (
                    <p className="panel-intro">لا توجد طلبات انتساب بعد.</p>
                  ) : (
                    affiliations.map((a) => (
                      <div className="application-row" key={a.id}>
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            {a.status === 'pending'
                              ? 'بانتظار قرار العيادة'
                              : a.status === 'approved'
                                ? 'انتساب معتمد'
                                : a.status === 'rejected'
                                  ? 'مرفوض'
                                  : 'ملغى'}
                          </small>
                        </div>
                        <div className="member-actions">
                          {(a.status === 'pending'
                            ? ['approved', 'rejected']
                            : a.status === 'approved'
                              ? ['revoked']
                              : []
                          ).map((decision) => (
                            <button
                              key={decision}
                              className="button outline small"
                              disabled={busy}
                              onClick={() =>
                                action(async () => {
                                  await api(
                                    `${base}/affiliations/${a.id}/decision`,
                                    {
                                      method: 'POST',
                                      body: JSON.stringify({ decision }),
                                    },
                                  );
                                  setMessage('حُدّث طلب الانتساب.');
                                  await refresh();
                                })
                              }
                            >
                              {decision === 'approved'
                                ? 'اعتماد'
                                : decision === 'rejected'
                                  ? 'رفض'
                                  : 'إلغاء الانتساب'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </section>
              )}
            </div>
            <aside className="account-aside">
              {isAdmin && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>دعوة عضو جديد</h2>
                    <Mail size={22} />
                  </div>
                  <p className="panel-intro">
                    تصل الدعوة إلى البريد المحدد وتُقبل من حساب موثّق مطابق له.
                    تنتهي خلال 7 أيام.
                  </p>
                  <form className="identity-form" onSubmit={invite}>
                    <label>
                      البريد الإلكتروني
                      <input
                        name="email"
                        type="email"
                        required
                        dir="ltr"
                        maxLength={254}
                      />
                    </label>
                    <fieldset className="capability-grid">
                      <legend>صلاحيات العضو</legend>
                      {Object.entries(capNames).map(([c, label]) => (
                        <label key={c}>
                          <input
                            type="checkbox"
                            name="capabilities"
                            value={c}
                            defaultChecked={c === 'receptionist'}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    <button className="button primary" disabled={busy}>
                      إرسال الدعوة <ArrowUpLeft size={17} />
                    </button>
                  </form>
                </section>
              )}
              <section className="account-security-card">
                <Building2 size={30} />
                <h2>كل نشاط العيادة، في مساحة واحدة.</h2>
                <p>
                  تحدد هذه الصلاحيات ما يستطيع أعضاء الفريق قراءته وتعديله في
                  الرعاية والخدمات والتجارة والمخزون والمحاسبة داخل العيادة.
                </p>
                <div className="permission-tags">
                  {clinic.capabilities.map((c) => (
                    <span key={c}>{capNames[c] || c}</span>
                  ))}
                </div>
              </section>
            </aside>
          </div>
          <ClinicServices clinicId={clinic.id} admin={isAdmin} />
        </details>
      </div>
    </IdentityShell>
  );
}
