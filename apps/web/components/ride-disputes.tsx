'use client';
import { useRef, useState } from 'react';
import { formatIqd } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { mutate } from './platform-shared';
import { CareForm, CareAction, careDate } from './care-shared';
type Dispute = {
  id: string;
  reason: string;
  status: 'open' | 'proposed' | 'resolved';
  version: number;
  proposal_kind: 'no_compensation' | 'refund_full' | null;
  proposal_reason: string | null;
  proposed_by: string | null;
  decision_approved: boolean | null;
  decision_reason: string | null;
  journal_id: string | null;
};
type Detail = {
  dispute: Dispute | null;
  messages: {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
  }[];
  ride: { id: string; status: string; fareMinor: string };
  mode: string;
};
export type DisputeQueue = {
  id: string;
  ride_id: string;
  status: string;
  version: number;
  created_at: string;
}[];
export function RideDisputeCard({
  rideId,
  review = false,
}: {
  rideId: string;
  review?: boolean;
}) {
  const [value, setValue] = useState<Detail | null>(null),
    [error, setError] = useState('');
  const keys = useRef(new Map<string, string>());
  const base = review
    ? `admin/transport/rides/${rideId}/dispute`
    : `rides/${rideId}/dispute`;
  async function refresh() {
    setValue(await api<Detail>(base));
    setError('');
  }
  async function load() {
    try {
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل النزاع');
    }
  }
  async function send(
    path: string,
    body: Record<string, unknown>,
    idempotent = false,
  ) {
    const serialized = JSON.stringify({ path, body });
    if (idempotent && !keys.current.has(serialized))
      keys.current.set(serialized, crypto.randomUUID());
    await mutate(path, {
      ...body,
      ...(idempotent ? { idempotencyKey: keys.current.get(serialized) } : {}),
    });
    await refresh();
    keys.current.delete(serialized);
  }
  const d = value?.dispute;
  return (
    <details
      className="care-section"
      onToggle={(e) => {
        if (e.currentTarget.open && !value) void load();
      }}
    >
      <summary>
        {review ? 'مراجعة نزاع النقل' : 'سجل نزاع الرحلة وتسويته'}
      </summary>
      {error && <p role="alert">{error}</p>}
      <p>
        سجل خاص بالطرفين والمراجعين المفوضين. التعويض هنا محاسبي اختباري دون
        تحويل مصرفي. لا رسوم إلغاء محصلة في هذه النسخة. الخطر المباشر يحتاج جهة
        الطوارئ المناسبة؛ إرسال بلاغ لا يضمن استجابة فورية.
      </p>
      {value && (
        <>
          <p>قيمة الرحلة الاختبارية: {formatIqd(value.ride.fareMinor)}</p>
          {!d && !review && (
            <CareForm
              label="فتح نزاع الرحلة"
              submit={(f) =>
                send(base, { reason: String(f.get('reason')) }, true)
              }
            >
              <label>
                سبب فتح النزاع
                <textarea
                  name="reason"
                  minLength={10}
                  maxLength={2000}
                  required
                />
              </label>
            </CareForm>
          )}
          {d && (
            <>
              <h4>
                حالة النزاع:{' '}
                {
                  {
                    open: 'مفتوح',
                    proposed: 'بانتظار مراجع مستقل',
                    resolved: 'محسوم',
                  }[d.status]
                }
              </h4>
              <p>{d.reason}</p>
              {d.proposal_reason && (
                <p>
                  المقترح:{' '}
                  {d.proposal_kind === 'refund_full'
                    ? 'تعويض اختباري كامل'
                    : 'دون تعويض'}{' '}
                  · {d.proposal_reason}
                </p>
              )}
              {d.status === 'resolved' && (
                <p role="status">
                  القرار:{' '}
                  {d.decision_approved
                    ? 'اعتمد المقترح'
                    : 'رفض المقترح دون أثر مالي'}{' '}
                  · {d.decision_reason}
                  {d.journal_id
                    ? ' · رُحّل قيد التعويض الاختباري مرة واحدة.'
                    : ''}
                </p>
              )}
              <ol>
                {value.messages.map((m) => (
                  <li key={m.id}>
                    <p>{m.body}</p>
                    <time dateTime={m.created_at}>
                      {careDate(m.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
              {d.status !== 'resolved' && (
                <CareForm
                  label="إضافة إفادة للنزاع"
                  submit={(f) =>
                    send(
                      `${base}/messages`,
                      { body: String(f.get('body')) },
                      true,
                    )
                  }
                >
                  <label>
                    إفادة خاصة للنزاع
                    <textarea
                      name="body"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                </CareForm>
              )}
              {review && d.status === 'open' && (
                <CareForm
                  label="اقتراح تسوية النزاع"
                  submit={(f) =>
                    send(`${base}/proposal`, {
                      version: d.version,
                      kind: String(f.get('kind')),
                      reason: String(f.get('reason')),
                    })
                  }
                >
                  <p>
                    يلزم تفويض معد مالي وجلسة MFA حديثة. لا تعتمد اقتراحك بنفسك.
                  </p>
                  <label>
                    نوع التسوية
                    <select name="kind">
                      <option value="no_compensation">دون تعويض</option>
                      <option value="refund_full">
                        تعويض كامل للتحصيل الاختباري
                      </option>
                    </select>
                  </label>
                  <label>
                    مبررات اقتراح التسوية
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                </CareForm>
              )}
              {review && d.status === 'proposed' && (
                <CareForm
                  label="حفظ قرار المراجع المستقل"
                  submit={(f) =>
                    send(`${base}/decision`, {
                      version: d.version,
                      approved: f.get('decision') === 'approve',
                      reason: String(f.get('reason')),
                    })
                  }
                >
                  <p>
                    يلزم مفوض مالي checker مختلف عن المعد، وجلسة MFA خلال آخر 30
                    دقيقة. يرفض النظام التعويض إن صرف المستحق أو نقص رصيد
                    التحصيل.
                  </p>
                  <label>
                    قرار المراجع
                    <select name="decision">
                      <option value="reject">رفض المقترح دون أثر مالي</option>
                      <option value="approve">اعتماد المقترح</option>
                    </select>
                  </label>
                  <label>
                    مبررات القرار النهائي
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                </CareForm>
              )}
            </>
          )}
          <CareAction action={refresh}>تحديث سجل النزاع</CareAction>
        </>
      )}
    </details>
  );
}
