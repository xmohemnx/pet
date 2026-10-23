'use client';
import { useState, useCallback, useRef } from 'react';
import { PrivateVideo } from './private-video';
import { ChatAttachments } from './chat-attachments';
import { useChatRealtime } from './use-chat-realtime';
import Link from 'next/link';
import { StoryHighlights } from './story-highlights';
import type {
  IdentityMe,
  SocialProfile,
  SocialPost,
  SocialPerson,
  SocialMessage,
  SocialComment,
  MediaAsset,
} from '@petra/contracts';
import { Heart, MessageCircle, Bookmark } from 'lucide-react';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import { api } from '../lib/auth-client';
import { PlatformHeading, MediaUpload, Empty, mutate } from './platform-shared';
type Follower = { follower_id: string; display_name: string };
type Blocked = { blocked_id: string; display_name: string | null };
export function SocialCenter({
  me,
  initialProfile,
  initialPosts,
  initialPeople,
  initialAssets,
  initialRelationships,
}: {
  me: IdentityMe;
  initialProfile: SocialProfile | null;
  initialPosts: SocialPost[];
  initialPeople: SocialPerson[];
  initialAssets: MediaAsset[];
  initialRelationships: {
    requests: Follower[];
    followers: Follower[];
    blocks: Blocked[];
  };
}) {
  const [profile, setProfile] = useState(initialProfile),
    [posts, setPosts] = useState(initialPosts),
    [people, setPeople] = useState(initialPeople),
    [assets, setAssets] = useState(initialAssets),
    [kind, setKind] = useState('post'),
    [savedOnly, setSavedOnly] = useState(false),
    [requests, setRequests] = useState(initialRelationships.requests),
    [followers, setFollowers] = useState(initialRelationships.followers),
    [blocks, setBlocks] = useState(initialRelationships.blocks),
    [chat, setChat] = useState<SocialPerson | null>(null),
    [messages, setMessages] = useState<SocialMessage[]>([]),
    [selected, setSelected] = useState(''),
    [comments, setComments] = useState<SocialComment[]>([]);
  const [query, setQuery] = useState(''),
    [sharePath, setSharePath] = useState(''),
    [viewers, setViewers] = useState<
      Record<string, { display_name: string }[]>
    >({}),
    [highlightUser, setHighlightUser] = useState<string | null>(null);
  const clearChat = useCallback(() => {
    setChat(null);
    setMessages([]);
  }, []);
  const realtime = useChatRealtime(chat?.user_id, setMessages, clearChat);
  const messageKeys = useRef(new Map<string, string>());
  async function feed(k = kind, saved = savedOnly, search = query) {
    setPosts(
      await api<SocialPost[]>(
        `social/feed?kind=${k}&saved=${saved}&q=${encodeURIComponent(search)}`,
      ),
    );
  }
  const [chatAsset, setChatAsset] = useState<{
    peer: string;
    asset: MediaAsset;
  } | null>(null);
  async function refresh() {
    await feed();
    setAssets(await api<MediaAsset[]>('media'));
    setRequests(await api<typeof requests>('social/follow-requests'));
    setFollowers(await api<Follower[]>('social/followers'));
    setBlocks(await api<Blocked[]>('social/blocks'));
  }
  async function block(id: string) {
    await mutate(`social/users/${id}/block`);
    setChat(null);
    setMessages([]);
    setSelected('');
    setComments([]);
    setPeople(people.filter((p) => p.user_id !== id));
    await refresh();
  }
  async function openChat(p: SocialPerson) {
    const m = await api<SocialMessage[]>(`social/messages/${p.user_id}`);
    setChat(p);
    setMessages(m);
  }
  return (
    <IdentityShell me={me}>
      <Link className="button outline" href="/social">
        العودة إلى موجز المجتمع
      </Link>
      {profile?.handle && (
        <Link className="button outline" href={`/social/u/${profile.handle}`}>
          فتح ملفي الشخصي
        </Link>
      )}
      <PlatformHeading title="إدارة المجتمع والخصوصية">
        حدّد خصوصيتك، وأدر المتابعات والحظر ومحتواك من مكان واحد.
      </PlatformHeading>
      <StoryHighlights userId={me.user.id} own />
      <div className="social-layout">
        <div className="care-stack">
          <section className="panel care-section">
            <CareForm
              label="بحث المنشورات"
              submit={async (f) => {
                const value = String(f.get('postQuery')).trim();
                setQuery(value);
                await feed(kind, savedOnly, value);
              }}
            >
              <label>
                نص البحث في المنشورات
                <input name="postQuery" maxLength={100} type="search" />
              </label>
            </CareForm>
            <div className="social-tabs" role="group" aria-label="نوع المحتوى">
              <CareAction
                action={async () => {
                  setSavedOnly(!savedOnly);
                  await feed(kind, !savedOnly);
                }}
              >
                {savedOnly ? 'عرض جميع المنشورات' : 'عرض محفوظاتي'}
              </CareAction>
              {[
                ['post', 'المنشورات'],
                ['story', 'القصص'],
                ['reel', 'الريلز'],
              ].map(([k, t]) => (
                <CareAction
                  key={k}
                  action={async () => {
                    setKind(k!);
                    await feed(k);
                  }}
                >
                  {t}
                </CareAction>
              ))}
            </div>
          </section>
          {!posts.length && (
            <section className="panel care-section">
              <Empty>لا محتوى متاحًا وفق إعدادات الخصوصية الحالية.</Empty>
            </section>
          )}
          {posts.map((p) => (
            <article
              className={`panel social-card ${p.kind === 'reel' ? 'reel-card' : ''}`}
              key={p.id}
            >
              <div className="care-heading">
                <div>
                  <h2>{p.display_name}</h2>
                  <p>
                    {careDate(p.created_at)} ·{' '}
                    {
                      { public: 'عام', followers: 'المتابعون', private: 'خاص' }[
                        p.visibility
                      ]
                    }
                  </p>
                </div>
                {p.user_id !== me.user.id && (
                  <CareAction action={() => block(p.user_id)}>
                    حظر الحساب
                  </CareAction>
                )}
              </div>
              {p.asset_id &&
                (p.kind === 'reel' || p.asset_kind === 'video' ? (
                  <PrivateVideo assetId={p.asset_id} label="فيديو المنشور" />
                ) : (
                  <img
                    src={`/api/v1/media/${p.asset_id}/file`}
                    alt="وسيط مرفق بالمنشور"
                    loading="lazy"
                  />
                ))}
              <p className="social-body">{p.body}</p>
              <div className="social-actions">
                <CareAction
                  action={async () => {
                    const result = await api<{ path: string }>(
                      `social/posts/${p.id}/share`,
                      { method: 'POST', body: '{}' },
                    );
                    setSharePath(result.path);
                  }}
                >
                  رابط المشاركة
                </CareAction>
                {sharePath === `/social/posts/${p.id}` && (
                  <Link className="text-link" href={sharePath}>
                    فتح المنشور المشترك
                  </Link>
                )}
                {p.kind === 'story' &&
                  (p.user_id === me.user.id ? (
                    <CareAction
                      action={async () =>
                        setViewers({
                          ...viewers,
                          [p.id]: await api<{ display_name: string }[]>(
                            `social/posts/${p.id}/viewers`,
                          ),
                        })
                      }
                    >
                      مشاهدو القصة
                    </CareAction>
                  ) : (
                    <CareAction
                      action={async () => {
                        await mutate(`social/posts/${p.id}/view`);
                      }}
                    >
                      تسجيل مشاهدة القصة
                    </CareAction>
                  ))}
                <CareAction
                  action={async () => {
                    await mutate(`social/posts/${p.id}/reactions`, {
                      kind: 'like',
                      enabled: !p.liked,
                    });
                    await feed();
                  }}
                >
                  {p.liked ? 'إلغاء الإعجاب' : 'إعجاب'}
                </CareAction>
                <span>
                  <Heart size={16} />
                  {p.likes}
                </span>
                <CareAction
                  action={async () => {
                    await mutate(`social/posts/${p.id}/reactions`, {
                      kind: 'save',
                      enabled: !p.saved,
                    });
                    await feed();
                  }}
                >
                  {p.saved ? 'إلغاء الحفظ' : 'حفظ المنشور'}
                </CareAction>
                <CareAction
                  action={async () => {
                    const d = await api<{ comments: SocialComment[] }>(
                      `social/posts/${p.id}`,
                    );
                    setSelected(selected === p.id ? '' : p.id);
                    setComments(d.comments);
                  }}
                >
                  التعليقات
                </CareAction>
              </div>
              {viewers[p.id] && (
                <p>
                  المشاهدون:{' '}
                  {viewers[p.id]!.map((v) => v.display_name).join('، ') ||
                    'لا مشاهدات بعد'}
                </p>
              )}
              {selected === p.id && (
                <div className="post-comments">
                  {comments.map((c) => (
                    <p key={c.id}>
                      <strong>{c.display_name}</strong> · {c.body}
                    </p>
                  ))}
                  <CareForm
                    label="إرسال التعليق"
                    submit={async (f) => {
                      await mutate(`social/posts/${p.id}/comments`, {
                        body: f.get('body'),
                      });
                      const d = await api<{ comments: SocialComment[] }>(
                        `social/posts/${p.id}`,
                      );
                      setComments(d.comments);
                    }}
                  >
                    <label>
                      تعليقك
                      <textarea name="body" maxLength={3000} required />
                    </label>
                  </CareForm>
                </div>
              )}
              {p.user_id === me.user.id ? (
                <details>
                  <summary>إدارة منشورك</summary>
                  <CareForm
                    label="حفظ تعديل المنشور"
                    submit={async (f) => {
                      await api(`social/posts/${p.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          body: f.get('body'),
                          version: p.version,
                        }),
                      });
                      await feed();
                    }}
                  >
                    <label>
                      نص المنشور المعدل
                      <textarea
                        name="body"
                        defaultValue={p.body}
                        required
                        maxLength={3000}
                      />
                    </label>
                  </CareForm>
                  <CareAction
                    action={async () => {
                      await api(`social/posts/${p.id}`, { method: 'DELETE' });
                      await feed();
                    }}
                  >
                    حذف المنشور
                  </CareAction>
                </details>
              ) : (
                <details>
                  <summary>الإبلاغ عن المنشور</summary>
                  <CareForm
                    label="إرسال البلاغ"
                    submit={(f) =>
                      mutate(`social/posts/${p.id}/reports`, {
                        reason: f.get('reason'),
                      }).then(() => undefined)
                    }
                  >
                    <label>
                      سبب البلاغ
                      <textarea
                        name="reason"
                        minLength={10}
                        maxLength={3000}
                        required
                      />
                    </label>
                  </CareForm>
                </details>
              )}
            </article>
          ))}
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>ملفي الاجتماعي</h2>
            <CareForm
              label="حفظ الملف الاجتماعي"
              submit={async (f) => {
                setProfile(
                  await api<SocialProfile>('social/profile', {
                    method: 'POST',
                    body: JSON.stringify({
                      displayName: f.get('name'),
                      bio: f.get('bio'),
                      privacy: f.get('privacy'),
                      presenceEnabled: f.get('presence') === 'on',
                    }),
                  }),
                );
                await feed();
              }}
            >
              <label>
                اسم العرض الاجتماعي
                <input
                  name="name"
                  defaultValue={profile?.display_name ?? me.user.name}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                نبذة
                <textarea
                  name="bio"
                  maxLength={500}
                  defaultValue={profile?.bio ?? ''}
                />
              </label>
              <label>
                خصوصية الحساب
                <select
                  name="privacy"
                  defaultValue={profile?.privacy ?? 'private'}
                >
                  <option value="private">خاص · متابعة بموافقتك</option>
                  <option value="public">عام للمستخدمين</option>
                </select>
              </label>
              <label className="care-check">
                <input
                  type="checkbox"
                  name="presence"
                  defaultChecked={profile?.presence_enabled ?? false}
                />
                أشارك حالة اتصالي ومؤشر الكتابة مع من تسمح لهم سياسة المراسلة
              </label>
            </CareForm>
          </section>
          {profile && (
            <section className="panel care-section">
              <h2>شارك حكاية</h2>
              <MediaUpload onUploaded={(a) => setAssets([a, ...assets])} />
              <CareAction action={refresh}>
                تحديث حالة الوسائط والطلبات
              </CareAction>
              <CareForm
                label="نشر المحتوى"
                submit={async (f) => {
                  await mutate('social/posts', {
                    body: f.get('body'),
                    kind: f.get('kind'),
                    visibility: f.get('visibility'),
                    ...(f.get('asset') ? { assetId: f.get('asset') } : {}),
                  });
                  await feed();
                }}
              >
                <label>
                  ماذا حدث مع رفيقك؟
                  <textarea name="body" maxLength={3000} required />
                </label>
                <label>
                  نوع المنشور
                  <select name="kind">
                    <option value="post">منشور</option>
                    <option value="story">قصة 24 ساعة</option>
                    <option value="reel">ريل فيديو</option>
                  </select>
                </label>
                <label>
                  جمهور المنشور
                  <select name="visibility">
                    <option value="public">عام وفق خصوصية الحساب</option>
                    <option value="followers">المتابعون المقبولون</option>
                    <option value="private">أنا فقط</option>
                  </select>
                </label>
                <label>
                  وسيط جاهز
                  <select name="asset">
                    <option value="">دون وسيط</option>
                    {assets
                      .filter((a) => a.status === 'ready')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kind === 'video' ? 'فيديو' : 'صورة'} ·{' '}
                          {a.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
              </CareForm>
            </section>
          )}
          <section className="panel care-section">
            <h2>اكتشف وتواصل</h2>
            {highlightUser && (
              <StoryHighlights key={highlightUser} userId={highlightUser} />
            )}
            <CareForm
              label="بحث الحسابات"
              submit={async (f) =>
                setPeople(
                  await api<SocialPerson[]>(
                    `social/people?q=${encodeURIComponent(String(f.get('q')))}`,
                  ),
                )
              }
            >
              <label>
                اسم الحساب
                <input name="q" maxLength={100} />
              </label>
            </CareForm>
            {people.map((p) => (
              <div className="care-list-row" key={p.user_id}>
                <div>
                  <h3>{p.display_name}</h3>
                  <p>{p.privacy === 'private' ? 'حساب خاص' : 'حساب عام'}</p>
                  <p>
                    {p.follow_status === 'accepted'
                      ? 'متابَع'
                      : p.follow_status === 'pending'
                        ? 'طلب متابعة معلق'
                        : ''}
                  </p>
                </div>
                <div className="care-actions">
                  <CareAction action={async () => setHighlightUser(p.user_id)}>
                    قصص الحساب المميزة
                  </CareAction>
                  <CareAction
                    action={async () => {
                      if (p.follow_status)
                        await api(`social/users/${p.user_id}/follow`, {
                          method: 'DELETE',
                        });
                      else await mutate(`social/users/${p.user_id}/follow`);
                      setPeople(await api<SocialPerson[]>('social/people'));
                      await feed();
                    }}
                  >
                    {p.follow_status === 'accepted'
                      ? 'إلغاء المتابعة'
                      : p.follow_status === 'pending'
                        ? 'إلغاء الطلب'
                        : 'متابعة'}
                  </CareAction>
                  <CareAction action={() => openChat(p)}>مراسلة</CareAction>
                </div>
              </div>
            ))}
            {requests.map((r) => (
              <div className="care-list-row" key={r.follower_id}>
                <h3>طلب من {r.display_name}</h3>
                <CareAction
                  action={async () => {
                    await mutate(`social/users/${r.follower_id}/accept-follow`);
                    await refresh();
                  }}
                >
                  قبول المتابعة
                </CareAction>
                <CareAction
                  action={async () => {
                    await api(`social/followers/${r.follower_id}`, {
                      method: 'DELETE',
                    });
                    await refresh();
                  }}
                >
                  رفض الطلب
                </CareAction>
              </div>
            ))}
            <h3>المتابعون المقبولون</h3>
            {!followers.length && <Empty>لا متابعين مقبولين.</Empty>}
            {followers.map((f) => (
              <div className="care-list-row" key={f.follower_id}>
                <span>{f.display_name}</span>
                <CareAction
                  action={async () => {
                    await api(`social/followers/${f.follower_id}`, {
                      method: 'DELETE',
                    });
                    await refresh();
                  }}
                >
                  إزالة المتابع
                </CareAction>
              </div>
            ))}
          </section>
          {chat && (
            <section className="panel care-section">
              <h2>
                <MessageCircle size={20} />
                رسائل · {chat.display_name}
              </h2>
              <p className="panel-intro">
                رسائل محفوظة باتصال فوري، مع إعادة مزامنة عند عودة الاتصال. لا
                تتضمن محادثة طبية.
              </p>
              <p role="status">
                {realtime.connected
                  ? 'المحادثة متصلة فورياً'
                  : 'إعادة الاتصال؛ تُحدّث الرسائل دورياً'}
                {realtime.online === true ? ' · متصل الآن' : ''}
                {realtime.typing ? ' · يكتب الآن…' : ''}
              </p>
              <CareAction action={() => openChat(chat)}>
                تحديث الرسائل
              </CareAction>
              {messages.map((m) => (
                <div
                  className={`chat-bubble ${m.sender_id === me.user.id ? 'own' : ''}`}
                  key={m.id}
                >
                  <p>{m.body}</p>
                  {m.asset_id &&
                    (m.asset_kind === 'audio' ? (
                      <audio
                        controls
                        preload="none"
                        aria-label="مقطع صوتي خاص"
                        src={`/api/v1/media/${m.asset_id}/file`}
                      />
                    ) : m.asset_kind === 'video' ? (
                      <PrivateVideo
                        assetId={m.asset_id}
                        label="فيديو محادثة خاص"
                      />
                    ) : (
                      <img
                        loading="lazy"
                        src={`/api/v1/media/${m.asset_id}/file`}
                        alt="صورة مرفقة بالمحادثة الخاصة"
                      />
                    ))}
                  <small>{careDate(m.created_at)}</small>
                </div>
              ))}
              <ChatAttachments
                key={chat.user_id}
                peer={chat.user_id}
                selectedId={
                  chatAsset?.peer === chat.user_id
                    ? chatAsset.asset.id
                    : undefined
                }
                onReady={(asset) =>
                  setChatAsset(asset ? { peer: chat.user_id, asset } : null)
                }
              />
              {chatAsset?.peer === chat.user_id && (
                <p role="status">تم اختيار مرفق خاص للرسالة التالية.</p>
              )}
              <CareForm
                label="إرسال الرسالة"
                submit={async (f) => {
                  const body = String(f.get('body')),
                    assetId =
                      chatAsset?.peer === chat.user_id
                        ? chatAsset.asset.id
                        : undefined,
                    signature = JSON.stringify([
                      chat.user_id,
                      body,
                      assetId ?? null,
                    ]),
                    key =
                      messageKeys.current.get(signature) ?? crypto.randomUUID();
                  messageKeys.current.set(signature, key);
                  await mutate(`social/messages/${chat.user_id}`, {
                    body,
                    idempotencyKey: key,
                    ...(assetId ? { assetId } : {}),
                  });
                  realtime.indicateTyping(false);
                  await openChat(chat);
                  messageKeys.current.delete(signature);
                  setChatAsset(null);
                }}
              >
                <label>
                  نص الرسالة
                  <textarea
                    name="body"
                    required
                    maxLength={3000}
                    onChange={(e) =>
                      realtime.indicateTyping(!!e.target.value.trim())
                    }
                    onBlur={() => realtime.indicateTyping(false)}
                  />
                </label>
              </CareForm>
              <CareAction action={() => block(chat.user_id)}>
                حظر المحادثة
              </CareAction>
            </section>
          )}
          <section className="panel care-section">
            <h2>
              <Bookmark size={20} />
              قائمة الحظر
            </h2>
            {!blocks.length && <Empty>لا حسابات محظورة.</Empty>}
            {blocks.map((b) => (
              <div className="care-list-row" key={b.blocked_id}>
                <span>{b.display_name ?? 'حساب محظور'}</span>
                <CareAction
                  action={async () => {
                    await api(`social/users/${b.blocked_id}/block`, {
                      method: 'DELETE',
                    });
                    await refresh();
                    setPeople(await api<SocialPerson[]>('social/people'));
                  }}
                >
                  إلغاء حظر الحساب
                </CareAction>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
