'use client';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/auth-client';
export function AccountDelete() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function close(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('me/close-account', {
        method: 'POST',
        body: JSON.stringify({
          password: data.get('password'),
          confirmation: data.get('confirmation'),
        }),
      });
      window.location.assign('/login?closed=1');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'تعذر حذف الحساب؛ أعد المحاولة.',
      );
      setBusy(false);
    }
  }
  return (
    <section
      className="panel account-delete"
      id="delete-account"
      aria-labelledby="delete-account-title"
    >
      <h2 id="delete-account-title">حذف الحساب</h2>
      <p id="delete-account-policy">
        سيُغلق الدخول وتُلغى جميع جلساتك وتُخفى منشوراتك وملفك الاجتماعي. لا
        يمكن إعادة فتح الحساب. تُحفظ السجلات الطبية والمالية والتدقيق اللازمة
        بصورة مقيدة؛ لا يعني هذا محواً شاملاً لها، وقد تبقى رسائلك لدى أطراف
        المحادثة. يجب تسوية الرحلات والمواعيد النشطة ونقل إدارة العيادة أولاً.
      </p>
      <details>
        <summary>متابعة حذف حسابي</summary>
        <form
          className="identity-form"
          onSubmit={close}
          aria-describedby="delete-account-policy"
        >
          <p>
            يلزم تسجيل دخول خلال آخر 15 دقيقة وكلمة المرور الحالية. يمكنك تسجيل
            الخروج ثم الدخول مجدداً من القائمة.
          </p>
          <label>
            كلمة المرور لتأكيد الحذف
            <input
              name="password"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          <label>
            اكتب «حذف حسابي» للتأكيد
            <input
              name="confirmation"
              required
              pattern="حذف حسابي"
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <label className="confirmation-choice">
            <input type="checkbox" required disabled={busy} />
            أفهم أن الحساب سيُغلق وأن السجلات اللازمة ستبقى محفوظة بصورة مقيدة.
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button danger" disabled={busy}>
            {busy ? 'جارٍ إغلاق الحساب…' : 'حذف الحساب وإغلاق الدخول'}
          </button>
        </form>
      </details>
    </section>
  );
}
