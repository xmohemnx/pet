'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Heart,
  ShieldCheck,
  PawPrint,
  Mail,
  KeyRound,
} from 'lucide-react';
import { Brand } from './brand';
import { authClient, authError } from '../lib/auth-client';
export function AuthForm({
  mode,
  token,
}: {
  mode: 'login' | 'register' | 'recover' | 'reset';
  token?: string;
}) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [backup, setBackup] = useState(false);
  const titles = {
    login: 'أهلًا بعودتك.',
    register: 'بداية حكاية جميلة.',
    recover: 'لنعد إلى حسابك.',
    reset: 'كلمة جديدة، بداية آمنة.',
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '');
    const password = String(form.get('password') || '');
    try {
      if (mfa) {
        const result = backup
          ? await authClient.twoFactor.verifyBackupCode({
              code: String(form.get('code')),
              trustDevice: false,
            })
          : await authClient.twoFactor.verifyTotp({
              code: String(form.get('code')),
              trustDevice: false,
            });
        if (result.error) throw new Error(authError(result.error.code));
        window.location.assign('/app');
        return;
      }
      if (mode === 'register') {
        const r = await authClient.signUp.email({
          name: String(form.get('name')),
          email,
          password,
          callbackURL: '/login?verified=1',
        });
        if (r.error) throw new Error(authError(r.error.code));
        setMessage(
          'أُنشئ طلب حسابك. أرسلنا رابطًا لتأكيد البريد؛ أكّد بريدك ثم سجل الدخول.',
        );
      }
      if (mode === 'login') {
        const r = await authClient.signIn.email({ email, password });
        if (r.error) throw new Error(authError(r.error.code));
        if (
          r.data &&
          'twoFactorRedirect' in r.data &&
          r.data.twoFactorRedirect
        ) {
          setMfa(true);
          return;
        }
        window.location.assign('/app');
      }
      if (mode === 'recover') {
        const r = await authClient.requestPasswordReset({
          email,
          redirectTo: '/reset-password',
        });
        if (r.error) throw new Error(authError(r.error.code));
        setMessage(
          'إذا كان البريد مرتبطًا بحساب، ستصله تعليمات الاستعادة. راجع بريدك خلال دقائق.',
        );
      }
      if (mode === 'reset') {
        if (!token) throw new Error('رابط الاستعادة غير موجود أو غير صالح');
        const r = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (r.error) throw new Error(authError(r.error.code));
        setMessage(
          'تم تغيير كلمة المرور وإلغاء الجلسات السابقة. يمكنك تسجيل الدخول من جديد.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إتمام الطلب');
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError('');
    const email =
      (document.querySelector('input[name=email]') as HTMLInputElement | null)
        ?.value || '';
    if (!email) {
      setError('اكتب بريدك الإلكتروني أولًا');
      setBusy(false);
      return;
    }
    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/login?verified=1',
      });
      setMessage('إذا كان الحساب يحتاج تأكيدًا ستصله رسالة جديدة.');
    } catch {
      setError('تعذر إرسال الرسالة');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand light />
        <div>
          <span className="eyebrow">عالمهم يبدأ بقربك.</span>
          <h2>
            لهم في قلبك مكان،
            <br />
            ولك هنا مساحة.
          </h2>
          <p>حساب واحد لرعاية رفيقك، وفريق عيادتك، وكل ما يأتي لاحقًا.</p>
          <div className="auth-story-symbols">
            <PawPrint />
            <Heart />
            <ShieldCheck />
          </div>
        </div>
        <small>Petra · نبني الرعاية خطوة بخطوة.</small>
      </div>
      <main id="main" className="auth-main">
        <Link href="/" className="text-link">
          الرئيسية <ArrowLeft size={16} />
        </Link>
        <div className="auth-card">
          <span className="auth-icon">
            {mfa ? (
              <ShieldCheck />
            ) : mode === 'recover' ? (
              <Mail />
            ) : (
              <KeyRound />
            )}
          </span>
          <span className="eyebrow">
            {mfa ? 'خطوة أخيرة لحماية حسابك' : 'مساحتك في Petra'}
          </span>
          <h1>{mfa ? 'تحقق من هويتك.' : titles[mode]}</h1>
          <p>
            {mfa
              ? 'أدخل الرمز الحالي من تطبيق المصادقة أو استخدم رمز استرداد.'
              : mode === 'register'
                ? 'أنشئ حساب عميل. الانضمام المهني يتم بطلب اعتماد منفصل.'
                : mode === 'recover'
                  ? 'أدخل بريدك وسنرسل لك تعليمات الاستعادة.'
                  : 'بياناتك تبقى ضمن حسابك، بصلاحيات واضحة.'}
          </p>
          <form onSubmit={submit} className="identity-form">
            {!mfa && mode === 'register' && (
              <label>
                الاسم الكامل
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            {!mfa && mode !== 'reset' && (
              <label>
                البريد الإلكتروني
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  dir="ltr"
                />
              </label>
            )}
            {!mfa && mode !== 'recover' && (
              <label>
                {mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
                <input
                  name="password"
                  aria-label={
                    mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'
                  }
                  aria-describedby={
                    mode !== 'login' ? 'password-hint' : undefined
                  }
                  type="password"
                  required
                  minLength={mode === 'login' ? 1 : 12}
                  maxLength={128}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  dir="ltr"
                />
                {mode !== 'login' && (
                  <small id="password-hint">
                    12 حرفًا على الأقل؛ استخدم كلمة فريدة لهذا الحساب.
                  </small>
                )}
              </label>
            )}
            {mfa && (
              <label>
                {backup ? 'رمز الاسترداد' : 'رمز تطبيق المصادقة'}
                <input
                  name="code"
                  key={String(backup)}
                  required
                  inputMode={backup ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={backup ? 30 : 6}
                  minLength={backup ? 1 : 6}
                />
              </label>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="form-success" role="status">
                {message}
                {(mode === 'register' || mode === 'reset') && (
                  <Link href="/login">
                    انتقل لتسجيل الدخول <ArrowLeft size={15} />
                  </Link>
                )}
              </div>
            )}
            <button
              className="button primary"
              disabled={busy || (mode === 'reset' && !token)}
            >
              {busy
                ? 'جارٍ الإرسال…'
                : mfa
                  ? 'تأكيد الدخول'
                  : mode === 'register'
                    ? 'إنشاء حساب'
                    : mode === 'recover'
                      ? 'أرسل تعليمات الاستعادة'
                      : mode === 'reset'
                        ? 'حفظ كلمة المرور'
                        : 'تسجيل الدخول'}
              <ArrowLeft size={18} />
            </button>
          </form>
          {mfa ? (
            <button
              className="link-button"
              onClick={() => {
                setBackup(!backup);
                setError('');
              }}
            >
              {backup ? 'استخدم تطبيق المصادقة' : 'استخدم رمز استرداد'}
            </button>
          ) : (
            <div className="auth-links">
              {mode === 'login' && (
                <>
                  <Link href="/recover">نسيت كلمة المرور؟</Link>
                  <button
                    className="link-button"
                    onClick={resend}
                    disabled={busy}
                  >
                    إعادة إرسال تأكيد البريد
                  </button>
                  <span>
                    جديد هنا؟ <Link href="/register">أنشئ حسابًا</Link>
                  </span>
                </>
              )}
              {mode === 'register' && (
                <span>
                  لديك حساب؟ <Link href="/login">سجل الدخول</Link>
                </span>
              )}
              {(mode === 'recover' || mode === 'reset') && (
                <Link href="/login">العودة لتسجيل الدخول</Link>
              )}
            </div>
          )}
        </div>
        <p className="auth-footnote">
          الخدمات الطبية والمالية لم تُطلق بعد. الحسابات هنا هي أساس المرحلة
          الجديدة.
        </p>
      </main>
    </div>
  );
}
