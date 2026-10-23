'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Grid3X3, LockKeyhole, Send, Settings, Camera } from 'lucide-react';
import type {
  IdentityMe,
  SocialProfile,
  SocialProfileView,
  SocialTimeline,
  MediaAsset,
} from '@petra/contracts';
import { SocialShell, SocialAvatar } from './social-shell';
import { SocialPostCard } from './social-post';
import { api } from '../../lib/auth-client';
import { CareForm } from '../care-shared';

export function SocialProfilePage({
  me,
  ownProfile,
  initial,
  timeline,
  assets,
}: {
  me: IdentityMe;
  ownProfile: SocialProfile | null;
  initial: SocialProfileView;
  timeline: SocialTimeline;
  assets: MediaAsset[];
}) {
  const router = useRouter();
  const [view, setView] = useState(initial),
    [posts, setPosts] = useState(timeline),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const p = view.profile,
    own = p.user_id === me.user.id;
  async function more() {
    if (!posts.nextCursor || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<SocialTimeline>(
        `social/timeline?author=${p.user_id}&cursor=${encodeURIComponent(posts.nextCursor)}`,
      );
      setPosts((previous) => ({
        ...result,
        items: [
          ...previous.items,
          ...result.items.filter(
            (item) => !previous.items.some((old) => old.id === item.id),
          ),
        ],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد');
    } finally {
      setBusy(false);
    }
  }
  async function follow() {
    setBusy(true);
    setError('');
    try {
      await api(`social/users/${p.user_id}/follow`, {
        method: p.follow_status ? 'DELETE' : 'POST',
        body: p.follow_status ? undefined : '{}',
      });
      setView(await api<SocialProfileView>(`social/profiles/${p.handle}`));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تغيير المتابعة');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SocialShell me={me} profile={ownProfile} wide>
      <div className="social-profile-header">
        <SocialAvatar
          name={p.display_name}
          assetId={p.avatar_asset_id}
          size="profile"
        />
        <div>
          <div className="social-profile-title">
            <h1>{p.display_name}</h1>
            {own ? (
              <Link className="social-button secondary" href="/social/settings">
                <Settings size={17} /> الخصوصية والإعدادات
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="social-button"
                  onClick={() => void follow()}
                >
                  {p.follow_status === 'accepted'
                    ? 'إلغاء المتابعة'
                    : p.follow_status === 'pending'
                      ? 'إلغاء طلب المتابعة'
                      : 'متابعة'}
                </button>
                <Link
                  href={`/social/inbox/${p.user_id}`}
                  className="social-button secondary"
                >
                  <Send size={17} /> رسالة
                </Link>
              </>
            )}
          </div>
          <p className="social-handle">
            <bdi>@{p.handle}</bdi>
          </p>
          {view.canView && (
            <dl className="social-profile-counts">
              <div>
                <dt>منشور</dt>
                <dd>{view.counts.posts}</dd>
              </div>
              <div>
                <dt>متابعون</dt>
                <dd>{view.counts.followers}</dd>
              </div>
              <div>
                <dt>أتابعهم</dt>
                <dd>{view.counts.following}</dd>
              </div>
            </dl>
          )}
          <p className="social-profile-bio">{p.bio}</p>
          <p className="social-privacy-note">
            <LockKeyhole size={14} />{' '}
            {p.privacy === 'private' ? 'حساب خاص' : 'حساب عام ضمن مجتمع Petra'}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
      {own && (
        <details className="social-profile-edit">
          <summary>تعديل الاسم والمعرّف والصورة</summary>
          <CareForm
            label="حفظ الملف الشخصي"
            submit={async (f) => {
              const saved = await api<SocialProfile>('social/profile', {
                method: 'POST',
                body: JSON.stringify({
                  displayName: f.get('displayName'),
                  handle: f.get('handle'),
                  bio: f.get('bio'),
                  privacy: f.get('privacy'),
                  avatarAssetId: f.get('avatar') || null,
                }),
              });
              router.push(`/social/u/${saved.handle}`);
              router.refresh();
            }}
          >
            <label>
              اسم العرض
              <input
                name="displayName"
                defaultValue={p.display_name}
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label>
              معرّف الحساب
              <input
                name="handle"
                dir="ltr"
                defaultValue={p.handle}
                pattern="[a-z][a-z0-9_]{2,29}"
                minLength={3}
                maxLength={30}
                required
              />
              <small>حروف إنجليزية صغيرة وأرقام وشرطة سفلية؛ يبدأ بحرف.</small>
            </label>
            <label>
              نبذة
              <textarea name="bio" defaultValue={p.bio} maxLength={500} />
            </label>
            <label>
              خصوصية الحساب
              <select name="privacy" defaultValue={p.privacy}>
                <option value="public">عام</option>
                <option value="private">خاص</option>
              </select>
            </label>
            <label>
              الصورة الشخصية
              <select name="avatar" defaultValue={p.avatar_asset_id ?? ''}>
                <option value="">دون صورة</option>
                {assets
                  .filter((a) => a.kind === 'image' && a.status === 'ready')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      صورة · {a.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          </CareForm>
        </details>
      )}
      <div className="social-profile-tabs">
        <Grid3X3 size={19} aria-hidden="true" /> المنشورات{' '}
        <Link
          href={own ? '/social/reels' : `/social/reels?author=${p.user_id}`}
        >
          ريلز
        </Link>
      </div>
      {!view.canView ? (
        <section className="social-empty">
          <LockKeyhole size={38} />
          <h2>هذه الحكايات للرفاق المقبولين.</h2>
          <p>أرسل طلب متابعة؛ تبقى المنشورات والوسائط خاصة حتى الموافقة.</p>
        </section>
      ) : !posts.items.length ? (
        <section className="social-empty">
          <Camera size={38} />
          <h2>الحكاية الأولى لم تُكتب بعد.</h2>
          {own && (
            <Link href="/social/create" className="social-button">
              شارك أول منشور
            </Link>
          )}
        </section>
      ) : (
        <div className="social-profile-posts">
          {posts.items.map((post) => (
            <SocialPostCard key={post.id} initial={post} />
          ))}
        </div>
      )}
      {view.canView && posts.nextCursor && (
        <button
          type="button"
          className="social-load-more"
          disabled={busy}
          onClick={() => void more()}
        >
          {busy ? 'نحمّل المزيد…' : 'المزيد من منشورات الحساب'}
        </button>
      )}
    </SocialShell>
  );
}
