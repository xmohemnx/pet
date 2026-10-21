'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
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
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
}) {
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
      <div className="page-title">
        <div>
          <span className="eyebrow">منشأة معتمدة · صلاحيات بنطاق العيادة</span>
          <h1>{clinic.name}</h1>
          <p>إدارة هوية المنشأة وفريقها وفروعها.</p>
        </div>
        <span className="clinic-id">
          <span>معرف العيادة للانتساب</span>
          <bdi>{clinic.id}</bdi>
        </span>
      </div>
      {clinic.capabilities.some((c) =>
        ['clinic_admin', 'receptionist'].includes(c),
      ) && (
        <Link className="button outline" href={`/clinic/${clinic.id}/calendar`}>
          تقويم العيادة والاستقبال وغرف العلاج
        </Link>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {clinic.capabilities.some((c) =>
        ['clinic_admin', 'doctor_member'].includes(c),
      ) && (
        <Link className="button outline" href={`/clinic/${clinic.id}/library`}>
          تحرير مكتبة الرعاية
        </Link>
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
              <form className="identity-form section-form" onSubmit={branch}>
                <div className="form-row">
                  <label>
                    اسم الفرع
                    <input name="name" minLength={2} maxLength={100} required />
                  </label>
                  <label>
                    المدينة
                    <input name="city" minLength={2} maxLength={100} required />
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
                          <legend>الصلاحيات الممنوحة داخل هذه العيادة</legend>
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
      <div className="inline-actions">
        {clinic.capabilities.some((c) =>
          ['clinic_admin', 'receptionist', 'service_staff'].includes(c),
        ) && (
          <Link
            className="button outline"
            href={`/clinic/${clinic.id}/grooming`}
          >
            إدارة العناية والتجميل
          </Link>
        )}
        <Link className="button outline" href={`/clinic/${clinic.id}/commerce`}>
          تجارة ومخزون العيادة
        </Link>
        <Link className="button outline" href={`/clinic/${clinic.id}/finance`}>
          المالية والمحاسبة
        </Link>
        <Link className="button outline" href={`/clinic/${clinic.id}/services`}>
          الباقات والإقامة والإنقاذ
        </Link>
      </div>
      <ClinicServices clinicId={clinic.id} admin={isAdmin} />
    </IdentityShell>
  );
}
