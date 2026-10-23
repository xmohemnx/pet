'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
  Search,
  Settings,
} from 'lucide-react';
import { Brand } from './brand';
import { MobileNavigation } from './mobile-navigation';
import { ConnectionStatus } from './connection-status';
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
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const media = matchMedia('(max-width: 1000px)');
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setMenu(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
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
    setSigningOut(true);
    try {
      const r = await authClient.signOut();
      if (r.error) throw new Error('تعذر تسجيل الخروج');
      window.location.assign('/login');
    } catch {
      setSigningOut(false);
      setError('تعذر تسجيل الخروج، تحقق من اتصالك وأعد المحاولة.');
    }
  }

  const clinicId = me.activeWorkspace.clinicId;
  const rawProfessionalLinks =
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
  const professionalLinks = rawProfessionalLinks.filter(([href]) => {
    if (me.activeWorkspace.persona !== 'clinic_member') return true;
    const capabilities = me.activeWorkspace.capabilities;
    const required: Record<string, string[]> = {
      calendar: ['clinic_admin', 'receptionist'],
      commerce: ['clinic_admin', 'commerce_manager'],
      inventory: ['clinic_admin', 'inventory_clerk'],
      finance: ['clinic_admin', 'clinic_accountant', 'cashier'],
    };
    const section = href.split('/')[3] ?? '';
    return (
      !required[section] ||
      capabilities.some((c) => required[section]!.includes(c))
    );
  });
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
  const normalizedQuery = query
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
  const matches = (label: string) =>
    label.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').includes(normalizedQuery);
  const visibleProfessional = professionalLinks.filter(([, label]) =>
    matches(label),
  );
  const visibleDestinations = destinations.filter(([, label]) =>
    matches(label),
  );
  const navigation = (
    <>
      <div className="petra-navigation-heading">
        <Brand />
        {mobile && (
          <button
            type="button"
            className="icon-button"
            onClick={() => setMenu(false)}
            aria-label="إغلاق قائمة التنقل"
          >
            <X size={21} aria-hidden="true" />
          </button>
        )}
      </div>
      <label className="petra-navigation-search">
        <span>ابحث في أقسام الموقع</span>
        <div>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            name="navigation-search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="الرعاية، المتجر…"
          />
        </div>
      </label>
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
      {visibleProfessional.length > 0 && (
        <nav className="petra-workspace-nav" aria-label="تنقل الحساب">
          <p>العمل اليومي</p>
          {visibleProfessional.map(([href, label, Icon]) => (
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
        {visibleDestinations.map(([href, label, Icon]) => (
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
      {query.trim() &&
        !visibleProfessional.length &&
        !visibleDestinations.length && (
          <div className="petra-navigation-empty" role="status">
            <p>لا توجد أقسام بهذا الاسم.</p>
            <button
              type="button"
              className="link-button"
              onClick={() => setQuery('')}
            >
              عرض جميع الأقسام
            </button>
          </div>
        )}
      <div className="petra-workspace-utilities">
        <Link
          href="/account"
          aria-current={active('/account') ? 'page' : undefined}
          onClick={() => setMenu(false)}
        >
          <Settings size={18} aria-hidden="true" />
          إعدادات الحساب
        </Link>
        <Link
          href="/security"
          onClick={() => setMenu(false)}
          aria-current={active('/security') ? 'page' : undefined}
        >
          <ShieldCheck size={18} aria-hidden="true" />
          أمان الحساب
        </Link>
        <Link href="/" onClick={() => setMenu(false)}>
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
    </>
  );
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
          onClick={() => {
            setQuery('');
            setMenu(!menu);
          }}
          aria-haspopup="dialog"
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
            disabled={signingOut}
            aria-label={signingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
          >
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      </header>
      {mobile ? (
        <MobileNavigation open={menu} onClose={() => setMenu(false)}>
          {navigation}
        </MobileNavigation>
      ) : (
        <aside
          id="petra-workspace-navigation"
          aria-label="شريط مساحات Petra"
          className="petra-workspace-sidebar"
        >
          {navigation}
        </aside>
      )}
      <div className="petra-workspace-canvas">
        <ConnectionStatus />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <main id="main" tabIndex={-1} className="real-main">
          {children}
        </main>
        <footer className="real-footer">
          <span>Petra · رعاية خاصة، وسجلات بموافقة صاحبها.</span>
          <Link href="/security">
            إدارة أمان الحساب <ArrowLeft size={14} aria-hidden="true" />
          </Link>
        </footer>
      </div>
      <nav
        className="petra-workspace-bottom"
        aria-label="الوصول السريع على الهاتف"
      >
        {(
          [
            [professionalLinks[0]?.[0] ?? '/app', 'مساحتي', LayoutDashboard],
            ['/care', 'الرعاية', PawPrint],
            ['/social', 'المجتمع', Users],
            ['/account', 'حسابي', Settings],
          ] as const
        ).map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? 'page' : undefined}
          >
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
