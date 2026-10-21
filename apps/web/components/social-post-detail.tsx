'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { IdentityMe, SocialPost, SocialComment } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
import { PlatformHeading } from './platform-shared';
import { CareForm } from './care-shared';
export function SocialPostDetail({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: { post: SocialPost; comments: SocialComment[] };
}) {
  const [data, setData] = useState(initial),
    p = data.post;
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="منشور مشترك" title={p.display_name}>
        {p.body}
      </PlatformHeading>
      <Link className="button outline" href="/social">
        المجتمع
      </Link>
      <article className="panel care-section">
        {p.asset_id &&
          (p.asset_kind === 'video' ? (
            <video
              controls
              playsInline
              preload="metadata"
              src={`/api/v1/media/${p.asset_id}/file`}
              aria-label="فيديو المنشور المشترك"
            />
          ) : (
            <img
              className="store-cover"
              src={`/api/v1/media/${p.asset_id}/file`}
              alt="صورة المنشور المشترك"
            />
          ))}
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
      </article>
    </IdentityShell>
  );
}
