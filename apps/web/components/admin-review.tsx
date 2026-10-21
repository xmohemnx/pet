'use client';
import { useState, type FormEvent } from 'react';
import { ShieldCheck, FileCheck, Clock3, X } from 'lucide-react';
import type { IdentityMe, ProfessionalApplication } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { api } from '../lib/auth-client';
interface Audit {
  id: string;
  action: string;
  occurred_at: string;
}
const kindNames = { clinic: 'عيادة', doctor: 'طبيب', driver: 'سائق' };
const statusNames = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  suspended: 'معلّق',
};
export function AdminReview({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: ProfessionalApplication[];
}) {
  const [applications, setApplications] = useState(initial);
  const [selected, setSelected] = useState<ProfessionalApplication | null>(
    null,
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [audit, setAudit] = useState<Audit[] | null>(null);
  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`admin/applications/${selected.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: f.get('decision'),
          reason: f.get('reason'),
          version: selected.version,
        }),
      });
      setApplications(
        await api<ProfessionalApplication[]>('admin/applications'),
      );
      setSelected(null);
      setMessage('حُفظ القرار وسجل التدقيق، وحُدّثت الصلاحيات على الخادم.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ القرار');
    } finally {
      setBusy(false);
    }
  }
  async function loadAudit() {
    try {
      setAudit(await api<Audit[]>('admin/audit'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل السجل');
    }
  }
  const context = {
    ...me,
    activeWorkspace:
      me.workspaces.find((w) => w.persona === 'platform_admin') ||
      me.activeWorkspace,
  };
  return (
    <IdentityShell me={context}>
      <div className="page-title">
        <div>
          <span className="eyebrow">إدارة المنصة · جلسة موثقة بخطوتين</span>
          <h1>مراجعة تستحق الثقة.</h1>
          <p>
            اعتماد المهنيين قرار مسؤول وموثّق، وليس فحصًا آليًا لرقم الترخيص.
          </p>
        </div>
        <ShieldCheck size={38} />
      </div>
      {error && !selected && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}
      <section className="finance-notice">
        <ShieldCheck size={24} />
        <div>
          <strong>تحقق من الأدلة قبل منح الوصول.</strong>
          <p>
            راجع الجهة والترخيص من مصدر مستقل، ثم وثّق سبب القرار. لا يعتمد
            الطلب لمجرد تقديم رقم مرجعي، ولا يمكنك مراجعة طلبك بنفسك.
          </p>
        </div>
      </section>
      <section className="panel verification-panel">
        <div className="panel-heading">
          <h2>طلبات الاعتماد المهني</h2>
          <label className="status-filter">
            الحالة
            <select
              aria-label="حالة طلبات الاعتماد"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">كل الحالات</option>
              {Object.entries(statusNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-application-list">
          {applications
            .filter((a) => filter === 'all' || a.status === filter)
            .map((a) => (
              <article className="review-card" key={a.id}>
                <span className="review-icon">
                  <FileCheck size={25} />
                </span>
                <div>
                  <span className="eyebrow">
                    {kindNames[a.kind]} · {a.applicant}
                  </span>
                  <h3>{a.display_name}</h3>
                  <small>
                    مرجع المستند: <bdi>{a.registration_number}</bdi>
                  </small>
                  {a.review_reason && <p>{a.review_reason}</p>}
                </div>
                <span
                  className={`status ${a.status === 'approved' ? 'paid' : a.status === 'pending' ? 'pending' : 'refunded'}`}
                >
                  {statusNames[a.status]}
                </span>
                {['pending', 'approved'].includes(a.status) && (
                  <button
                    className="button outline small"
                    onClick={() => {
                      setSelected(a);
                      setError('');
                    }}
                  >
                    مراجعة الطلب
                  </button>
                )}
              </article>
            ))}
          {!applications.filter((a) => filter === 'all' || a.status === filter)
            .length && (
            <div className="compact-empty">
              <Clock3 />
              <p>لا توجد طلبات في هذه الحالة ضمن آخر 100 طلب.</p>
            </div>
          )}
        </div>
      </section>
      <section className="panel audit-panel">
        <div className="panel-heading">
          <h2>سجل العمليات</h2>
          <button className="button outline small" onClick={loadAudit}>
            تحميل آخر 100 عملية
          </button>
        </div>
        {audit && (
          <ul className="audit-list">
            {audit.map((a) => (
              <li key={a.id}>
                <strong>
                  {a.action.startsWith('verification.')
                    ? 'قرار اعتماد مهني'
                    : a.action.startsWith('organization.')
                      ? 'تحديث عضوية أو منشأة'
                      : a.action.startsWith('admin.')
                        ? 'منح إداري محلي'
                        : 'تحديث هوية أو جلسة'}
                </strong>
                <time>
                  {new Intl.DateTimeFormat('ar-IQ', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Baghdad',
                  }).format(new Date(a.occurred_at))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <dialog
          className="invoice-dialog review-dialog"
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          onCancel={() => setSelected(null)}
          aria-labelledby="review-title"
        >
          <div className="dialog-top">
            <span className="small-chip">قرار ينشئ أو يسحب صلاحيات</span>
            <button
              className="icon-button"
              onClick={() => setSelected(null)}
              aria-label="إغلاق مراجعة الطلب"
            >
              <X size={20} />
            </button>
          </div>
          <h2 id="review-title">مراجعة {selected.display_name}</h2>
          <p className="panel-intro">
            المتقدم: {selected.applicant} · المرجع:{' '}
            <bdi>{selected.registration_number}</bdi>
          </p>
          {selected.notes && <p className="review-notes">{selected.notes}</p>}
          <form className="identity-form" onSubmit={decide}>
            <label>
              القرار
              <select name="decision">
                {selected.status === 'pending' ? (
                  <>
                    <option value="approved">اعتماد بعد التحقق</option>
                    <option value="rejected">رفض الطلب</option>
                  </>
                ) : (
                  <option value="suspended">تعليق الاعتماد وسحب الوصول</option>
                )}
              </select>
            </label>
            <label>
              سبب القرار ودليل المراجعة
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={1000}
                rows={4}
              />
            </label>
            <label className="check-label">
              <input type="checkbox" required />
              راجعت الأدلة والجهة ولا أراجع طلبي الشخصي.
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ القرار وسجل التدقيق'}
            </button>
          </form>
        </dialog>
      )}
    </IdentityShell>
  );
}
