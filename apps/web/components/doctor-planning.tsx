'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  DoctorClinic,
  DoctorPlanningData,
  DoctorPublicProfile,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, localToUtc, careDate } from './care-shared';
import { api } from '../lib/auth-client';
import { mutate, PlatformHeading, Empty } from './platform-shared';
export const weekdays = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];
const minute = (value: FormDataEntryValue | null) => {
  const [h, m] = String(value).split(':').map(Number);
  return h! * 60 + m!;
};
const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export function DoctorPlanning({
  me,
  clinics,
  initial,
  profile,
}: {
  me: IdentityMe;
  clinics: DoctorClinic[];
  initial: DoctorPlanningData | null;
  profile: DoctorPublicProfile | null;
}) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? ''),
    [plan, setPlan] = useState(initial),
    [branch, setBranch] = useState(clinics[0]?.branches[0]?.id ?? ''),
    [result, setResult] = useState('');
  const clinic = clinics.find((c) => c.id === clinicId);
  async function refresh() {
    setPlan(
      await api<DoctorPlanningData>(`doctor/clinics/${clinicId}/planning`),
    );
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="مساحة الطبيب" title="الدوام والتوفر">
        الأوقات بتوقيت بغداد. نشر الدوام لا يلغي حجوزات مؤكدة، والإجازة تتطلب
        معالجة حجوزاتها أولًا.
      </PlatformHeading>
      <Link className="text-link" href="/doctor">
        ← زيارات الطبيب
      </Link>
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>ملفي في دليل الأطباء</h2>
            <CareForm
              label="حفظ الملف المهني"
              submit={async (f) => {
                await mutate('doctor/public-profile', {
                  specialty: f.get('specialty'),
                  bio: f.get('bio'),
                  languages: String(f.get('languages'))
                    .split(/[,،]/)
                    .map((x) => x.trim())
                    .filter(Boolean),
                });
              }}
            >
              <label>
                التخصص المعلن
                <input
                  name="specialty"
                  defaultValue={profile?.specialty ?? ''}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                نبذة مهنية
                <textarea
                  name="bio"
                  defaultValue={profile?.bio ?? ''}
                  maxLength={1500}
                />
              </label>
              <label>
                اللغات، افصل بفاصلة
                <input
                  name="languages"
                  defaultValue={profile?.languages.join('، ') ?? 'العربية'}
                  maxLength={300}
                  required
                />
              </label>
            </CareForm>
          </section>
          {clinic && plan ? (
            <section className="panel care-section">
              <h2>إضافة دوام أسبوعي</h2>
              <label>
                عيادة الدوام
                <select
                  value={clinicId}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setClinicId(id);
                    setBranch(
                      clinics.find((c) => c.id === id)?.branches[0]?.id ?? '',
                    );
                    setPlan(
                      await api<DoctorPlanningData>(
                        `doctor/clinics/${id}/planning`,
                      ),
                    );
                  }}
                >
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <CareForm
                key={clinicId}
                label="حفظ الدوام الأسبوعي"
                submit={async (f) => {
                  await mutate(`doctor/clinics/${clinicId}/working-hours`, {
                    branchId: branch,
                    serviceId: f.get('service'),
                    weekday: Number(f.get('weekday')),
                    startMinute: minute(f.get('start')),
                    endMinute: minute(f.get('end')),
                    ...(f.get('resource')
                      ? { resourceId: f.get('resource') }
                      : {}),
                  });
                  await refresh();
                }}
              >
                <label>
                  فرع الدوام
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    required
                  >
                    {clinic.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  خدمة الدوام
                  <select name="service" required>
                    <option value="">اختر الخدمة</option>
                    {clinic.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  غرفة الدوام
                  <select name="resource">
                    <option value="">دون غرفة</option>
                    {plan.resources
                      .filter((r) => r.branch_id === branch)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  يوم الأسبوع
                  <select name="weekday">
                    {weekdays.map((w, i) => (
                      <option key={w} value={i}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="care-fields">
                  <label>
                    الدوام من
                    <input
                      name="start"
                      type="time"
                      defaultValue="09:00"
                      required
                    />
                  </label>
                  <label>
                    الدوام إلى
                    <input
                      name="end"
                      type="time"
                      defaultValue="13:00"
                      required
                    />
                  </label>
                </div>
              </CareForm>
            </section>
          ) : (
            <Empty>يلزم انتساب طبي معتمد وعيادة ذات خدمات وفروع.</Empty>
          )}
          {plan?.rules.map((r) => (
            <section key={r.id} className="panel care-section">
              <h2>
                {weekdays[r.weekday]} · {time(r.start_minute)}–
                {time(r.end_minute)}
              </h2>
              <p>
                {clinic?.services.find((s) => s.id === r.service_id)?.name} ·{' '}
                {clinic?.branches.find((b) => b.id === r.branch_id)?.name}
              </p>
              <CareForm
                label="توليد الأوقات"
                submit={async (f) => {
                  const result = await mutate<{
                    created: number;
                    skipped: number;
                  }>(
                    `doctor/clinics/${clinicId}/working-hours/${r.id}/generate`,
                    { from: f.get('from'), through: f.get('through') },
                  );
                  setResult(
                    `أضيف ${result.created} وقتًا، وتجاوز ${result.skipped} وقتًا ماضيًا أو داخل إجازة.`,
                  );
                }}
              >
                <label>
                  نشر من تاريخ
                  <input type="date" name="from" required />
                </label>
                <label>
                  نشر حتى تاريخ
                  <input type="date" name="through" required />
                </label>
              </CareForm>
              <CareAction
                action={async () => {
                  await api(
                    `doctor/clinics/${clinicId}/working-hours/${r.id}`,
                    { method: 'DELETE' },
                  );
                  await refresh();
                }}
              >
                إيقاف الدوام وإلغاء أوقاته غير المحجوزة
              </CareAction>
            </section>
          ))}
          {result && <p role="status">{result}</p>}
        </div>
        <aside className="care-stack">
          {clinic && (
            <section className="panel care-section">
              <h2>إجازة الطبيب</h2>
              <CareForm
                label="حفظ الإجازة"
                submit={async (f) => {
                  await mutate(`doctor/clinics/${clinicId}/time-off`, {
                    startsAt: localToUtc(f.get('from')),
                    endsAt: localToUtc(f.get('to')),
                    reason: f.get('reason'),
                  });
                  await refresh();
                }}
              >
                <label>
                  بداية الإجازة
                  <input type="datetime-local" name="from" required />
                </label>
                <label>
                  نهاية الإجازة
                  <input type="datetime-local" name="to" required />
                </label>
                <label>
                  ملاحظة تشغيلية دون بيانات صحية
                  <input name="reason" minLength={2} maxLength={300} required />
                </label>
              </CareForm>
              {plan?.timeOff.map((o) => (
                <div className="care-section" key={o.id}>
                  <p>
                    {o.doctor_id ? 'إجازتك' : 'إغلاق العيادة'} ·{' '}
                    {careDate(o.starts_at)} – {careDate(o.ends_at)}
                  </p>
                  {o.doctor_id === me.user.id && (
                    <CareAction
                      action={async () => {
                        await api(`clinics/${clinicId}/time-off/${o.id}`, {
                          method: 'DELETE',
                        });
                        await refresh();
                      }}
                    >
                      إلغاء الإجازة
                    </CareAction>
                  )}
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </IdentityShell>
  );
}
