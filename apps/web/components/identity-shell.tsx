'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Heart,
  ShieldCheck,
  Building2,
  LogOut,
  PawPrint,
} from 'lucide-react';
import { Brand } from './brand';
import { authClient, api } from '../lib/auth-client';
import type { IdentityMe } from '@petra/contracts';
export function IdentityShell({
  me,
  children,
}: {
  me: IdentityMe;
  children: React.ReactNode;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function change(id: string) {
    setBusy(true);
    setError('');
    try {
      const w = await api<IdentityMe['activeWorkspace']>(
        'me/active-workspace',
        { method: 'POST', body: JSON.stringify({ workspaceId: id }) },
      );
      window.location.assign(
        w.persona === 'clinic_member'
          ? `/clinic/${w.clinicId}`
          : w.persona === 'platform_admin'
            ? '/admin'
            : w.persona === 'doctor'
              ? '/doctor'
              : w.persona === 'driver'
                ? '/driver'
                : '/app',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التبديل');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    const r = await authClient.signOut();
    if (r.error) {
      setError('تعذر تسجيل الخروج، أعد المحاولة');
      return;
    }
    window.location.assign('/login');
  }
  return (
    <div className="real-app">
      <header className="real-header">
        <Brand />
        <nav aria-label="تنقل الحساب">
          <Link href="/app">
            <Heart size={18} />
            مساحتي
          </Link>
          <Link href="/care">
            <PawPrint size={18} />
            مركز الرعاية
          </Link>
          {me.workspaces.some((w) => w.persona === 'doctor') && (
            <Link href="/doctor">مساحة الطبيب</Link>
          )}
          <Link href="/security">
            <ShieldCheck size={18} />
            أمان الحساب
          </Link>
          <Link href="/">
            <PawPrint size={18} />
            الرئيسية
          </Link>
        </nav>
        <button
          className="icon-button"
          onClick={logout}
          aria-label="تسجيل الخروج"
        >
          <LogOut size={18} />
        </button>
      </header>
      <div className="workspace-bar" role="region" aria-label="مساحة الحساب">
        <span>
          <Building2 size={17} />
          مرحبًا، {me.user.name}
        </span>
        <label>
          مساحة العمل
          <select
            value={me.activeWorkspace.id}
            onChange={(e) => change(e.target.value)}
            disabled={busy}
            aria-label="مساحة العمل"
          >
            {me.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="form-error wrap" role="alert">
          {error}
        </div>
      )}
      <nav className="feature-nav" aria-label="أقسام Petra">
        {[
          ['/care', 'الرعاية'],
          ['/marketplace', 'المتجر'],
          ['/services', 'الباقات والإقامة'],
          ['/social', 'المجتمع'],
          ['/adoption', 'التبني والإنقاذ'],
          ['/taxi', 'نقل الحيوانات'],
          ['/notifications', 'الإشعارات'],
        ].map(([href, label]) => (
          <Link key={href} href={href!}>
            {label}
          </Link>
        ))}
        {me.workspaces.some((w) => w.persona === 'driver') && (
          <Link href="/driver">مساحة السائق</Link>
        )}
        {me.workspaces.some((w) => w.persona === 'platform_admin') && (
          <Link href="/admin/operations">التشغيل والرقابة</Link>
        )}
      </nav>
      <main id="main" className="real-main">
        {children}
      </main>
      <footer className="real-footer">
        <span>Petra · رعاية خاصة، وسجلات بموافقة صاحبها.</span>
        <Link href="/demo/customer">
          شاهد نموذج التصميم <ArrowLeft size={14} />
        </Link>
      </footer>
    </div>
  );
}
