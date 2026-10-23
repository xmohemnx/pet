'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Heart,
  ShieldCheck,
  Building2,
  LogOut,
  PawPrint,
  ShoppingBag,
  CarFront,
  Users,
  Bell,
  CalendarDays,
  LayoutDashboard,
  Stethoscope,
  BookOpen,
  Menu,
  X,
} from 'lucide-react';
import { Brand } from './brand';
import { authClient, api } from '../lib/auth-client';
import type { IdentityMe } from '@petra/contracts';
import { accountTypeNames } from '@petra/contracts';
export function IdentityShell({
  me,
  children,
}: {
  me: IdentityMe;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
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
  const clinicId = me.activeWorkspace.clinicId;
  const professionalLinks =
    me.activeWorkspace.id === 'account'
      ? []
      : me.activeWorkspace.persona === 'clinic_member' && clinicId
        ? ([
            [`/clinic/${clinicId}`, 'نظرة عامة', LayoutDashboard],
            [`/clinic/${clinicId}/calendar`, 'تقويم العيادة', CalendarDays],
            [`/clinic/${clinicId}/commerce`, 'متجر العيادة', ShoppingBag],
            [`/clinic/${clinicId}/inventory`, 'المخزون', Building2],
            [`/clinic/${clinicId}/finance`, 'مالية العيادة', BookOpen],
            [`/clinic/${clinicId}/services`, 'الخدمات والباقات', PawPrint],
          ] as const)
        : me.activeWorkspace.persona === 'doctor'
          ? ([
              ['/doctor', 'مساحة الطبيب', Stethoscope],
              ['/doctor/planning', 'تخطيط المواعيد', CalendarDays],
            ] as const)
          : me.activeWorkspace.persona === 'driver'
            ? ([['/driver', 'مساحة السائق', CarFront]] as const)
            : me.activeWorkspace.persona === 'platform_admin'
              ? ([
                  ['/admin', 'مراجعات الاعتماد', ShieldCheck],
                  ['/admin/account-types', 'تغيير نوع الحساب', Users],
                  ['/admin/operations', 'التشغيل والرقابة', LayoutDashboard],
                  ['/admin/finance', 'مالية المنصة', BookOpen],
                  ['/admin/transport', 'نزاعات النقل', CarFront],
                ] as const)
              : [];
  const destinations = [
    ['/app', 'مساحتي', LayoutDashboard],
    ['/care', 'مركز الرعاية', PawPrint],
    ['/marketplace', 'المتجر', ShoppingBag],
    ['/services', 'الباقات والإقامة', Building2],
    ['/social', 'المجتمع', Users],
    ['/adoption', 'التبني والإنقاذ', Heart],
    ['/taxi', 'نقل الحيوانات', CarFront],
    ['/notifications', 'الإشعارات', Bell],
  ] as const;
  function active(href: string) {
    return (
      pathname === href ||
      (href !== '/app' &&
        !professionalLinks.some(
          ([item]) =>
            item !== href &&
            item.startsWith(href + '/') &&
            pathname?.startsWith(item),
        ) &&
        pathname?.startsWith(href + '/'))
    );
  }
  return (
    <div
      className="real-app petra-workspace"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu) {
          setMenu(false);
          menuButton.current?.focus();
        }
      }}
    >
      <header className="petra-workspace-top">
        <button
          type="button"
          className="icon-button petra-menu-toggle"
          ref={menuButton}
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-controls="petra-workspace-navigation"
          aria-label={menu ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل'}
        >
          {menu ? (
            <X size={21} aria-hidden="true" />
          ) : (
            <Menu size={21} aria-hidden="true" />
          )}
        </button>
        <div className="petra-workspace-context">
          <span>Petra / مساحة العمل</span>
          <strong>{me.activeWorkspace.name}</strong>
        </div>
        <div className="petra-user-menu">
          <span className="petra-user-name">{me.user.name}</span>
          <Link
            className="icon-button"
            href="/notifications"
            aria-label="فتح الإشعارات"
          >
            <Bell size={19} aria-hidden="true" />
          </Link>
          <button
            className="icon-button"
            onClick={logout}
            aria-label="تسجيل الخروج"
          >
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      </header>
      <aside
        id="petra-workspace-navigation"
        aria-label="شريط مساحات Petra"
        className={`petra-workspace-sidebar ${menu ? 'is-open' : ''}`}
      >
        <Brand />
        <div
          className="petra-workspace-switch"
          role="region"
          aria-label="مساحة الحساب"
        >
          <span>حساب {accountTypeNames[me.user.accountType]}</span>
          {me.workspaces.length > 1 ? (
            <>
              <label htmlFor="petra-workspace-select">مساحاتك المصرح بها</label>
              <select
                id="petra-workspace-select"
                value={me.activeWorkspace.id}
                onChange={(event) => change(event.target.value)}
                disabled={busy}
                aria-label="مساحة العمل"
              >
                {me.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <strong>{me.activeWorkspace.name}</strong>
          )}
          <Link href="/account">إعدادات الحساب وطلب تغيير النوع</Link>
        </div>
        {professionalLinks.length > 0 && (
          <nav className="petra-workspace-nav" aria-label="تنقل الحساب">
            <p>العمل اليومي</p>
            {professionalLinks.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? 'page' : undefined}
                onClick={() => setMenu(false)}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        )}
        <nav className="petra-workspace-nav" aria-label="أقسام Petra">
          <p>عالم Petra</p>
          {destinations.map(([href, label, Icon]) => (
            <Link
              href={href}
              key={href}
              aria-current={active(href) ? 'page' : undefined}
              onClick={() => setMenu(false)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="petra-workspace-utilities">
          <Link
            href="/security"
            aria-current={active('/security') ? 'page' : undefined}
          >
            <ShieldCheck size={18} aria-hidden="true" />
            أمان الحساب
          </Link>
          <Link href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            الصفحة الرئيسية
          </Link>
        </div>
        <div className="petra-sidebar-account">
          <span aria-hidden="true">{me.user.name.slice(0, 1)}</span>
          <div>
            <strong>{me.user.name}</strong>
            <small>حساب Petra</small>
          </div>
        </div>
      </aside>
      <div className="petra-workspace-canvas">
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <main id="main" className="real-main">
          {children}
        </main>
        <footer className="real-footer">
          <span>Petra · رعاية خاصة، وسجلات بموافقة صاحبها.</span>
          <Link href="/security">
            إدارة أمان الحساب <ArrowLeft size={14} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
