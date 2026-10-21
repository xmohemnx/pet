'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  CareArticle,
  ContentCorrection,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, careDate, speciesLabels } from './care-shared';
import { PlatformHeading, Empty, mutate } from './platform-shared';
import { api } from '../lib/auth-client';
export const ageLabels: Record<string, string> = {
  all: 'كل الأعمار',
  young: 'صغار الحيوانات',
  adult: 'البالغة',
  senior: 'المتقدمة بالعمر',
};
export function CareLibraryReader({
  me,
  initial,
  article,
  initialCorrections,
}: {
  me: IdentityMe;
  initial: CareArticle[];
  article?: CareArticle;
  initialCorrections: ContentCorrection[];
}) {
  const [articles, setArticles] = useState(initial),
    [reports, setReports] = useState(initialCorrections);
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="رعاية ومعرفة"
        title={article?.title ?? 'مكتبة الرعاية'}
      >
        محتوى تعليمي بمراجعة بيطرية. لا يحل محل الفحص أو التشخيص؛ في الطوارئ
        تواصل مع عيادتك مباشرة.
      </PlatformHeading>
      {article ? (
        <article className="panel care-section">
          <Link href="/care/library">كل مقالات المكتبة</Link>
          <p>
            {article.clinic_name} ·{' '}
            {speciesLabels[article.species] ?? 'كل الأنواع'} ·{' '}
            {ageLabels[article.age_group]}
          </p>
          <p>
            راجعها الطبيب {article.reviewer_name} بتاريخ{' '}
            {article.reviewed_at && careDate(article.reviewed_at)} · النسخة{' '}
            {article.revision}
          </p>
          <div className="social-body" style={{ whiteSpace: 'pre-wrap' }}>
            {article.body}
          </div>
          <h2>المراجع</h2>
          <ul>
            {article.sources.map((s, n) => (
              <li key={s}>
                <a href={s} rel="noopener noreferrer" target="_blank">
                  مرجع {n + 1} ({new URL(s).hostname})
                </a>
              </li>
            ))}
          </ul>
          <details>
            <summary>طلب تصحيح محتوى المقال</summary>
            <CareForm
              label="إرسال طلب التصحيح"
              submit={async (f) => {
                await mutate(`care/library/${article.id}/corrections`, {
                  reason: f.get('reason'),
                });
                setReports(
                  await api<ContentCorrection[]>('me/content-corrections'),
                );
              }}
            >
              <label>
                سبب طلب التصحيح
                <textarea
                  name="reason"
                  minLength={10}
                  maxLength={2000}
                  required
                />
              </label>
              <p>
                تصل الملاحظة إلى فريق محتوى العيادة. تجنب إرسال معلومات طبية أو
                بيانات اتصال خاصة.
              </p>
            </CareForm>
          </details>
        </article>
      ) : (
        <>
          <CareForm
            label="بحث في المكتبة"
            submit={async (f) => {
              const q = new URLSearchParams({
                q: String(f.get('q')),
                species: String(f.get('species')),
                ageGroup: String(f.get('age')),
              });
              setArticles(await api<CareArticle[]>(`care/library?${q}`));
            }}
          >
            <label>
              نص البحث بالمقالات
              <input name="q" maxLength={100} />
            </label>
            <label>
              نوع الحيوان بالمكتبة
              <select name="species">
                <option value="">كل الأنواع</option>
                {Object.entries(speciesLabels).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              العمر بالمكتبة
              <select name="age">
                <option value="">كل الأعمار</option>
                {Object.entries(ageLabels)
                  .filter(([id]) => id !== 'all')
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
          </CareForm>
          <section className="care-section">
            <h2>مقالات راجعها أطباء</h2>
            {!articles.length && (
              <Empty>لا توجد مقالات مراجعة منشورة تطابق البحث.</Empty>
            )}
            {articles.map((a) => (
              <article className="panel care-section" key={a.id}>
                <h3>
                  <Link href={`/care/library/${a.id}`}>{a.title}</Link>
                </h3>
                <p>{a.body.slice(0, 180)}…</p>
                <p>
                  {a.clinic_name} · الطبيب {a.reviewer_name} ·{' '}
                  {a.reviewed_at && careDate(a.reviewed_at)}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
      <section className="care-section">
        <h2>طلبات التصحيح الخاصة بي</h2>
        {!reports.length && <Empty>لم ترسل طلبات تصحيح.</Empty>}
        {reports.map((r) => (
          <article className="panel care-section" key={r.id}>
            <h3>
              {r.title} · النسخة {r.revision}
            </h3>
            <p>{r.reason}</p>
            <p>{r.status === 'pending' ? 'بانتظار المراجعة' : 'أجاب الفريق'}</p>
            {r.response && <p>رد الفريق: {r.response}</p>}
          </article>
        ))}
      </section>
    </IdentityShell>
  );
}
