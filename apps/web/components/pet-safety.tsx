'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { SafetyCard } from '@petra/contracts';
import { CareForm, CareAction, careDate, localToUtc } from './care-shared';
import { api } from '../lib/auth-client';
import { mutate } from './platform-shared';
export function PetSafety({ petId }: { petId: string }) {
  const [cards, setCards] = useState<SafetyCard[]>([]),
    [link, setLink] = useState(''),
    [qr, setQr] = useState(''),
    [error, setError] = useState('');
  async function refresh() {
    setCards(await api<SafetyCard[]>(`pets/${petId}/safety-cards`));
  }
  useEffect(() => {
    refresh().catch(() => setError('تعذر تحميل بطاقات السلامة'));
  }, [petId]);
  return (
    <section className="panel care-section">
      <h2>بطاقة سلامة وQR</h2>
      <p>
        تتيح لمن يجد حيوانك الاطلاع على الاسم والنوع وبيانات الاتصال التي تختار
        نشرها فقط. لا تفتح السجل الطبي. يظهر الرابط مرة واحدة ويمكن إلغاؤه
        فورًا.
      </p>
      {error && <p role="alert">{error}</p>}
      <CareForm
        label="إنشاء بطاقة السلامة"
        submit={async (f) => {
          const result = await mutate<{ id: string; token: string }>(
            `pets/${petId}/safety-cards`,
            {
              publishConsent: f.get('consent') === 'on',
              contactName: f.get('name'),
              contactPhone: f.get('phone'),
              message: f.get('message'),
              expiresAt: localToUtc(f.get('expires')),
            },
          );
          const url = `${window.location.origin}/safety/${result.token}`;
          setLink(url);
          setQr(await QRCode.toDataURL(url, { width: 240, margin: 2 }));
          await refresh();
        }}
      >
        <label>
          اسم الاتصال الذي سيظهر للعموم
          <input name="name" minLength={2} maxLength={100} required />
        </label>
        <label>
          رقم الاتصال الذي سيظهر للعموم
          <input name="phone" type="tel" maxLength={25} required />
        </label>
        <label>
          رسالة سلامة عامة دون معلومات طبية
          <textarea name="message" maxLength={300} />
        </label>
        <label>
          انتهاء صلاحية البطاقة بتوقيت بغداد
          <input name="expires" type="datetime-local" required />
        </label>
        <label className="check-label">
          <input name="consent" type="checkbox" required />
          أوافق على إتاحة بيانات الاتصال المدخلة لكل من يملك الرابط أو QR.
        </label>
      </CareForm>
      {link && (
        <div className="care-section">
          <img width={240} height={240} src={qr} alt="QR بطاقة السلامة" />
          <label>
            رابط بطاقة السلامة
            <input readOnly value={link} dir="ltr" />
          </label>
          <a className="text-link" href={link} target="_blank" rel="noreferrer">
            فتح بطاقة السلامة
          </a>
          <a className="text-link" href={qr} download="petra-safety-qr.png">
            تنزيل رمز QR
          </a>
        </div>
      )}
      {cards.map((c) => (
        <div className="care-section" key={c.id}>
          <p>
            {c.contact_name} ·{' '}
            {c.revoked_at
              ? 'ملغاة'
              : Date.parse(c.expires_at) <= Date.now()
                ? 'منتهية'
                : `صالحة حتى ${careDate(c.expires_at)}`}
          </p>
          {!c.revoked_at && (
            <CareAction
              action={async () => {
                await api(`pets/${petId}/safety-cards/${c.id}`, {
                  method: 'DELETE',
                });
                setLink('');
                setQr('');
                await refresh();
              }}
            >
              إلغاء بطاقة السلامة
            </CareAction>
          )}
        </div>
      ))}
    </section>
  );
}
