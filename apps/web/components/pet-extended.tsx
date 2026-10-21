'use client';
import { useState, useEffect } from 'react';
import type { MediaAsset, CareAppointment } from '@petra/contracts';
import { CareForm, CareAction } from './care-shared';
import { MediaUpload, mutate, Status } from './platform-shared';
import { api } from '../lib/auth-client';
export function PetExtended({
  petId,
  owner,
  appointments,
}: {
  petId: string;
  owner: boolean;
  appointments: CareAppointment[];
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]),
    [weights, setWeights] = useState<
      { id: string; grams: number; measured_on: string }[]
    >([]),
    [error, setError] = useState('');
  async function refresh() {
    const [a, w] = await Promise.all([
      api<MediaAsset[]>(`media?petId=${petId}`),
      api<typeof weights>(`pets/${petId}/weights`),
    ]);
    setAssets(a);
    setWeights(w);
  }
  useEffect(() => {
    refresh().catch(() => setError('تعذر تحميل المرفقات والوزن'));
  }, [petId]);
  return (
    <>
      <section className="panel care-section">
        <h2>مرفقات طبية خاصة</h2>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <MediaUpload petId={petId} onUploaded={() => void refresh()} />
        {assets.map((a) => (
          <p key={a.id}>
            <a
              className="text-link"
              href={`/api/v1/media/${a.id}/file`}
              target="_blank"
              rel="noreferrer"
            >
              فتح مرفق خاص
            </a>{' '}
            · <Status value={a.status} />
          </p>
        ))}
      </section>
      <section className="panel care-section">
        <h2>سجل الوزن</h2>
        {weights.map((w) => (
          <p key={w.id}>
            {w.measured_on} · {w.grams / 1000} كغم
          </p>
        ))}
        <CareForm
          label="تسجيل الوزن"
          submit={async (f) => {
            await mutate(`pets/${petId}/weights`, {
              grams: Math.round(Number(f.get('weight')) * 1000),
              measuredOn: f.get('date'),
            });
            await refresh();
          }}
        >
          <label>
            الوزن الجديد بالكيلوغرام
            <input
              type="number"
              step="0.001"
              min="0.001"
              max="1000"
              name="weight"
              required
            />
          </label>
          <label>
            تاريخ القياس
            <input
              type="date"
              name="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
        </CareForm>
      </section>
      {owner && (
        <section className="panel care-section">
          <h2>نقل الملكية</h2>
          <p className="panel-intro">
            يرسل طلبًا لحساب موثق؛ لا تنتقل الملكية إلا بقبوله وبعد انتهاء
            الحجوزات النشطة. تُلغى الوصايات والموافقات السابقة.
          </p>
          <CareForm
            label="طلب نقل الملكية"
            submit={(f) =>
              mutate(`pets/${petId}/transfer`, { email: f.get('email') }).then(
                () => undefined,
              )
            }
          >
            <label>
              بريد المالك الجديد
              <input type="email" name="email" required />
            </label>
          </CareForm>
        </section>
      )}
      {appointments
        .filter((a) => a.status !== 'cancelled')
        .map((a) => (
          <CareConversation
            key={a.id}
            appointmentId={a.id}
            title={a.doctor_name}
          />
        ))}
    </>
  );
}
export function CareConversation({
  appointmentId,
  title,
}: {
  appointmentId: string;
  title: string;
}) {
  const [messages, setMessages] = useState<
    { id: string; name: string; body: string }[]
  >([]);
  async function refresh() {
    setMessages(
      await api<typeof messages>(`appointments/${appointmentId}/messages`),
    );
  }
  return (
    <section className="panel care-section">
      <h2>متابعة طبية · {title}</h2>
      <p className="panel-intro">
        رسائل محفوظة مرتبطة بالموعد والموافقة. ليست قناة طوارئ أو استشارة فيديو.
      </p>
      <CareAction action={refresh}>عرض وتحديث المحادثة الطبية</CareAction>
      {messages.map((m) => (
        <p className="chat-bubble" key={m.id}>
          <strong>{m.name}</strong>
          <br />
          {m.body}
        </p>
      ))}
      <CareForm
        label="إرسال المتابعة الطبية"
        submit={async (f) => {
          await mutate(`appointments/${appointmentId}/messages`, {
            body: f.get('body'),
            idempotencyKey: crypto.randomUUID(),
          });
          await refresh();
        }}
      >
        <label>
          نص المتابعة الطبية
          <textarea name="body" maxLength={3000} required />
        </label>
      </CareForm>
    </section>
  );
}
