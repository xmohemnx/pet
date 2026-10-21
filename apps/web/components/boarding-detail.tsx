'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { BoardingDetailData, IdentityMe } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import {
  PlatformHeading,
  SandboxNotice,
  Status,
  mutate,
} from './platform-shared';
import { api } from '../lib/auth-client';
const severityLabels = {
  low: 'بسيط',
  attention: 'يحتاج متابعة',
  urgent: 'عاجل',
};
export function BoardingDetail({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: BoardingDetailData;
}) {
  const [data, setData] = useState(initial),
    keys = useRef(new Map<string, string>());
  const { booking: b, access } = data,
    base = `clinics/${b.clinic_id}/boarding/${b.id}`;
  async function send(
    path: string,
    body: Record<string, unknown> = {},
    keyed = false,
  ) {
    const signature = JSON.stringify([path, body]);
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    if (keyed) keys.current.set(signature, key);
    await mutate(path, keyed ? { ...body, idempotencyKey: key } : body);
    setData(await api<BoardingDetailData>(`boarding/${b.id}`));
    if (keyed) keys.current.delete(signature);
  }
  const unresolved = data.incidents.filter(
    (i) =>
      i.kind === 'incident' &&
      !data.incidents.some((r) => r.resolves_id === i.id),
  );
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={b.clinic_name} title="متابعة الإقامة والقبول" />
      <Link
        className="text-link"
        href={access.operator ? `/clinic/${b.clinic_id}/boarding` : '/services'}
      >
        العودة إلى الإقامات
      </Link>
      <SandboxNotice />
      <section className="panel care-section medical-passport">
        <h2>
          {b.pet_name} · {b.unit_name}
        </h2>
        <Status value={b.status} />
        <p>
          <bdi dir="ltr">{b.starts_on}</bdi> إلى{' '}
          <bdi dir="ltr">{b.ends_on}</bdi> · أيام بغداد
        </p>
        <p>
          الليلة {formatIqd(b.night_price)} · إجمالي العقد{' '}
          {formatIqd(b.total_minor)}
        </p>
        <p>
          {b.max_weight_grams
            ? `الوزن الأقصى ${b.max_weight_grams} غرام`
            : 'لا حد وزن محدد'}{' '}
          ·{' '}
          {b.vaccines_required
            ? 'وثائق اللقاح مطلوبة'
            : 'تدقيق اللقاح وفق مراجعة الطبيب'}
        </p>
        <p>{b.health_requirements}</p>
        <p>
          المغادرة المبكرة تحتسب العقد كاملاً. الرد الكامل قبل الوصول فقط. إيصال
          اختباري وليس فاتورة قانونية.
        </p>
        <p>
          معرف الحجز: <bdi>{b.id}</bdi>
        </p>
        <button
          className="button outline no-print"
          type="button"
          onClick={() => window.print()}
        >
          طباعة إيصال الإقامة
        </button>
      </section>
      {access.owner && !b.policy_accepted && b.status === 'confirmed' && (
        <CareForm
          label="قبول شروط الإقامة"
          submit={(f) =>
            send(`boarding/${b.id}/accept-policy`, {
              version: b.version,
              policyAccepted: f.get('policy') === 'on',
            })
          }
        >
          <label className="care-check">
            <input name="policy" type="checkbox" required />
            أقبل شروط الوحدة والمراجعة الطبية قبل الوصول والرد قبل الوصول
            والمغادرة المبكرة بكامل العقد. هذا لا يمنح الوصول إلى الملف الطبي.
          </label>
        </CareForm>
      )}
      {(access.owner || access.admin) && b.status === 'confirmed' && (
        <CareAction
          action={() =>
            send(
              access.admin
                ? `${base}/cancel`
                : `sandbox/boarding/${b.id}/cancel`,
            )
          }
        >
          إلغاء الإقامة وردها اختبارياً
        </CareAction>
      )}
      <section className="panel care-section">
        <h2>مراجعات القبول</h2>
        <p>
          مراجعة إدخال يدوي من طبيب العيادة؛ لا يفتح هذا المسار الملف الطبي.
          ملاحظات القبول الصحية للطبيب الموثق والمالك الأصلي الحالي.
        </p>
        {!data.reviews.length && (
          <p>
            بانتظار مراجعة الطبيب. مربع تأكيد من المتصفح لا يكفي لتسجيل الوصول.
          </p>
        )}
        {data.reviews.map((r) => (
          <article className="care-section" key={r.id}>
            <h3>
              {r.decision === 'approved' ? 'قبول الإقامة' : 'رفض الإقامة'} ·{' '}
              {r.doctor_name}
            </h3>
            <p>
              {careDate(r.created_at)} · صالحة حتى{' '}
              <bdi dir="ltr">{r.valid_through}</bdi>
            </p>
            {r.notes !== null && (
              <>
                <p>
                  الوزن {r.weight_grams} غرام ·{' '}
                  {r.vaccines_checked
                    ? 'تم تدقيق وثائق اللقاح'
                    : 'لم يؤكد تدقيق وثائق اللقاح'}
                </p>
                <p>{r.notes}</p>
              </>
            )}
          </article>
        ))}
        {access.doctor && b.status === 'confirmed' && (
          <CareForm
            label="تسجيل مراجعة القبول"
            submit={(f) =>
              send(
                `${base}/reviews`,
                {
                  version: b.version,
                  decision: f.get('decision'),
                  weightGrams: Number(f.get('weight')),
                  vaccinesChecked: f.get('vaccines') === 'on',
                  validThrough: f.get('valid'),
                  notes: f.get('notes'),
                },
                true,
              )
            }
          >
            <label>
              قرار القبول
              <select name="decision">
                <option value="approved">مقبول</option>
                <option value="rejected">مرفوض</option>
              </select>
            </label>
            <label>
              الوزن المراجع بالغرام
              <input
                name="weight"
                type="number"
                min={1}
                max={2000000}
                step={1}
                required
              />
            </label>
            <label className="care-check">
              <input name="vaccines" type="checkbox" />
              راجعت وثائق اللقاح المطلوبة
            </label>
            <label>
              صلاحية المراجعة حتى
              <input
                name="valid"
                type="date"
                defaultValue={b.ends_on}
                required
              />
            </label>
            <label>
              ملاحظة الطبيب
              <textarea name="notes" minLength={5} maxLength={2000} required />
            </label>
          </CareForm>
        )}
      </section>
      {access.operator && b.status === 'confirmed' && (
        <CareAction
          action={() =>
            send(`${base}/transition`, {
              status: 'checked_in',
              version: b.version,
            })
          }
        >
          تسجيل وصول الحيوان بعد المراجعة
        </CareAction>
      )}
      <section className="panel care-section">
        <h2>سجل الحوادث والمتابعة</h2>
        <p>
          السجل ثابت؛ أضف حلاً مستقلاً. الحادث العاجل يحتاج تقييماً وحلاً من
          طبيب مخول قبل المغادرة. لا يرسل هذا النموذج اتصال طوارئ؛ تواصل مباشرة
          مع الطبيب عند الحاجة.
        </p>
        {!data.incidents.length && <p>لا حوادث مسجلة.</p>}
        {data.incidents.map((i) => (
          <article className="care-section" key={i.id}>
            <h3>
              {i.kind === 'resolution' ? 'حل موثق' : 'حادث'} ·{' '}
              {severityLabels[i.severity]}
            </h3>
            <p>{i.body}</p>
            <p>
              {i.actor_name} · {careDate(i.created_at)}
            </p>
            {i.kind === 'incident' && (
              <p>
                {unresolved.some((x) => x.id === i.id)
                  ? 'بانتظار الحل'
                  : 'تم توثيق الحل'}
              </p>
            )}
            {access.operator &&
              b.status === 'checked_in' &&
              unresolved.some((x) => x.id === i.id) &&
              (i.severity !== 'urgent' || access.doctor) && (
                <CareForm
                  label="توثيق حل الحادث"
                  submit={(f) =>
                    send(
                      `${base}/incidents`,
                      {
                        kind: 'resolution',
                        severity: i.severity,
                        resolvesId: i.id,
                        body: f.get('body'),
                      },
                      true,
                    )
                  }
                >
                  <label>
                    تفاصيل الحل
                    <textarea
                      name="body"
                      minLength={5}
                      maxLength={2000}
                      required
                    />
                  </label>
                </CareForm>
              )}
          </article>
        ))}
        {access.operator && b.status === 'checked_in' && (
          <CareForm
            label="تسجيل حادث إقامة"
            submit={(f) =>
              send(
                `${base}/incidents`,
                {
                  kind: 'incident',
                  severity: f.get('severity'),
                  body: f.get('body'),
                },
                true,
              )
            }
          >
            <label>
              درجة المتابعة
              <select name="severity">
                <option value="low">بسيط</option>
                <option value="attention">يحتاج متابعة</option>
                <option value="urgent">عاجل</option>
              </select>
            </label>
            <label>
              تفاصيل الحادث
              <textarea name="body" minLength={5} maxLength={2000} required />
            </label>
          </CareForm>
        )}
      </section>
      {access.operator && b.status === 'checked_in' && (
        <CareAction
          action={() =>
            send(`${base}/transition`, {
              status: 'completed',
              version: b.version,
            })
          }
        >
          تأكيد المغادرة وإتمام العقد
        </CareAction>
      )}
    </IdentityShell>
  );
}
