'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  Heart,
  Bookmark,
  MessageCircle,
  Send,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  LockKeyhole,
  Globe2,
} from 'lucide-react';
import type { SocialPost } from '@petra/contracts';
import { api } from '../../lib/auth-client';
import { careDate } from '../care-shared';
import { PrivateVideo } from '../private-video';
import { SocialAvatar } from './social-shell';

export function SocialMedia({ post }: { post: SocialPost }) {
  const [index, setIndex] = useState(0);
  const media = post.media?.length
    ? post.media
    : post.asset_id
      ? [
          {
            asset_id: post.asset_id,
            kind: post.asset_kind ?? 'image',
            position: 0,
          },
        ]
      : [];
  const current = media[index];
  if (!current) return null;
  return (
    <div className="social-media" role="group" aria-label="وسائط المنشور">
      {current.kind === 'video' ? (
        <PrivateVideo
          key={current.asset_id}
          assetId={current.asset_id}
          label="فيديو المنشور"
        />
      ) : (
        <img
          key={current.asset_id}
          src={`/api/v1/media/${current.asset_id}/file`}
          alt={`صورة ${index + 1} من ${media.length} في منشور ${post.display_name}`}
          loading="lazy"
          decoding="async"
        />
      )}
      {media.length > 1 && (
        <>
          <span className="social-media-position" aria-live="polite">
            <bdi>
              {index + 1} / {media.length}
            </bdi>
          </span>
          <div className="social-carousel-controls">
            <button
              type="button"
              aria-label="الصورة السابقة"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ChevronRight size={19} />
            </button>
            <button
              type="button"
              aria-label="الصورة التالية"
              disabled={index === media.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <ChevronLeft size={19} />
            </button>
          </div>
          <div className="social-dots" aria-hidden="true">
            {media.map((m, i) => (
              <i key={m.asset_id} className={i === index ? 'current' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export function SocialPostCard({ initial }: { initial: SocialPost }) {
  const [post, setPost] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [shared, setShared] = useState(false);
  const profileLink = post.handle
    ? `/social/u/${post.handle}`
    : '/social/settings';
  async function react(kind: 'like' | 'save') {
    if (busy) return;
    const previous = post,
      enabled = kind === 'like' ? !post.liked : !post.saved;
    setBusy(true);
    setError('');
    setPost((p) =>
      kind === 'like'
        ? { ...p, liked: enabled, likes: p.likes + (enabled ? 1 : -1) }
        : { ...p, saved: enabled },
    );
    try {
      await api(`social/posts/${post.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ kind, enabled }),
      });
    } catch (e) {
      setPost(previous);
      setError(
        e instanceof Error ? e.message : 'تعذر حفظ التفاعل؛ حاول مجدداً',
      );
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setError('');
    try {
      const result = await api<{ path: string }>(
        `social/posts/${post.id}/share`,
        { method: 'POST', body: '{}' },
      );
      if (navigator.clipboard)
        await navigator.clipboard.writeText(
          new URL(result.path, location.origin).href,
        );
      setShared(true);
    } catch {
      setError('تعذر نسخ الرابط. افتح تفاصيل المنشور لمشاركته.');
    }
  }
  return (
    <article className="social-post" aria-label={`منشور ${post.display_name}`}>
      <header className="social-post-header">
        <Link href={profileLink} className="social-account">
          <SocialAvatar
            name={post.display_name}
            assetId={post.avatar_asset_id}
          />
          <span>
            <strong>{post.display_name}</strong>
            <small>
              <time dateTime={post.created_at}>
                {careDate(post.created_at)}
              </time>
              <span
                aria-label={
                  post.visibility === 'public'
                    ? 'عام وفق خصوصية الحساب'
                    : 'منشور محدود'
                }
              >
                {post.visibility === 'public' ? (
                  <Globe2 size={12} />
                ) : (
                  <LockKeyhole size={12} />
                )}
              </span>
            </small>
          </span>
        </Link>
        <Link
          href={`/social/posts/${post.id}`}
          className="social-icon"
          aria-label="تفاصيل المنشور وخياراته"
        >
          <MoreHorizontal size={23} />
        </Link>
      </header>
      <SocialMedia post={post} />
      <div className="social-post-content">
        <div className="social-reactions">
          <button
            type="button"
            disabled={busy}
            aria-pressed={post.liked}
            aria-label={post.liked ? 'إلغاء الإعجاب' : 'إعجاب'}
            onClick={() => void react('like')}
            className={post.liked ? 'is-liked' : ''}
          >
            <Heart size={24} fill={post.liked ? 'currentColor' : 'none'} />
          </button>
          <Link
            href={`/social/posts/${post.id}#comments`}
            aria-label="التعليقات"
          >
            <MessageCircle size={24} />
          </Link>
          <button
            type="button"
            aria-label="مشاركة المنشور"
            onClick={() => void share()}
          >
            <Send size={23} />
          </button>
          <button
            type="button"
            className="social-save"
            disabled={busy}
            aria-pressed={post.saved}
            aria-label={post.saved ? 'إلغاء الحفظ' : 'حفظ المنشور'}
            onClick={() => void react('save')}
          >
            <Bookmark size={23} fill={post.saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <p className="social-likes" aria-live="polite">
          {post.likes} إعجاب
        </p>
        <p className="social-body">
          <Link href={profileLink}>
            <strong>{post.display_name}</strong>
          </Link>{' '}
          {post.body}
        </p>
        <Link
          href={`/social/posts/${post.id}#comments`}
          className="social-comment-link"
        >
          {post.comments_count
            ? `عرض التعليقات (${post.comments_count})`
            : 'ابدأ حديثاً لطيفاً…'}
        </Link>
        {shared && (
          <p role="status">
            رابط المشاركة جاهز.{' '}
            <Link href={`/social/posts/${post.id}`}>فتح المنشور المشترك</Link>
          </p>
        )}
        {error && (
          <p role="alert" className="social-error">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
