'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  BadgeCheck,
  HeartHandshake,
  Stethoscope,
  ClipboardCheck,
  ArrowUpLeft,
  CheckCircle2,
  Clock3,
  TriangleAlert,
  Scissors,
} from 'lucide-react';
import type {
  IdentityMe,
  ProfessionalPortfolio,
  ProfessionalCaseReport,
  CareAppointment,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { WorkspaceHeading } from './workspace-overview';
import { CareForm, careDate } from './care-shared';
import { api } from '../lib/auth-client';
export const outcomeNames: Record<string, string> = {
  pending: 'نتيجة قيد المتابعة',
  successful: 'ناجحة وفق السجل المراجع',
  unsuccessful: 'غير ناجحة وفق السجل المراجع',
};
export const reviewNames: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'غير معتمد',
  revoked: 'مسحوب',
};
export function PortfolioView({
  me,
  profile,
}: {
  me: IdentityMe;
  profile: ProfessionalPortfolio;
}) {
  const stats = [
    ['إجراءات موثقة', profile.statistics.total, ClipboardCheck],
    ['عمليات جراحية', profile.statistics.surgeries, Scissors],
    ['نتائج ناجحة', profile.statistics.successful, CheckCircle2],
    ['نتائج غير ناجحة', profile.statistics.unsuccessful, TriangleAlert],
    ['قيد المتابعة', profile.statistics.pending, Clock3],
    ['أعمال خيرية موثقة', profile.statistics.charitable, HeartHandshake],
  ] as const;
  return (
    <IdentityShell me={me}>
      <div className="role-desk portfolio-desk">
        <section className="professional-profile-heading">
          <span className="professional-monogram" aria-hidden="true">
            {Array.from(profile.name)[0]}
          </span>
          <div>
            <h1>{profile.name}</h1>
            <p className="professional-badge">
              <BadgeCheck size={21} aria-hidden="true" />
              {profile.kind === 'doctor'
                ? 'طبيب معتمد مهنياً'
                : 'عيادة معتمدة مهنياً'}
            </p>
            {profile.identityVerified && (
              <p className="professional-badge">
                <BadgeCheck size={18} aria-hidden="true" />
                {profile.kind === 'clinic'
                  ? 'هوية مسؤول العيادة موثقة'
                  : 'هوية الحساب موثقة'}
              </p>
            )}
            {profile.specialty && <p>{profile.specialty}</p>}
          </div>
          <Link
            className="button primary"
            href={
              profile.kind === 'doctor'
                ? '/care/directory'
                : `/marketplace/stores/${profile.id}`
            }
          >
            <Stethoscope size={19} aria-hidden="true" />
            {profile.kind === 'doctor' ? 'المواعيد والخدمات' : 'متجر العيادة'}
          </Link>
        </section>
        <div className="portfolio-layout">
          <section className="desk-panel">
            <h2>الخبرة والعمل الموثق</h2>
            <p className="portfolio-bio">
              {profile.bio || 'لم تُنشر نبذة مهنية بعد.'}
            </p>
            {profile.languages.length > 0 && (
              <p>اللغات: {profile.languages.join('، ')}</p>
            )}
            <p>
              {profile.completedVisits} زيارة مكتملة في سجلات Petra؛ اكتمال
              الزيارة لا يعني نجاح النتيجة العلاجية.
            </p>
            <dl className="portfolio-statistics">
              {stats.map(([label, value, Icon]) => (
                <div key={label}>
                  <dt>
                    <Icon size={20} aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{new Intl.NumberFormat('ar-IQ').format(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <aside className="desk-note">
            <BadgeCheck size={25} aria-hidden="true" />
            <h2>كيف تُوثّق النتائج؟</h2>
            <p>
              ترتبط النتائج بزيارة مكتملة وموقعة، ثم تراجعها الإدارة بشكل مستقل.
              لا تدخل الادعاءات المعلقة هذه الأعداد. شارة الاعتماد المهني منفصلة
              عن توثيق هوية الحساب.
            </p>
            <p>
              هذه إحصاءات السجلات المراجعة في Petra، وليست ضماناً لنتيجة العلاج
              أو مقياساً لكل الحالات التي عالجها المهني.
            </p>
          </aside>
        </div>
        <section className="desk-panel portfolio-work">
          <h2>الأعمال والإجراءات المعتمدة</h2>
          {!profile.highlights.length ? (
            <p className="desk-empty">
              لا أعمال منشورة معتمدة بعد. لا تُملأ هذه المساحة بحالات أو نتائج
              افتراضية.
            </p>
          ) : (
            profile.highlights.map((h) => (
              <article className="portfolio-work-row" key={h.id}>
                <div>
                  <h3>{h.public_title}</h3>
                  <p>
                    {h.procedure_kind === 'surgery'
                      ? 'عملية جراحية'
                      : 'إجراء علاجي'}{' '}
                    · {outcomeNames[h.outcome]}
                  </p>
                  <time dateTime={h.reviewed_at}>
                    المراجعة: {careDate(h.reviewed_at)}
                  </time>
                </div>
                {h.charitable && (
                  <span className="professional-badge">
                    <HeartHandshake size={19} aria-hidden="true" />
                    عمل خيري موثق
                  </span>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </IdentityShell>
  );
}
export function PortfolioEditor({
  me,
  initial,
  appointments,
}: {
  me: IdentityMe;
  initial: ProfessionalCaseReport[];
  appointments: CareAppointment[];
}) {
  const [reports, setReports] = useState(initial);
  const eligible = appointments.filter(
    (a) =>
      a.status === 'completed' &&
      a.encounter_id &&
      !reports.some((r) => r.appointment_id === a.id),
  );
  return (
    <IdentityShell me={me}>
      <div className="role-desk">
        <WorkspaceHeading
          title="ملفي المهني ونتائج أعمالي"
          description="أرسل ادعاء نتيجة موثقاً من زيارة مكتملة وموقعة؛ يظهر في الملف بعد اعتماد الإدارة."
          action={
            <Link
              className="button primary"
              href={`/professional-profiles/doctor/${me.user.id}`}
            >
              عرض ملفي <ArrowUpLeft size={18} aria-hidden="true" />
            </Link>
          }
        />
        <div className="desk-body">
          <section className="desk-panel">
            <h2>إضافة إجراء إلى الملف المهني</h2>
            {!eligible.length ? (
              <p className="desk-empty">
                لا زيارات مكتملة وموقعة متاحة لإضافة تقرير جديد. أكمل توثيق
                الزيارة أولاً.
              </p>
            ) : (
              <CareForm
                label="إرسال النتيجة للمراجعة"
                submit={async (f) => {
                  await api('doctor/portfolio-reports', {
                    method: 'POST',
                    body: JSON.stringify({
                      appointmentId: f.get('appointment'),
                      procedureKind: f.get('kind'),
                      publicTitle: f.get('title'),
                      outcome: f.get('outcome'),
                      charitable: f.get('charitable') === 'on',
                      evidenceReference: f.get('evidence'),
                      publicationConsent: f.get('consent') === 'on',
                    }),
                  });
                  setReports(
                    await api<ProfessionalCaseReport[]>(
                      'doctor/portfolio-reports',
                    ),
                  );
                }}
              >
                <label>
                  الزيارة المكتملة
                  <select
                    name="appointment"
                    required
                    aria-label="الزيارة المكتملة"
                  >
                    <option value="">اختر زيارة</option>
                    {eligible.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.pet_name} · {a.clinic_name} · {careDate(a.starts_at)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نوع الإجراء
                  <select name="kind" aria-label="نوع الإجراء">
                    <option value="surgery">عملية جراحية</option>
                    <option value="treatment">إجراء علاجي</option>
                  </select>
                </label>
                <label>
                  عنوان العمل للنشر
                  <input name="title" maxLength={180} minLength={2} required />
                  <small>
                    عنوان عام دون اسم الحيوان أو المالك أو بيانات طبية خاصة.
                  </small>
                </label>
                <label>
                  نتيجة الإجراء
                  <select name="outcome" aria-label="نتيجة الإجراء">
                    <option value="pending">قيد المتابعة</option>
                    <option value="successful">ناجحة وفق السجل</option>
                    <option value="unsuccessful">غير ناجحة وفق السجل</option>
                  </select>
                </label>
                <label className="care-check">
                  <input type="checkbox" name="charitable" />
                  عمل خيري موثق
                </label>
                <label>
                  مرجع الإثبات للمراجع فقط
                  <textarea
                    name="evidence"
                    minLength={10}
                    maxLength={1000}
                    rows={3}
                    required
                  />
                </label>
                <label className="care-check">
                  <input type="checkbox" name="consent" required />
                  أوافق على نشر العنوان والنتيجة المجمّعة بعد المراجعة وأؤكد
                  خلوها من بيانات أصحاب الحيوانات.
                </label>
              </CareForm>
            )}
          </section>
          <aside className="desk-note">
            <h2>نتائج تحت المراجعة</h2>
            <p>
              لا تُحتسب الزيارة تلقائياً كعملية جراحية ناجحة. يبقى التقرير
              المرسل ثابتاً، ويُسحب اعتماده بسبب موثق عند تصحيح ادعاء خاطئ.
            </p>
          </aside>
        </div>
        <section className="desk-panel portfolio-work">
          <h2>سجل تقاريري</h2>
          {!reports.length ? (
            <p>لم تُرسل تقارير بعد.</p>
          ) : (
            reports.map((r) => (
              <article className="portfolio-work-row" key={r.id}>
                <div>
                  <h3>{r.public_title}</h3>
                  <p>
                    {outcomeNames[r.outcome]} · {reviewNames[r.status]}
                  </p>
                  {r.review_reason && <p>{r.review_reason}</p>}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </IdentityShell>
  );
}
