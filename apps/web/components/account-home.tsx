'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowUpLeft,
  ShieldCheck,
  Building2,
  UserRound,
  CarFront,
  Mail,
  Check,
  Clock3,
  PawPrint,
} from 'lucide-react';
import type {
  IdentityMe,
  ProfessionalApplication,
  Invitation,
} from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
export function AccountHome({ me }: { me: IdentityMe }) {
  const [applications, setApplications] = useState<ProfessionalApplication[]>(
    [],
  );
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [affiliations, setAffiliations] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  async function refresh() {
    const [a, i, f] = await Promise.all([
      api<ProfessionalApplication[]>('me/applications'),
      api<Invitation[]>('me/invitations'),
      api<{ id: string; name: string; status: string }[]>('me/affiliations'),
    ]);
    setApplications(a);
    setInvitations(i);
    setAffiliations(f);
    setLoaded(true);
  }
  useEffect(() => {
    refresh().catch(() =>
      setError('تعذر تحميل بيانات الحساب. أعد تحميل الصفحة للمحاولة.'),
    );
  }, []);
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
  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void action(async () => {
      await api('applications', {
        method: 'POST',
        body: JSON.stringify({
          kind: f.get('kind'),
          displayName: f.get('displayName'),
          registrationNumber: f.get('registrationNumber'),
          notes: f.get('notes'),
        }),
      });
      setMessage('حُفظ طلب الاعتماد. لا تُمنح صلاحيات مهنية قبل المراجعة.');
      form.reset();
      await refresh();
    });
  }
  function profile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void action(async () => {
      await api('me', {
        method: 'PATCH',
        body: JSON.stringify({ name: data.get('name') }),
      });
      window.location.reload();
    });
  }
  async function accept(id: string) {
    await action(async () => {
      const r = await api<{ clinicId: string }>(`invitations/${id}/accept`, {
        method: 'POST',
        body: '{}',
      });
      await api('me/active-workspace', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: `clinic:${r.clinicId}` }),
      });
      window.location.assign(`/clinic/${r.clinicId}`);
    });
  }
  function affiliate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action(async () => {
      await api('me/affiliations', {
        method: 'POST',
        body: JSON.stringify({ clinicId: f.get('clinicId') }),
      });
      setMessage('أُرسل طلب الانتساب إلى مدير العيادة.');
      await refresh();
    });
  }
  const statusNames: Record<string, string> = {
    pending: 'قيد المراجعة',
    approved: 'معتمد',
    rejected: 'غير مقبول',
    suspended: 'معلّق',
    revoked: 'ملغى',
  };
  const kindNames = { clinic: 'عيادة', doctor: 'طبيب', driver: 'سائق' };
  return (
    <IdentityShell me={me}>
      <section className="account-welcome">
        <div>
          <span className="eyebrow">
            <Check size={15} /> بريد موثّق، ومساحة تخصّك
          </span>
          <h1>أهلًا، {me.user.name}.</h1>
          <p>
            بيانات حسابك وعضوياتك محفوظة. أضف حيوانك وتابع مواعيده وسجله من مركز
            الرعاية.
          </p>
        </div>
        <span className="welcome-paw">
          <PawPrint size={55} />
        </span>
        <Link className="button primary small" href="/care">
          افتح مركز الرعاية
        </Link>
      </section>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="form-success">
          {message}
        </div>
      )}
      <div className="account-grid">
        <div className="account-primary">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">هويتك المهنية</span>
                <h2>انضم إلى منظومة الرعاية</h2>
              </div>
              <Building2 size={23} />
            </div>
            <p className="panel-intro">
              العضوية المهنية تحتاج مراجعة مستقلة. رقم الترخيص المدخل لا يعني أن
              الترخيص قد تم التحقق منه.
            </p>
            <form onSubmit={apply} className="identity-form">
              <div className="form-row">
                <label>
                  نوع الطلب
                  <select name="kind" required>
                    <option value="clinic">اعتماد عيادة</option>
                    <option value="doctor">اعتماد طبيب</option>
                    <option value="driver">اعتماد سائق</option>
                  </select>
                </label>
                <label>
                  الاسم المهني أو اسم العيادة
                  <input
                    name="displayName"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
              </div>
              <label>
                رقم الترخيص أو مرجع المستند
                <input
                  name="registrationNumber"
                  required
                  minLength={3}
                  maxLength={100}
                />
                <small>
                  أدخل المرجع فقط؛ لا تضع هوية كاملة أو وثائق حساسة هنا.
                </small>
              </label>
              <label>
                ملاحظات للمراجع
                <textarea name="notes" maxLength={1000} rows={3} />
              </label>
              <button className="button primary" disabled={busy}>
                إرسال طلب الاعتماد <ArrowUpLeft size={18} />
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>طلباتك المهنية</h2>
              <Clock3 size={20} />
            </div>
            {!loaded ? (
              <p className="subtle-note">جارٍ تحميل الطلبات…</p>
            ) : !applications.length ? (
              <div className="compact-empty">
                <UserRound />
                <p>لا توجد طلبات بعد. حسابك الحالي هو حساب عميل.</p>
              </div>
            ) : (
              <div className="application-list">
                {applications.map((a) => (
                  <article key={a.id} className="application-row">
                    <div>
                      <span className="eyebrow">{kindNames[a.kind]}</span>
                      <h3>{a.display_name}</h3>
                      <small>
                        مرجع المستند: <bdi>{a.registration_number}</bdi>
                      </small>
                      {a.review_reason && (
                        <p className="review-reason">
                          ملاحظة المراجع: {a.review_reason}
                        </p>
                      )}
                    </div>
                    <span
                      className={`status ${a.status === 'approved' ? 'paid' : a.status === 'pending' ? 'pending' : 'refunded'}`}
                    >
                      {statusNames[a.status]}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
          {me.workspaces.some((w) => w.persona === 'doctor') && (
            <section className="panel">
              <div className="panel-heading">
                <h2>انتساب الطبيب إلى عيادة</h2>
              </div>
              <p className="panel-intro">
                اطلب معرف العيادة من إدارتها. لا يتيح الطلب الوصول قبل موافقة
                مديرها.
              </p>
              <form className="identity-form" onSubmit={affiliate}>
                <label>
                  معرف العيادة
                  <input name="clinicId" required dir="ltr" />
                </label>
                <button className="button outline" disabled={busy}>
                  طلب الانتساب
                </button>
              </form>
              {affiliations.map((a) => (
                <div className="simple-row" key={a.id}>
                  <span>{a.name}</span>
                  <span className="small-chip">
                    {statusNames[a.status] || a.status}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
        <aside className="account-aside">
          <section className="panel">
            <div className="panel-heading">
              <h2>دعوات الفريق</h2>
              <Mail size={20} />
            </div>
            {!loaded ? (
              <p className="subtle-note">جارٍ التحميل…</p>
            ) : !invitations.length ? (
              <div className="compact-empty">
                <Mail />
                <p>لا توجد دعوات نشطة لهذا البريد.</p>
              </div>
            ) : (
              invitations.map((i) => (
                <div className="invitation-card" key={i.id}>
                  <strong>{i.name}</strong>
                  <small>دعوة لهذا البريد الموثّق فقط</small>
                  <p>
                    {i.capabilities
                      .map(
                        (c) =>
                          ({
                            clinic_admin: 'مدير عيادة',
                            receptionist: 'استقبال',
                            commerce_manager: 'إدارة التجارة',
                            inventory_clerk: 'المخزون',
                            clinic_accountant: 'محاسبة العيادة',
                            cashier: 'أمين صندوق',
                            doctor_member: 'طبيب عضو',
                          })[c] || c,
                      )
                      .join('، ')}
                  </p>
                  <button
                    className="button primary small"
                    disabled={busy}
                    onClick={() => accept(i.id)}
                  >
                    قبول الدعوة
                  </button>
                </div>
              ))
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>بيانات الحساب</h2>
              <UserRound size={20} />
            </div>
            <form className="identity-form" onSubmit={profile}>
              <label>
                الاسم الظاهر
                <input
                  name="name"
                  defaultValue={me.user.name}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <div className="account-email">
                <span>البريد الموثّق</span>
                <bdi>{me.user.email}</bdi>
              </div>
              <button className="button outline small" disabled={busy}>
                حفظ الاسم
              </button>
            </form>
          </section>
          <section className="account-security-card">
            <ShieldCheck size={30} />
            <h2>خطوة إضافية للاطمئنان.</h2>
            <p>
              {me.user.twoFactorEnabled
                ? 'التحقق بخطوتين مفعّل. يمكنك مراجعة جلساتك وإلغاء الوصول من الأجهزة الأخرى.'
                : 'فعّل التحقق بخطوتين وراجع الأجهزة المتصلة بحسابك.'}
            </p>
            <Link className="button outline small" href="/security">
              إدارة أمان الحساب <ArrowUpLeft size={16} />
            </Link>
          </section>
          <section className="future-card">
            <HeartText />
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
function HeartText() {
  return (
    <>
      <CarFront size={25} />
      <h3>الرعاية والخدمات في الطريق.</h3>
      <p>
        لا توجد حجوزات أو رحلات أو مدفوعات متاحة بعد. الحسابات والعضويات هي
        الأساس الأول.
      </p>
    </>
  );
}
