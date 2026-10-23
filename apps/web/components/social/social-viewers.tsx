'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Pause,
  Play,
  Send,
  Heart,
  Bookmark,
  MessageCircle,
} from 'lucide-react';
import type {
  IdentityMe,
  SocialProfile,
  SocialPost,
  SocialTimeline,
} from '@petra/contracts';
import { api } from '../../lib/auth-client';
import { PrivateVideo } from '../private-video';
import { SocialShell, SocialAvatar } from './social-shell';

export function SocialReels({
  me,
  profile,
  initial,
  startId,
  author,
}: {
  me: IdentityMe;
  profile: SocialProfile | null;
  initial: SocialTimeline;
  startId?: string;
  author?: string;
}) {
  const [data, setData] = useState(initial),
    [index, setIndex] = useState(
      Math.max(
        0,
        initial.items.findIndex((p) => p.id === startId),
      ),
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const start = useRef<number | null>(null),
    post = data.items[index];
  async function next() {
    if (index < data.items.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (!data.nextCursor || busy) return;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        kind: 'reel',
        cursor: data.nextCursor,
      });
      if (author) params.set('author', author);
      const result = await api<SocialTimeline>(`social/timeline?${params}`);
      setData((previous) => ({
        ...result,
        items: [...previous.items, ...result.items],
      }));
      if (result.items.length) setIndex(index + 1);
    } catch {
      setError('تعذر تحميل الريل التالي؛ حاول مجدداً.');
    } finally {
      setBusy(false);
    }
  }
  async function reaction(kind: 'like' | 'save') {
    if (!post || busy) return;
    setBusy(true);
    setError('');
    try {
      const enabled = kind === 'like' ? !post.liked : !post.saved;
      await api(`social/posts/${post.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ kind, enabled }),
      });
      setData((previous) => ({
        ...previous,
        items: previous.items.map((p) =>
          p.id === post.id
            ? kind === 'like'
              ? { ...p, liked: enabled, likes: p.likes + (enabled ? 1 : -1) }
              : { ...p, saved: enabled }
            : p,
        ),
      }));
    } catch {
      setError('تعذر حفظ التفاعل؛ حاول مجدداً.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SocialShell me={me} profile={profile} wide>
      <div className="social-viewer-heading">
        <h1>حكايات تتحرّك.</h1>
        <Link href="/social/create?kind=reel">شارك ريل</Link>
      </div>
      {!post ? (
        <section className="social-empty">
          <Play size={38} />
          <h2>الفيديو الأول ينتظر حكايته.</h2>
          <p>تظهر هنا الريلز التي اكتمل تجهيزها والمسموح لك برؤيتها.</p>
          <Link href="/social/create?kind=reel" className="social-button">
            إنشاء ريل
          </Link>
        </section>
      ) : (
        <>
          <div
            className="social-reels"
            tabIndex={0}
            role="region"
            aria-label="مشاهد الريلز؛ استخدم السهم للأعلى أو للأسفل للتنقل"
            onKeyDown={(e) => {
              if (
                (e.target as HTMLElement).closest('button,a,input,select,video')
              )
                return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                void next();
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex(Math.max(0, index - 1));
              }
            }}
            onTouchStart={(e) => {
              start.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const y = e.changedTouches[0]?.clientY;
              if (
                start.current !== null &&
                y !== undefined &&
                Math.abs(start.current - y) > 80
              ) {
                if (start.current > y) void next();
                else setIndex(Math.max(0, index - 1));
              }
              start.current = null;
            }}
          >
            <div className="social-reel-frame">
              <PrivateVideo
                key={post.id}
                assetId={post.asset_id!}
                label={`ريل ${post.display_name}`}
                autoPlayMuted
              />
              <div className="social-reel-caption">
                <Link
                  href={`/social/u/${post.handle}`}
                  className="social-account"
                >
                  <SocialAvatar
                    name={post.display_name}
                    assetId={post.avatar_asset_id}
                  />
                  <strong>{post.display_name}</strong>
                </Link>
                <p>{post.body}</p>
              </div>
            </div>
            <div className="social-reel-actions">
              <button
                type="button"
                aria-label={post.liked ? 'إلغاء الإعجاب' : 'إعجاب'}
                aria-pressed={post.liked}
                disabled={busy}
                onClick={() => void reaction('like')}
              >
                <Heart fill={post.liked ? 'currentColor' : 'none'} />
                <span>{post.likes}</span>
              </button>
              <Link
                href={`/social/posts/${post.id}#comments`}
                aria-label="تعليقات الريل"
              >
                <MessageCircle />
              </Link>
              <button
                type="button"
                aria-label={post.saved ? 'إلغاء الحفظ' : 'حفظ الريل'}
                aria-pressed={post.saved}
                disabled={busy}
                onClick={() => void reaction('save')}
              >
                <Bookmark fill={post.saved ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                aria-label="مشاركة الريل"
                onClick={() => {
                  void api<{ path: string }>(`social/posts/${post.id}/share`, {
                    method: 'POST',
                    body: '{}',
                  })
                    .then((r) => {
                      setNotice(new URL(r.path, location.origin).href);
                    })
                    .catch(() => setError('تعذر إنشاء رابط المشاركة'));
                }}
              >
                <Send />
              </button>
              <button
                type="button"
                aria-label="الريل السابق"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ChevronUp />
              </button>
              <button
                type="button"
                aria-label="الريل التالي"
                disabled={
                  busy || (index === data.items.length - 1 && !data.nextCursor)
                }
                onClick={() => void next()}
              >
                <ChevronDown />
              </button>
            </div>
          </div>
          {notice && (
            <p role="status" className="social-viewer-notice">
              رابط الريل:{' '}
              <a href={notice}>
                <bdi>{notice}</bdi>
              </a>
            </p>
          )}
          {error && (
            <p className="social-error" role="alert">
              {error}
            </p>
          )}
          <p className="social-viewer-note">
            فيديو واحد في كل مرة. يمكنك التحكم بالصوت والجودة من المشغل.{' '}
            <Link href={`/social/posts/${post.id}`}>تفاصيل الريل والإبلاغ</Link>
          </p>
        </>
      )}
    </SocialShell>
  );
}

