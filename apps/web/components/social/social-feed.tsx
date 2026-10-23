'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowUpLeft, Camera, Plus, Search } from 'lucide-react';
import type {
  IdentityMe,
  SocialProfile,
  SocialPost,
  SocialPerson,
  SocialTimeline,
} from '@petra/contracts';
import { api } from '../../lib/auth-client';
import { SocialShell, SocialAvatar } from './social-shell';
import { SocialPostCard } from './social-post';

export function StoryStrip({ stories }: { stories: SocialPost[] }) {
  const users = stories.filter(
    (s, i) => stories.findIndex((p) => p.user_id === s.user_id) === i,
  );
  return (
    <nav className="social-stories" aria-label="قصص المجتمع">
      <Link href="/social/create?kind=story" className="social-story">
        <span className="social-story-add">
          <Plus size={25} />
        </span>
        <span>قصتك</span>
      </Link>
      {users.map((story) => (
        <Link
          key={story.id}
          href={`/social/stories?start=${story.id}`}
          className="social-story"
        >
          <span className="social-story-ring">
            <SocialAvatar
              name={story.display_name}
              assetId={story.avatar_asset_id}
              size="large"
            />
          </span>
          <span>{story.display_name}</span>
        </Link>
      ))}
      {!users.length && (
        <p>
          لحظات صغيرة تستحق أن تُحكى.
          <br />
          <Link href="/social/create?kind=story">
            شارك أول قصة لك <ArrowUpLeft size={14} />
          </Link>
        </p>
      )}
    </nav>
  );
}
export function SocialFeed({
  me,
  profile,
  initial,
  stories,
  people,
  savedOnly = false,
  explore = false,
}: {
  me: IdentityMe;
  profile: SocialProfile | null;
  initial: SocialTimeline;
  stories: SocialPost[];
  people: SocialPerson[];
  savedOnly?: boolean;
  explore?: boolean;
}) {
  const [data, setData] = useState(initial),
    [scope, setScope] = useState('all'),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sequence = useRef(0);
  async function load(next: boolean, selectedScope = scope, term = query) {
    const run = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        scope: selectedScope,
        saved: String(savedOnly),
        q: term,
      });
      if (next && data.nextCursor) params.set('cursor', data.nextCursor);
      const result = await api<SocialTimeline>(`social/timeline?${params}`);
      if (run !== sequence.current) return;
      setData((previous) => ({
        ...result,
        items: next
          ? [
              ...previous.items,
              ...result.items.filter(
                (p) => !previous.items.some((old) => old.id === p.id),
              ),
            ]
          : result.items,
      }));
      setScope(selectedScope);
    } catch (e) {
      if (run === sequence.current)
        setError(e instanceof Error ? e.message : 'تعذر تحميل المنشورات');
    } finally {
      if (run === sequence.current) setBusy(false);
    }
  }
  return (
    <SocialShell me={me} profile={profile}>
      <div className="social-feed-layout">
        <div className="social-feed-column">
          <div className="social-feed-heading">
            <div>
              <h1>
                {savedOnly
                  ? 'لحظات احتفظت بها'
                  : explore
                    ? 'حكايات تستحق الاكتشاف'
                    : 'قريبون، بحكاياتهم.'}
              </h1>
              <p>
                {savedOnly
                  ? 'منشوراتك المحفوظة، حسب وقت نشرها.'
                  : 'من يوميات صغيرة إلى صداقات تدوم.'}
              </p>
            </div>
            <Link
              href="/social/create"
              className="social-camera-link"
              aria-label="إنشاء منشور جديد"
            >
              <Camera size={23} />
            </Link>
          </div>
          {!savedOnly && <StoryStrip stories={stories} />}
          <div className="social-feed-tools">
            <div role="group" aria-label="مصدر المنشورات">
              <button
                type="button"
                aria-pressed={scope === 'all'}
                onClick={() => void load(false, 'all')}
              >
                المجتمع
              </button>
              <button
                type="button"
                aria-pressed={scope === 'following'}
                onClick={() => void load(false, 'following')}
              >
                أتابعهم
              </button>
            </div>
            <span>الأحدث أولاً</span>
          </div>
          <form
            className="social-search"
            onSubmit={(e) => {
              e.preventDefault();
              void load(false);
            }}
          >
            <label className="sr-only" htmlFor="social-post-search">
              نص البحث في المنشورات
            </label>
            <Search size={18} aria-hidden="true" />
            <input
              id="social-post-search"
              type="search"
              maxLength={100}
              placeholder="ابحث عن حكاية…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              بحث المنشورات
            </button>
          </form>
          {error && (
            <div role="alert" className="social-error">
              {error}{' '}
              <button type="button" onClick={() => void load(false)}>
                إعادة المحاولة
              </button>
            </div>
          )}
          <div aria-busy={busy}>
            {data.items.map((post) => (
              <SocialPostCard key={post.id} initial={post} />
            ))}
          </div>
          {!data.items.length && (
            <section className="social-empty">
              <Camera size={38} aria-hidden="true" />
              <h2>
                {savedOnly ? 'ستجد لحظاتك المفضلة هنا' : 'هنا تبدأ حكاية جديدة'}
              </h2>
              <p>
                {savedOnly
                  ? 'اضغط علامة الحفظ على أي منشور للرجوع إليه.'
                  : scope === 'following'
                    ? 'تابع حساباً لتظهر منشوراته هنا بعد قبول المتابعة.'
                    : 'لا منشورات متاحة وفق البحث والخصوصية. شارك صورة أو اكتشف أشخاصاً.'}
              </p>
              <Link
                className="social-button"
                href={savedOnly ? '/social' : '/social/create'}
              >
                {savedOnly ? 'إلى المجتمع' : 'شارك لحظة'}
              </Link>
            </section>
          )}
          {data.nextCursor && (
            <button
              type="button"
              className="social-load-more"
              disabled={busy}
              onClick={() => void load(true)}
            >
              {busy ? 'نحمّل المزيد…' : 'المزيد من الحكايات'}
            </button>
          )}
        </div>
        <aside className="social-discovery">
          <Link
            href={
              profile?.handle
                ? `/social/u/${profile.handle}`
                : '/social/settings'
            }
            className="social-account"
          >
            <SocialAvatar
              name={profile?.display_name ?? me.user.name}
              assetId={profile?.avatar_asset_id}
              size="large"
            />
            <span>
              <strong>{profile?.display_name ?? me.user.name}</strong>
              <small>
                {profile?.handle ? (
                  <bdi>@{profile.handle}</bdi>
                ) : (
                  'أكمل ملفك لنبدأ الحكاية'
                )}
              </small>
            </span>
          </Link>
          <div className="social-side-heading">
            <h2>رفقة تستحق المعرفة</h2>
            <Link href="/social/explore">اكتشف</Link>
          </div>
          {people.slice(0, 5).map((person) => (
            <Link
              href={
                person.handle
                  ? `/social/u/${person.handle}`
                  : '/social/settings'
              }
              key={person.user_id}
              className="social-account social-person"
            >
              <SocialAvatar
                name={person.display_name}
                assetId={person.avatar_asset_id}
              />
              <span>
                <strong>{person.display_name}</strong>
                <small>
                  {person.privacy === 'private' ? 'حساب خاص' : 'من مجتمع Petra'}
                </small>
              </span>
              <ArrowUpLeft size={17} aria-hidden="true" />
            </Link>
          ))}
          {!people.length && (
            <p>تظهر هنا الحسابات التي يمكنك اكتشافها وفق إعدادات الخصوصية.</p>
          )}
          <div className="social-care-note">
            <Camera size={25} aria-hidden="true" />
            <h2>
              لحظة منك،
              <br />
              حكاية تجمعنا.
            </h2>
            <p>
              شارك صور رفيقك بأمان. ملفه الصحي يبقى خاصاً، بعيداً عن منشورات
              المجتمع.
            </p>
            <Link href="/social/create">
              اكتب حكايتك <ArrowUpLeft size={16} />
            </Link>
          </div>
          <Link className="social-world-link" href="/care">
            كل ما يخص رفيقك، في مركز الرعاية <ArrowUpLeft size={17} />
          </Link>
        </aside>
      </div>
    </SocialShell>
  );
}
