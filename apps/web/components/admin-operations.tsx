'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CampaignManagement } from './campaign-management';
import type { IdentityMe, RescueCase, AdoptionListing } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  Status,
  mutate,
} from './platform-shared';
type Jobs = {
  pending: number;
  failed: {
    event_id: string;
    event_type: string;
    attempts: number;
    last_error: string;
  }[];
  media: { id: string; kind: string; status: string; failure: string | null }[];
};
type Moderation = { id: string; body: string; reason: string }[];
type Content = {
  slug: string;
  title: string;
  body: string;
  published: boolean;
  version: number;
}[];
type Queue = { listings: AdoptionListing[]; cases: RescueCase[] };
export function AdminOperations({
  me,
  initialJobs,
  initialModeration,
  initialQueue,
  initialContent,
}: {
  me: IdentityMe;
  initialJobs: Jobs;
  initialModeration: Moderation;
  initialQueue: Queue;
  initialContent: Content;
}) {
  const [jobs, setJobs] = useState(initialJobs),
    [reports, setReports] = useState(initialModeration),
    [queue, setQueue] = useState(initialQueue),
    [content, setContent] = useState(initialContent);
  const [campaignRevision, setCampaignRevision] = useState(0);
  async function refresh() {
    const [j, m, q, c] = await Promise.all([
      api<Jobs>('admin/jobs'),
      api<Moderation>('admin/moderation'),
      api<Queue>('admin/rescue'),
      api<Content>('admin/content'),
    ]);
    setJobs(j);
    setReports(m);
    setQueue(q);
    setContent(c);
    setCampaignRevision((x) => x + 1);
  }
  async function send(path: string, body: unknown = {}) {
    await mutate(path, body);
    await refresh();
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="إدارة المنصة · جلسة MFA"
        title="التشغيل والرقابة والمحتوى"
      />
      <div className="inline-actions">
        <Link className="button outline" href="/admin">
          مراجعة الاعتماد
        </Link>
        <Link className="button outline" href="/admin/finance">
          مالية المنصة
        </Link>
      </div>
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>بلاغات المحتوى</h2>
            {!reports.length && <Empty>لا بلاغات معلقة.</Empty>}
            {reports.map((r) => (
              <article key={r.id} className="medical-item">
                <p>{r.body}</p>
                <strong>السبب: {r.reason}</strong>
                <CareForm
                  label="حفظ قرار الرقابة"
                  submit={(f) =>
                    send(`admin/moderation/${r.id}`, {
                      decision: f.get('decision'),
                      reason: f.get('reason'),
                    })
                  }
                >
                  <label>
                    قرار الرقابة
                    <select name="decision">
                      <option value="removed">إزالة المحتوى</option>
                      <option value="dismissed">حفظ البلاغ دون إزالة</option>
                    </select>
                  </label>
                  <label>
                    سبب قرار الرقابة
                    <textarea name="reason" minLength={10} required />
                  </label>
                </CareForm>
              </article>
            ))}
          </section>
          <section className="panel care-section">
            <h2>مراجعة التبني والإنقاذ</h2>
            {[
              ...queue.listings.map((l) => ({ ...l, kind: 'listing' })),
              ...queue.cases.map((c) => ({ ...c, kind: 'case' })),
            ].map((item) => (
              <div className="care-list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <p>{item.city}</p>
                </div>
                <CareForm
                  label="حفظ قرار النشر"
                  submit={(f) =>
                    send(`admin/rescue/${item.kind}/${item.id}`, {
                      approved: f.get('decision') === 'yes',
                    })
                  }
                >
                  <label>
                    قرار المراجعة
                    <select name="decision">
                      <option value="yes">قبول للنشر</option>
                      <option value="no">رفض</option>
                    </select>
                  </label>
                </CareForm>
              </div>
            ))}
          </section>
          <section className="panel care-section">
            <h2>مهام الخلفية</h2>
            <p>أحداث بانتظار المعالجة: {jobs.pending}</p>
            {jobs.failed.map((j) => (
              <div className="care-list-row" key={j.event_id}>
                <div>
                  <h3>{j.event_type}</h3>
                  <p>
                    {j.last_error} · {j.attempts} محاولات
                  </p>
                </div>
                <CareAction
                  action={() => send(`admin/jobs/${j.event_id}/retry`)}
                >
                  إعادة المحاولة
                </CareAction>
              </div>
            ))}
            {jobs.media.map((m) => (
              <p key={m.id}>
                {m.kind} · <Status value={m.status} />
                {m.failure}
              </p>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>صفحة محتوى</h2>
            <CareForm
              label="حفظ الصفحة"
              submit={(f) => {
                const slug = String(f.get('slug'));
                return send(`admin/content/${slug}`, {
                  title: f.get('title'),
                  body: f.get('body'),
                  published: f.get('published') === 'on',
                  version: content.find((c) => c.slug === slug)?.version ?? 0,
                });
              }}
            >
              <label>
                المسار (حروف لاتينية وشرطات)
                <input name="slug" pattern="[a-z0-9-]{1,60}" required />
              </label>
              <label>
                عنوان الصفحة
                <input name="title" minLength={2} maxLength={100} required />
              </label>
              <label>
                نص الصفحة
                <textarea
                  name="body"
                  minLength={10}
                  maxLength={20000}
                  required
                />
              </label>
              <label className="care-check">
                <input type="checkbox" name="published" />
                نشر الصفحة للعامة
              </label>
            </CareForm>
            {content.map((c) => (
              <details key={c.slug}>
                <summary>
                  {c.title} · {c.published ? 'منشورة' : 'مسودة'}
                </summary>
                <p>{c.body}</p>
                <Link className="text-link" href={`/content/${c.slug}`}>
                  فتح الصفحة
                </Link>
              </details>
            ))}
          </section>
          <section className="panel care-section">
            <h2>حملة اختبارية</h2>
            <SandboxNotice />
            <CareForm
              label="إنشاء حملة اختبارية"
              submit={(f) =>
                send('admin/sandbox/campaigns', {
                  name: f.get('name'),
                  purpose: f.get('purpose'),
                  beneficiary: f.get('beneficiary'),
                  goalMinor: f.get('goal'),
                })
              }
            >
              <label>
                اسم الحملة
                <input name="name" minLength={2} maxLength={100} required />
              </label>
              <label>
                غرض الحملة
                <textarea name="purpose" minLength={5} required />
              </label>
              <label>
                المستفيد المراجع
                <textarea name="beneficiary" minLength={5} required />
              </label>
              <label>
                الهدف بوحدات IQD الصغرى
                <input name="goal" pattern="[1-9][0-9]{0,11}" required />
              </label>
            </CareForm>
          </section>
        </aside>
      </div>
      <CampaignManagement refreshKey={campaignRevision} />
      <CareAction action={refresh}>تحديث لوحة التشغيل</CareAction>
    </IdentityShell>
  );
}