export function SocialStories({
  me,
  profile,
  stories,
  startId,
}: {
  me: IdentityMe;
  profile: SocialProfile | null;
  stories: SocialPost[];
  startId?: string;
}) {
  const [index, setIndex] = useState(
      Math.max(
        0,
        stories.findIndex((p) => p.id === startId),
      ),
    ),
    [paused, setPaused] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [expired, setExpired] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    post = stories[index];
  const next = useCallback(() => {
    if (index < stories.length - 1) setIndex(index + 1);
    else setPaused(true);
  }, [index, stories.length]);
  useEffect(() => {
    setProgress(0);
    setError('');
    setExpired(false);
    setPaused(false);
    if (post && post.user_id !== me.user.id)
      void api(`social/posts/${post.id}/view`, {
        method: 'POST',
        body: '{}',
      }).catch(() =>
        setError('تعذر التحقق من القصة؛ ارجع إلى المجتمع وأعد فتحها.'),
      );
  }, [post?.id, me.user.id, post]);
  useEffect(() => {
    if (!post) return;
    const timer = setInterval(() => {
      if (
        post.expires_at &&
        new Date(post.expires_at).getTime() <= Date.now()
      ) {
        setExpired(true);
        video.current?.pause();
        return;
      }
      if (
        paused ||
        document.hidden ||
        matchMedia('(prefers-reduced-motion: reduce)').matches ||
        post.asset_kind === 'video'
      )
        return;
      setProgress((p) => Math.min(1, p + 0.0125));
    }, 100);
    return () => clearInterval(timer);
  }, [post, paused]);
  useEffect(() => {
    if (progress >= 1) next();
  }, [progress, next]);
  useEffect(() => {
    if (paused || expired) video.current?.pause();
  }, [paused, expired]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        setPaused(true);
        video.current?.pause();
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  return (
    <SocialShell me={me} profile={profile} wide>
      <div className="social-viewer-heading">
        <h1>لحظات اليوم.</h1>
        <Link href="/social">
          إغلاق القصص <X size={18} />
        </Link>
      </div>
      {!post ? (
        <section className="social-empty">
          <h2>لا قصص متاحة الآن.</h2>
          <p>
            تظهر القصص24ساعة وفق الخصوصية، ثم تبقى المميزة في مساحتها المنفصلة.
          </p>
          <Link href="/social/create?kind=story" className="social-button">
            شارك قصة
          </Link>
        </section>
      ) : (
        <div
          className="social-story-viewer"
          tabIndex={0}
          role="region"
          aria-label="مشاهد القصص"
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).closest('button,a,video')) return;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              next();
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setIndex(Math.max(0, index - 1));
            }
            if (e.code === 'Space') {
              e.preventDefault();
              setPaused((p) => !p);
            }
          }}
        >
          <div
            className="social-story-frame"
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest('button,a,video'))
                setPaused(true);
            }}
            onPointerUp={(e) => {
              if (!(e.target as HTMLElement).closest('button,a,video'))
                setPaused(false);
            }}
          >
            <div
              className="social-story-progress"
              aria-label={`القصة ${index + 1} من ${stories.length}`}
            >
              {stories.map((story, i) => (
                <span key={story.id}>
                  <i
                    style={{
                      transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})`,
                    }}
                  />
                </span>
              ))}
            </div>
            <header>
              <Link
                href={`/social/u/${post.handle}`}
                className="social-account"
              >
                <SocialAvatar
                  name={post.display_name}
                  assetId={post.avatar_asset_id}
                />
                <strong>{post.display_name}</strong>
              </Link>
              <button
                type="button"
                aria-label={paused ? 'متابعة القصة' : 'إيقاف القصة مؤقتاً'}
                onClick={() => {
                  if (paused && video.current)
                    void video.current.play().catch(() => undefined);
                  setPaused((p) => !p);
                }}
              >
                {paused ? <Play size={20} /> : <Pause size={20} />}
              </button>
            </header>
            {expired || error ? (
              <div className="social-story-unavailable">
                <h2>{expired ? 'انتهى وقت هذه القصة.' : error}</h2>
                <Link href="/social">العودة إلى المجتمع</Link>
              </div>
            ) : post.asset_id ? (
              post.asset_kind === 'video' ? (
                <video
                  key={post.id}
                  ref={video}
                  src={`/api/v1/media/${post.asset_id}/file`}
                  controls
                  playsInline
                  muted
                  preload="metadata"
                  aria-label={`فيديو قصة ${post.display_name}`}
                  onEnded={next}
                  onTimeUpdate={(e) => {
                    const element = e.currentTarget;
                    if (element.duration)
                      setProgress(element.currentTime / element.duration);
                  }}
                />
              ) : (
                <img
                  key={post.id}
                  src={`/api/v1/media/${post.asset_id}/file`}
                  alt={`قصة ${post.display_name}`}
                  onError={() =>
                    setError('الصورة لم تعد متاحة؛ أعد فتح القصة من المجتمع.')
                  }
                />
              )
            ) : (
              <div className="social-story-text">{post.body}</div>
            )}
            {!expired && !error && (
              <div className="social-story-caption">
                <p>{post.body}</p>
                <Link href={`/social/inbox/${post.user_id}`}>
                  <Send size={17} /> رد برسالة خاصة
                </Link>
              </div>
            )}
          </div>
          <div className="social-story-navigation">
            <button
              type="button"
              aria-label="القصة السابقة"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ChevronRight />
            </button>
            <span>
              {index + 1} / {stories.length}
            </span>
            <button
              type="button"
              aria-label="القصة التالية"
              disabled={index === stories.length - 1}
              onClick={next}
            >
              <ChevronLeft />
            </button>
          </div>
        </div>
      )}
    </SocialShell>
  );
}
