'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  ClinicInfo,
  CareArticle,
  CareLibraryManagement,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate, speciesLabels } from './care-shared';
import { PlatformHeading, Empty, mutate } from './platform-shared';
import { api } from '../lib/auth-client';
import { ageLabels } from './care-library';
function ArticleFields({ value }: { value?: CareArticle }) {
  return (
    <>
      <label>
        عنوان المقال
        <input
          name="title"
          defaultValue={value?.title}
          minLength={5}
          maxLength={200}
          required
        />
      </label>
      <label>
        نص المقال التعليمي
        <textarea
          name="body"
          defaultValue={value?.body}
          minLength={50}
          maxLength={20000}
          rows={8}
          required
        />
      </label>
      <label>
        نوع الحيوان للمقال
        <select name="species" defaultValue={value?.species ?? 'all'}>
          <option value="all">كل الأنواع</option>
          {Object.entries(speciesLabels).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        الفئة العمرية للمقال
        <select name="age" defaultValue={value?.age_group ?? 'all'}>
          {Object.entries(ageLabels).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        مراجع HTTPS (مرجع في كل سطر، حتى خمسة)
        <textarea
          name="sources"
          defaultValue={value?.sources.join('\n')}
          required
        />
      </label>
    </>
  );
}
const fields = (f: FormData) => ({
  title: f.get('title'),
  body: f.get('body'),
  species: f.get('species'),
  ageGroup: f.get('age'),
  sources: String(f.get('sources'))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
});
export function ClinicCareLibrary({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: CareLibraryManagement;
}) {
  const [data, setData] = useState(initial),
    base = `clinics/${clinic.id}`,
    admin = clinic.capabilities.includes('clinic_admin'),
    doctor = clinic.capabilities.includes('doctor_member');
  async function refresh() {
    setData(await api<CareLibraryManagement>(`${base}/library`));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow={clinic.name}
        title="تحرير مكتبة الرعاية ومراجعتها"
      >
        كل نسخة تحتاج طبيباً مراجعاً مختلفاً عن محررها. التعديل يخفي النسخة
        المنشورة حتى مراجعتها مجدداً، وتُحجب المراجعة بعد سنة.
      </PlatformHeading>
      <Link className="button outline" href={`/clinic/${clinic.id}`}>
        لوحة العيادة
      </Link>
      {admin && (
        <section className="panel care-section">
          <h2>مسودة تعليمية جديدة</h2>
          <CareForm
            label="حفظ مسودة المقال"
            submit={async (f) => {
              await mutate(`${base}/library`, fields(f));
              await refresh();
            }}
          >
            <ArticleFields />
          </CareForm>
        </section>
      )}
      <section className="care-section">
        <h2>مقالات العيادة</h2>
        {!data.articles.length && <Empty>لا توجد مسودات بعد.</Empty>}
        {data.articles.map((a) => (
          <article className="panel care-section" key={a.id}>
            <h3>{a.title}</h3>
            <p>
              النسخة {a.revision} ·{' '}
              {
                {
                  draft: 'تنتظر مراجعة',
                  approved: 'مراجعة مقبولة',
                  rejected: 'تحتاج تصحيحاً',
                }[a.state]
              }{' '}
              · {a.published ? 'منشور' : 'غير منشور'}
            </p>
            <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>
            <p>المراجع: {a.sources.join('، ')}</p>
            {a.reviewed_at && (
              <p>
                مراجعة الطبيب {a.reviewer_name} · {careDate(a.reviewed_at)} ·{' '}
                {a.review_note}
              </p>
            )}
            {doctor && a.state === 'draft' && a.author_id !== me.user.id && (
              <CareForm
                label="حفظ المراجعة البيطرية"
                submit={async (f) => {
                  await mutate(`${base}/library/${a.id}/review`, {
                    approved: f.get('decision') === 'approved',
                    note: f.get('note'),
                    version: a.version,
                  });
                  await refresh();
                }}
              >
                <label>
                  قرار المراجعة
                  <select name="decision">
                    <option value="approved">قبول محتوى النسخة</option>
                    <option value="rejected">إعادتها للتصحيح</option>
                  </select>
                </label>
                <label>
                  ملاحظة المراجعة البيطرية
                  <textarea
                    name="note"
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </label>
              </CareForm>
            )}
            {admin && (
              <>
                <details>
                  <summary>إنشاء نسخة معدلة</summary>
                  <CareForm
                    key={a.version}
                    label="حفظ نسخة معدلة"
                    submit={async (f) => {
                      await api(`${base}/library/${a.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          ...fields(f),
                          version: a.version,
                        }),
                      });
                      await refresh();
                    }}
                  >
                    <ArticleFields value={a} />
                  </CareForm>
                </details>
                {a.state === 'approved' && (
                  <CareAction
                    action={async () => {
                      await mutate(`${base}/library/${a.id}/publication`, {
                        published: !a.published,
                        version: a.version,
                      });
                      await refresh();
                    }}
                  >
                    {a.published ? 'إخفاء المقال' : 'نشر المقال المراجع'}
                  </CareAction>
                )}
              </>
            )}
          </article>
        ))}
      </section>
      <section className="care-section">
        <h2>تصحيحات القراء</h2>
        {!data.corrections.length && <Empty>لا توجد طلبات تصحيح.</Empty>}
        {data.corrections.map((r) => (
          <article className="panel care-section" key={r.id}>
            <h3>
              {r.title} · النسخة {r.revision}
            </h3>
            <p>{r.reason}</p>
            {r.response ? (
              <p>{r.response}</p>
            ) : (
              admin && (
                <CareForm
                  label="حفظ الرد على التصحيح"
                  submit={async (f) => {
                    await mutate(
                      `${base}/content-corrections/${r.id}/resolve`,
                      { response: f.get('response') },
                    );
                    await refresh();
                  }}
                >
                  <label>
                    رد فريق المحتوى
                    <textarea
                      name="response"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <p>
                    الرد لا يغير نص المقال أو اعتماده. صحح المقال في نسخة جديدة
                    عند الحاجة.
                  </p>
                </CareForm>
              )
            )}
          </article>
        ))}
      </section>
    </IdentityShell>
  );
}
