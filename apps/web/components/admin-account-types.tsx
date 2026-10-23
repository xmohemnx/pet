'use client';
import { useState, type FormEvent } from 'react';
import {
  accountTypeNames,
  type AccountTypeRequest,
  type IdentityMe,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { api } from '../lib/auth-client';
export function AdminAccountTypes({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: AccountTypeRequest[];
}) {
  const [requests, setRequests] = useState(initial),
    [selected, setSelected] = useState<AccountTypeRequest | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`admin/account-type-requests/${selected.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: data.get('decision'),
          reason: data.get('reason'),
          version: selected.version,
        }),
      });
      setSelected(null);
      setMessage(
        'حُفظ قرار الإدارة وسجل التدقيق. الموافقة تلغي الجلسات والصلاحيات السابقة؛ لا تمنح اعتماداً مهنياً تلقائياً.',
      );
      setRequests(
        await api<AccountTypeRequest[]>('admin/account-type-requests'),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'تعذر حفظ القرار. حدّث القائمة وأعد المحاولة.',
      );
    } finally {
      setBusy(false);
    }
  }
  const context = {
    ...me,
    activeWorkspace:
      me.workspaces.find((w) => w.persona === 'platform_admin') ??
      me.activeWorkspace,
  };
  return (
    <IdentityShell me={context}>
      <div className="page-title">
        <h1>طلبات تغيير نوع الحساب</h1>
        <p>
          تغيير النوع قرار إداري موثق. لا يمكن مراجعة طلبك بنفسك؛ تظل مراجعة
          الاعتماد المهني مستقلة.
        </p>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {selected && (
        <section className="panel" aria-labelledby="type-decision-title">
          <h2 id="type-decision-title">مراجعة طلب {selected.applicant}</h2>
          <p>
            {accountTypeNames[selected.from_type]} ←{' '}
            {accountTypeNames[selected.target_type]}
          </p>
          <p>{selected.reason}</p>
          <form onSubmit={decide} className="identity-form">
            <label>
              القرار
              <select name="decision" aria-label="القرار" disabled={busy}>
                <option value="rejected">رفض التغيير</option>
                <option value="approved">
                  الموافقة على التغيير وإلغاء الصلاحيات السابقة
                </option>
              </select>
            </label>
            <label>
              سبب القرار الإداري
              <textarea
                name="reason"
                minLength={10}
                maxLength={1000}
                required
                rows={3}
                disabled={busy}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'جارٍ حفظ القرار…' : 'حفظ قرار تغيير النوع'}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              إلغاء المراجعة
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>قائمة الطلبات</h2>
        {!requests.length ? (
          <p>لا توجد طلبات تغيير بعد.</p>
        ) : (
          requests.map((r) => (
            <article key={r.id} className="application-row">
              <div>
                <h3>{r.applicant}</h3>
                <p>
                  {accountTypeNames[r.from_type]} ←{' '}
                  {accountTypeNames[r.target_type]}
                </p>
                <p>{r.reason}</p>
                <p>
                  {
                    {
                      pending: 'قيد المراجعة',
                      approved: 'تمت الموافقة',
                      rejected: 'مرفوض',
                      cancelled: 'ملغى',
                    }[r.status]
                  }
                </p>
                {r.review_reason && <p>{r.review_reason}</p>}
              </div>
              {r.status === 'pending' && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => {
                    setSelected(r);
                    setError('');
                  }}
                >
                  مراجعة طلب التغيير
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </IdentityShell>
  );
}
