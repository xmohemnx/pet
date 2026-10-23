'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  accountTypeNames,
  type AccountType,
  type AccountTypeRequest,
} from '@petra/contracts';
import { api } from '../lib/auth-client';
export function AccountTypeControls({ type }: { type: AccountType }) {
  const [requests, setRequests] = useState<AccountTypeRequest[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function load() {
    setRequests(await api<AccountTypeRequest[]>('me/account-type-requests'));
    setLoaded(true);
  }
  useEffect(() => {
    load().catch(() =>
      setError('تعذر تحميل طلبات التغيير. أعد تحميل الصفحة للمحاولة.'),
    );
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('me/account-type-requests', {
        method: 'POST',
        body: JSON.stringify({
          targetType: data.get('targetType'),
          reason: data.get('reason'),
        }),
      });
      setMessage(
        'أُرسل الطلب إلى الإدارة. يبقى نوع حسابك الحالي حتى الموافقة؛ لا ترسل طلباً آخر.',
      );
      form.reset();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'تعذر إرسال الطلب؛ أعد المحاولة.',
      );
    } finally {
      setBusy(false);
    }
  }
  const pending = requests.some((r) => r.status === 'pending');
  return (
    <section className="panel" aria-labelledby="account-type-title">
      <h2 id="account-type-title">نوع حسابك: {accountTypeNames[type]}</h2>
      <p>
        هذا النوع ثابت. تغيير الاسم أو فتح رابط قسم آخر لا يغيّر نوع الحساب. عند
        موافقة الإدارة على تغيير النوع تُلغى الجلسات والصلاحيات المهنية السابقة؛
        يلزم اعتماد جديد للحساب المهني.
      </p>
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
      <details>
        <summary>طلب تغيير نوع الحساب من الإدارة</summary>
        <form className="identity-form" onSubmit={submit}>
          <label>
            النوع المطلوب
            <select
              aria-label="النوع المطلوب"
              name="targetType"
              required
              disabled={!loaded || busy || pending}
              defaultValue=""
            >
              <option value="" disabled>
                اختر النوع الجديد
              </option>
              {(Object.keys(accountTypeNames) as AccountType[])
                .filter((t) => t !== type)
                .map((t) => (
                  <option key={t} value={t}>
                    {accountTypeNames[t]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            سبب طلب التغيير
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              disabled={!loaded || busy || pending}
            />
          </label>
          <button
            className="button outline"
            disabled={!loaded || busy || pending}
          >
            {busy
              ? 'جارٍ إرسال الطلب…'
              : pending
                ? 'لديك طلب قيد المراجعة'
                : 'إرسال طلب تغيير النوع'}
          </button>
        </form>
      </details>
      <div className="account-request-history" aria-live="polite">
        {!loaded ? (
          <p>جارٍ تحميل طلبات التغيير…</p>
        ) : (
          requests.map((r) => (
            <article key={r.id}>
              <strong>
                {accountTypeNames[r.from_type]} ←{' '}
                {accountTypeNames[r.target_type]}
              </strong>
              <p>
                {
                  {
                    pending: 'قيد مراجعة الإدارة',
                    approved: 'وافقت الإدارة',
                    rejected: 'رفضت الإدارة',
                    cancelled: 'أُلغي الطلب',
                  }[r.status]
                }
              </p>
              {r.review_reason && <p>سبب القرار: {r.review_reason}</p>}
            </article>
          ))
        )}
      </div>
      <Link className="text-link" href="/security#delete-account">
        إدارة تسجيل الدخول وحذف الحساب
      </Link>
    </section>
  );
}
