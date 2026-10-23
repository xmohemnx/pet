'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, Smartphone, KeyRound, LogOut } from 'lucide-react';
import QRCode from 'qrcode';
import type { IdentityMe } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { authClient, authError, api } from '../lib/auth-client';
import { AccountDelete } from './account-delete';
import { PasswordField } from './password-field';
interface Session {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ipAddress?: string;
}
export function SecurityPanel({ me }: { me: IdentityMe }) {
  const [enabled, setEnabled] = useState(me.user.twoFactorEnabled);
  const [setup, setSetup] = useState<{ uri: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setSessions(await api<Session[]>('auth/list-sessions'));
  }
  useEffect(() => {
    load().catch(() => setError('تعذر تحميل الجلسات'));
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إتمام العملية');
    } finally {
      setBusy(false);
    }
  }
  function enable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action(async () => {
      const result = await authClient.twoFactor.enable({
        password: String(f.get('password')),
        method: 'totp',
      });
      if (result.error) throw new Error(authError(result.error.code));
      if (result.data && 'totpURI' in result.data) {
        setSetup({
          uri: result.data.totpURI,
          qr: await QRCode.toDataURL(result.data.totpURI, {
            width: 220,
            margin: 2,
          }),
        });
        setCodes(result.data.backupCodes);
      }
    });
  }
  function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action(async () => {
      const result = await authClient.twoFactor.verifyTotp({
        code: String(f.get('code')),
        trustDevice: false,
      });
      if (result.error) throw new Error(authError(result.error.code));
      setEnabled(true);
      setSetup(null);
      setMessage(
        'تم تفعيل التحقق بخطوتين. احتفظ برموز الاسترداد الآن وسجّل الدخول من جديد قبل الاعتماد المالي.',
      );
      await load();
    });
  }
  function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void action(async () => {
      const r = await authClient.changePassword({
        currentPassword: String(f.get('currentPassword')),
        newPassword: String(f.get('newPassword')),
        revokeOtherSessions: true,
      });
      if (r.error) throw new Error(authError(r.error.code));
      setMessage('تم تغيير كلمة المرور وإلغاء الجلسات الأخرى.');
      form.reset();
      await load();
    });
  }
  return (
    <IdentityShell me={me}>
      <div className="page-title">
        <div>
          <h1>أمان حسابك، بيدك.</h1>
          <p>راجع جلساتك وأضف خطوة لحماية الدخول.</p>
        </div>
        <ShieldCheck size={35} />
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
              <h2>التحقق بخطوتين</h2>
              <span className={`status ${enabled ? 'paid' : 'pending'}`}>
                {enabled ? 'مفعّل' : 'غير مفعّل'}
              </span>
            </div>
            <p className="panel-intro">
              استخدم تطبيق مصادقة يدعم TOTP. يلزم للإدارة إدخال رمز عند كل دخول،
              ولا يتوفر تجاوز «جهاز موثوق».
            </p>
            {!enabled && !setup && (
              <form className="identity-form" onSubmit={enable}>
                <PasswordField
                  label="كلمة المرور لتأكيد الإعداد"
                  name="password"
                  required
                  autoComplete="current-password"
                  disabled={busy}
                  maxLength={128}
                />
                <button className="button primary" disabled={busy}>
                  بدء إعداد التحقق بخطوتين <ShieldCheck size={18} />
                </button>
              </form>
            )}
            {setup && (
              <div className="mfa-setup">
                <img
                  src={setup.qr}
                  width={220}
                  height={220}
                  alt="رمز إعداد تطبيق المصادقة؛ احفظه بشكل خاص"
                />
                <p>
                  امسح الرمز بتطبيق المصادقة، ثم أدخل الرمز الحالي لإكمال
                  التفعيل.
                </p>
                <details>
                  <summary>الإعداد اليدوي</summary>
                  <label>
                    مفتاح الإعداد
                    <input
                      readOnly
                      value={
                        new URL(setup.uri).searchParams.get('secret') || ''
                      }
                      dir="ltr"
                    />
                  </label>
                </details>
                <form className="identity-form" onSubmit={verify}>
                  <label>
                    رمز التحقق
                    <input
                      name="code"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      minLength={6}
                      maxLength={6}
                      dir="ltr"
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    تأكيد التفعيل
                  </button>
                </form>
              </div>
            )}
            {!!codes.length && (
              <div className="backup-codes">
                <h3>رموز الاسترداد — احتفظ بها الآن</h3>
                <p>
                  تظهر في جلسة الإعداد فقط. كل رمز يستخدم مرة واحدة؛ لا تشاركها
                  أو ترسلها في محادثة.
                </p>
                <ul>
                  {codes.map((c) => (
                    <li key={c}>
                      <code dir="ltr">{c}</code>
                    </li>
                  ))}
                </ul>
                <button
                  className="button outline small"
                  onClick={() => setCodes([])}
                >
                  حفظت نسخة آمنة، أخفِ الرموز
                </button>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>الأجهزة والجلسات</h2>
              <Smartphone size={23} />
            </div>
            <p className="panel-intro">
              تؤدي إزالة الجلسة إلى رفض طلباتها اللاحقة من الخادم.
            </p>
            {sessions.map((s) => (
              <div className="session-row" key={s.id}>
                <span className="session-icon">
                  <Smartphone size={20} />
                </span>
                <div>
                  <strong>
                    {s.id === me.sessionId ? 'هذه الجلسة' : 'جلسة أخرى'}
                  </strong>
                  <small>
                    {s.userAgent?.includes('Mobile')
                      ? 'جهاز محمول'
                      : 'متصفح ويب'}{' '}
                    ·{' '}
                    {new Intl.DateTimeFormat('ar-IQ', {
                      dateStyle: 'medium',
                      timeZone: 'Asia/Baghdad',
                    }).format(new Date(s.createdAt))}
                  </small>
                </div>
                {s.id !== me.sessionId && (
                  <button
                    className="button outline small"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api('auth/revoke-session', {
                          method: 'POST',
                          body: JSON.stringify({ token: s.token }),
                        });
                        setMessage('أُلغيت الجلسة.');
                        await load();
                      })
                    }
                  >
                    إلغاء الجلسة
                  </button>
                )}
              </div>
            ))}
            <button
              className="button outline small"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api('auth/revoke-other-sessions', {
                    method: 'POST',
                    body: '{}',
                  });
                  setMessage('أُلغيت الجلسات الأخرى.');
                  await load();
                })
              }
            >
              <LogOut size={16} />
              إلغاء كل الجلسات الأخرى
            </button>
          </section>
        </div>
        <aside>
          <AccountDelete />
          <section className="panel">
            <div className="panel-heading">
              <h2>تغيير كلمة المرور</h2>
              <KeyRound size={22} />
            </div>
            <form className="identity-form" onSubmit={changePassword}>
              <PasswordField
                label="كلمة المرور الحالية"
                name="currentPassword"
                required
                autoComplete="current-password"
                disabled={busy}
                maxLength={128}
              />
              <PasswordField
                label="كلمة المرور الجديدة"
                name="newPassword"
                required
                autoComplete="new-password"
                disabled={busy}
                maxLength={128}
                minLength={12}
              />
              <button className="button primary" disabled={busy}>
                حفظ كلمة المرور
              </button>
            </form>
          </section>
          <div className="roadmap-note">
            <ShieldCheck size={22} />
            <p>
              لا تطلب Petra منك إرسال كلمة المرور أو رمز التحقق أو رموز
              الاسترداد للدعم.
            </p>
          </div>
        </aside>
      </div>
    </IdentityShell>
  );
}
