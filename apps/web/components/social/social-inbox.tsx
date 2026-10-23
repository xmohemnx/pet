'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send,
  MessageCircle,
  ArrowRight,
  Paperclip,
  Shield,
} from 'lucide-react';
import type {
  IdentityMe,
  SocialProfile,
  SocialPerson,
  SocialMessage,
  MediaAsset,
} from '@petra/contracts';
import { api } from '../../lib/auth-client';
import { useChatRealtime } from '../use-chat-realtime';
import { PrivateVideo } from '../private-video';
import { ChatAttachments } from '../chat-attachments';
import { careDate } from '../care-shared';
import { SocialShell, SocialAvatar } from './social-shell';

export type SocialThread = {
  user_id: string;
  display_name: string;
  avatar_asset_id?: string | null;
  last_body: string;
  last_at: string;
  unread: number;
};
export function SocialInbox({
  me,
  profile,
  threads,
  peer,
  initialMessages = [],
}: {
  me: IdentityMe;
  profile: SocialProfile | null;
  threads: SocialThread[];
  peer?: SocialPerson;
  initialMessages?: SocialMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [asset, setAsset] = useState<MediaAsset | null>(null),
    [revoked, setRevoked] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    key = useRef<{ signature: string; value: string } | null>(null);
  const revoke = useCallback(() => {
    setRevoked(true);
    setMessages([]);
    setAsset(null);
    setError('لم تعد المحادثة متاحة وفق صلاحيات الحساب والخصوصية.');
  }, []);
  const realtime = useChatRealtime(peer?.user_id, setMessages, revoke);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!peer || busy || revoked || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const signature = JSON.stringify([
        peer.user_id,
        body.trim(),
        asset?.id ?? null,
      ]);
      if (key.current?.signature !== signature)
        key.current = { signature, value: crypto.randomUUID() };
      await api(`social/messages/${peer.user_id}`, {
        method: 'POST',
        body: JSON.stringify({
          body: body.trim(),
          idempotencyKey: key.current.value,
          ...(asset ? { assetId: asset.id } : {}),
        }),
      });
      setMessages(
        await api<SocialMessage[]>(`social/messages/${peer.user_id}`),
      );
      setBody('');
      setAsset(null);
      key.current = null;
      realtime.indicateTyping(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'تعذر الإرسال؛ أعد المحاولة بنفس الرسالة',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SocialShell me={me} profile={profile} wide>
      <div className="social-page-heading">
        <h1>حديث بين الرفاق.</h1>
        <p>رسائلك خاصة، ومشاركتك للموقع أو الحضور تبقى باختيارك.</p>
      </div>
      <div className={`social-inbox ${peer ? 'has-peer' : ''}`}>
        <aside className="social-thread-list">
          <div className="social-inbox-list-heading">
            <h2>الرسائل</h2>
            <Link href="/social/explore" aria-label="البحث عن شخص للمراسلة">
              <Send size={20} />
            </Link>
          </div>
          {threads.map((thread) => (
            <Link
              key={thread.user_id}
              href={`/social/inbox/${thread.user_id}`}
              className={`social-thread ${peer?.user_id === thread.user_id ? 'selected' : ''}`}
            >
              <SocialAvatar
                name={thread.display_name}
                assetId={thread.avatar_asset_id}
              />
              <span>
                <strong>{thread.display_name}</strong>
                <small>{thread.last_body}</small>
              </span>
              {thread.unread > 0 && (
                <b aria-label={`${thread.unread} رسائل غير مقروءة`}>
                  {thread.unread}
                </b>
              )}
            </Link>
          ))}
          {!threads.length && (
            <p className="social-thread-empty">
              لا محادثات بعد. افتح ملف شخص واضغط «رسالة» للبدء.
            </p>
          )}
        </aside>
        <section
          className="social-chat"
          aria-label={peer ? `محادثة ${peer.display_name}` : 'المحادثة'}
        >
          {peer ? (
            <>
              <header className="social-chat-header">
                <Link
                  href="/social/inbox"
                  className="social-inbox-back"
                  aria-label="العودة إلى صندوق الرسائل"
                >
                  <ArrowRight size={21} />
                </Link>
                <SocialAvatar
                  name={peer.display_name}
                  assetId={peer.avatar_asset_id}
                />
                <div>
                  <Link href={`/social/u/${peer.handle}`}>
                    <strong>{peer.display_name}</strong>
                  </Link>
                  <small role="status">
                    {revoked
                      ? 'المحادثة غير متاحة'
                      : realtime.typing
                        ? 'يكتب الآن…'
                        : realtime.online === true
                          ? 'متصل الآن بموافقته'
                          : realtime.connected
                            ? 'المحادثة متصلة'
                            : 'نحاول إعادة الاتصال؛ الرسائل محفوظة'}
                  </small>
                </div>
              </header>
              <div
                ref={list}
                className="social-chat-messages"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`social-message ${message.sender_id === me.user.id ? 'own' : ''}`}
                  >
                    <p>{message.body}</p>
                    {message.asset_id &&
                      (message.asset_kind === 'audio' ? (
                        <audio
                          controls
                          preload="none"
                          aria-label="مقطع صوتي خاص"
                          src={`/api/v1/media/${message.asset_id}/file`}
                        />
                      ) : message.asset_kind === 'video' ? (
                        <PrivateVideo
                          assetId={message.asset_id}
                          label="فيديو محادثة خاص"
                        />
                      ) : (
                        <img
                          src={`/api/v1/media/${message.asset_id}/file`}
                          alt="صورة خاصة بالمحادثة"
                          loading="lazy"
                        />
                      ))}
                    <small>
                      {careDate(message.created_at)}
                      {message.sender_id === me.user.id && message.read_at
                        ? ' · مقروءة'
                        : ''}
                    </small>
                  </article>
                ))}
                {!messages.length && !revoked && (
                  <p className="social-chat-first">ابدأ بتحية لطيفة.</p>
                )}
              </div>
              {error && (
                <p role="alert" className="social-error">
                  {error}
                </p>
              )}
              {!revoked && (
                <>
                  <details className="social-chat-attachments">
                    <summary>
                      <Paperclip size={16} /> إضافة صورة أو صوت
                    </summary>
                    <ChatAttachments
                      peer={peer.user_id}
                      selectedId={asset?.id}
                      onReady={setAsset}
                    />
                  </details>
                  <form className="social-chat-compose" onSubmit={send}>
                    <label className="sr-only" htmlFor="social-message-text">
                      نص الرسالة
                    </label>
                    <textarea
                      id="social-message-text"
                      required
                      maxLength={3000}
                      value={body}
                      placeholder="اكتب رسالة…"
                      onChange={(e) => {
                        setBody(e.target.value);
                        realtime.indicateTyping(!!e.target.value.trim());
                      }}
                      onBlur={() => realtime.indicateTyping(false)}
                    />
                    <button
                      type="submit"
                      className="social-button"
                      aria-label="إرسال الرسالة"
                      disabled={busy || !body.trim()}
                    >
                      <Send size={20} />
                    </button>
                  </form>
                </>
              )}
              <p className="social-chat-note">
                <Shield size={13} /> يعرض السجل آخر100رسالة.{' '}
                <Link href="/social/settings">إدارة الحظر والخصوصية</Link>
              </p>
            </>
          ) : (
            <div className="social-inbox-welcome">
              <MessageCircle size={48} />
              <h2>رفقة تبدأ برسالة.</h2>
              <p>اختر محادثة، أو افتح ملف أحد الرفاق لتبدأ حديثاً جديداً.</p>
              <Link className="social-button" href="/social/explore">
                اكتشف المجتمع
              </Link>
            </div>
          )}
        </section>
      </div>
    </SocialShell>
  );
}
