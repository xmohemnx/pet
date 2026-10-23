'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  IdentityMe,
  SocialPost,
  SocialComment,
  SocialProfile,
} from '@petra/contracts';
import { api } from '../lib/auth-client';
import { SocialShell } from './social/social-shell';
import { SocialPostCard } from './social/social-post';
import { CareForm, CareAction } from './care-shared';
export function SocialPostDetail({
  me,
  initial,
  profile,
}: {
  me: IdentityMe;
  initial: { post: SocialPost; comments: SocialComment[] };
  profile: SocialProfile | null;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    p = data.post;
  return (
    <SocialShell me={me} profile={profile} wide>
      <h1 className="social-detail-title">{p.display_name}</h1>
      <Link className="social-back" href="/social">
        المجتمع
      </Link>
      <div className="social-detail-column">
        <SocialPostCard
          key={`${p.id}-${p.version}-${p.comments_count}`}
          initial={p}
        />
        <details className="social-post-options">
          <summary>
            {p.user_id === me.user.id ? 'إدارة المنشور' : 'الإبلاغ عن المنشور'}
          </summary>
          {p.user_id === me.user.id ? (
            <>
              <CareForm
                label="حفظ تعديل المنشور"
                submit={async (f) => {
                  await api(`social/posts/${p.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      body: f.get('editBody'),
                      version: p.version,
                    }),
                  });
                  setData(await api<typeof data>(`social/posts/${p.id}`));
                }}
              >
                <label>
                  تعديل الحكاية
                  <textarea
                    name="editBody"
                    defaultValue={p.body}
                    maxLength={3000}
                    required
                  />
                </label>
              </CareForm>
              <CareAction
                action={async () => {
                  if (
                    !window.confirm(
                      'حذف هذا المنشور؟ ستتوقف مشاركته ووصول الآخرين إلى وسائطه عبره.',
                    )
                  )
                    return;
                  await api(`social/posts/${p.id}`, { method: 'DELETE' });
                  router.push('/social');
                  router.refresh();
                }}
              >
                حذف المنشور
              </CareAction>
            </>
          ) : (
            <CareForm
              label="إرسال البلاغ"
              submit={async (f) => {
                await api(`social/posts/${p.id}/reports`, {
                  method: 'POST',
                  body: JSON.stringify({ reason: f.get('reason') }),
                });
              }}
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
          )}
        </details>
        <section id="comments" className="social-comments">
          <h2>التعليقات</h2>
          {data.comments.map((c) => (
            <p key={c.id}>
              {c.display_name} · {c.body}
            </p>
          ))}
          <CareForm
            label="إرسال التعليق"
            submit={async (f) => {
              await api(`social/posts/${p.id}/comments`, {
                method: 'POST',
                body: JSON.stringify({ body: f.get('body') }),
              });
              setData(await api<typeof data>(`social/posts/${p.id}`));
            }}
          >
            <label>
              تعليقك
              <textarea name="body" required maxLength={3000} />
            </label>
          </CareForm>
        </section>
      </div>
    </SocialShell>
  );
}
