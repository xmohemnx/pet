'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  Compass,
  Clapperboard,
  Send,
  SquarePlus,
  Bookmark,
  Settings,
  ArrowRight,
  Bell,
  PawPrint,
} from 'lucide-react';
import type { IdentityMe, SocialProfile } from '@petra/contracts';
import { Brand } from '../brand';

export function SocialAvatar({
  name,
  assetId,
  size = '',
}: {
  name: string;
  assetId?: string | null;
  size?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`social-avatar ${size}`}>
      {assetId && failed !== assetId ? (
        <img
          src={`/api/v1/media/${assetId}/file`}
          alt={`صورة ${name}`}
          onError={() => setFailed(assetId)}
        />
      ) : (
        <span aria-hidden="true">{name.trim().slice(0, 1)}</span>
      )}
    </span>
  );
}
export function SocialShell({
  me,
  profile,
  children,
  wide = false,
}: {
  me: IdentityMe;
  profile: SocialProfile | null;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const path = usePathname();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const links = [
    ['/social', 'الرئيسية', Home],
    ['/social/explore', 'اكتشف', Compass],
    ['/social/reels', 'ريلز', Clapperboard],
    ['/social/inbox', 'الرسائل', Send],
    ['/social/create', 'إنشاء', SquarePlus],
    ['/social/saved', 'المحفوظات', Bookmark],
  ] as const;
  const myProfile = profile?.handle
    ? `/social/u/${profile.handle}`
    : '/social/settings';
  return (
    <div className="social-app">
      <aside className="social-rail" aria-label="تنقل مجتمع Petra">
        <Brand />
        <p className="social-rail-note">مساحة صغيرة. رفقة كبيرة.</p>
        <nav aria-label="أقسام المجتمع">
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (href === '/social' ? path === href : path.startsWith(href))
                  ? 'page'
                  : undefined
              }
            >
              <Icon size={23} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="social-rail-bottom">
          <Link href={myProfile} className="social-account">
            <SocialAvatar
              name={profile?.display_name ?? me.user.name}
              assetId={profile?.avatar_asset_id}
            />
            <span>
              <strong>{profile?.display_name ?? me.user.name}</strong>
              <small>
                {profile?.handle ? (
                  <bdi>@{profile.handle}</bdi>
                ) : (
                  'أنشئ ملفك الاجتماعي'
                )}
              </small>
            </span>
          </Link>
          <Link href="/social/settings">
            <Settings size={19} aria-hidden="true" /> إعدادات المجتمع
          </Link>
          <Link href="/app">
            <ArrowRight size={19} aria-hidden="true" /> العودة إلى مساحتي
          </Link>
        </div>
      </aside>
      <div className="social-stage">
        <header className="social-topbar">
          <div className="social-mobile-brand">
            <Brand />
          </div>
          <Link className="social-discover-link" href="/social/explore">
            <Compass size={19} aria-hidden="true" /> اكتشف حكاية جديدة
          </Link>
          <div className="social-top-actions">
            <Link href="/notifications" aria-label="الإشعارات">
              <Bell size={21} />
            </Link>
            <Link href="/social/inbox" aria-label="فتح الرسائل">
              <Send size={21} />
            </Link>
            <Link
              href="/social/create"
              className="social-button social-create-top"
            >
              <SquarePlus size={18} aria-hidden="true" /> شارك لحظة
            </Link>
          </div>
        </header>
        {offline && (
          <p className="social-offline" role="status">
            أنت غير متصل. أعد المحاولة بعد عودة الاتصال؛ لا تعتبر العملية محفوظة
            حتى يظهر تأكيدها.
          </p>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={`social-main ${wide ? 'social-main-wide' : ''}`}
        >
          {children}
        </main>
        <footer className="social-footer">
          <PawPrint size={16} aria-hidden="true" /> لكل رفيق حكاية.{' '}
          <Link href="/content/privacy">الخصوصية</Link>
          <Link href="/content/terms">الشروط</Link>
        </footer>
      </div>
      <nav className="social-bottom-nav" aria-label="تنقل المجتمع على الهاتف">
        {links.slice(0, 5).map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={
              path === href || (href !== '/social' && path.startsWith(href))
                ? 'page'
                : undefined
            }
          >
            <Icon size={23} />
            <span>{label}</span>
          </Link>
        ))}
        <Link href={myProfile} aria-label="ملفي الشخصي">
          <SocialAvatar
            name={profile?.display_name ?? me.user.name}
            assetId={profile?.avatar_asset_id}
            size="small"
          />
          <span>ملفي</span>
        </Link>
      </nav>
    </div>
  );
}
