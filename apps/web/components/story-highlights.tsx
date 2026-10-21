'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/auth-client';
import { CareAction, CareForm } from './care-shared';
type Highlight = {
  id: string;
  title: string;
  body: string;
  asset_id: string | null;
  asset_kind: string | null;
};
export function StoryHighlights({
  userId,
  own = false,
}: {
  userId: string;
  own?: boolean;
}) {
  const [highlights, setHighlights] = useState<Highlight[]>([]),
    [archive, setArchive] = useState<{ id: string; body: string }[]>([]),
    [loaded, setLoaded] = useState(false);
  async function refresh() {
    setHighlights(await api<Highlight[]>(`social/highlights/${userId}`));
    if (own) setArchive(await api<typeof archive>('social/stories/archive'));
    setLoaded(true);
  }
  return (
    <section className="panel care-section">
      <h2>{own ? 'أرشيفي والقصص المميزة' : 'القصص المميزة للحساب'}</h2>
      <CareAction action={refresh}>عرض القصص المميزة</CareAction>
      {loaded && (
        <>
          {highlights.map((h) => (
            <article key={h.id}>
              <h3>
                <Link href={`/social/posts/${h.id}`}>{h.title}</Link>
              </h3>
              <p>{h.body}</p>
              {own && (
                <CareAction
                  action={async () => {
                    await api(`social/posts/${h.id}/highlight`, {
                      method: 'DELETE',
                    });
                    await refresh();
                  }}
                >
                  إزالة من المميزة
                </CareAction>
              )}
            </article>
          ))}
          {!highlights.length && <p>لا قصص مميزة متاحة لك.</p>}
          {own && (
            <CareForm
              label="إضافة قصة للمميزة"
              submit={async (f) => {
                await api(`social/posts/${f.get('story')}/highlight`, {
                  method: 'POST',
                  body: JSON.stringify({
                    title: f.get('title'),
                    consent: f.get('consent') === 'on',
                  }),
                });
                await refresh();
              }}
            >
              <label>
                القصة من أرشيفي
                <select name="story" required>
                  {archive.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.body.slice(0, 80)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                عنوان القصة المميزة
                <input name="title" maxLength={80} required />
              </label>
              <label className="care-check">
                <input type="checkbox" name="consent" required />
                أوافق على إبقاء هذه القصة للعرض حتى سنة وفق خصوصيتها الحالية
              </label>
            </CareForm>
          )}
        </>
      )}
    </section>
  );
}
