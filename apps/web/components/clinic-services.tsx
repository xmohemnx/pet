'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/auth-client';
import { iqdToMinor } from '@petra/contracts';
import { CareForm } from './care-shared';
export function ClinicServices({
  clinicId,
  admin,
}: {
  clinicId: string;
  admin: boolean;
}) {
  const [services, setServices] = useState<
      { id: string; name: string; duration_minutes: number }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    api<typeof services>(`clinics/${clinicId}/services`)
      .then(setServices)
      .catch(() => setError('تعذر تحميل الخدمات'));
  }, [clinicId]);
  return (
    <section className="panel care-section">
      <h2>خدمات الرعاية</h2>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {services.map((s) => (
        <div className="care-list-row" key={s.id}>
          <h3>{s.name}</h3>
          <span>{s.duration_minutes} دقيقة</span>
        </div>
      ))}
      {!services.length && <p className="compact-empty">لم تضف خدمات بعد.</p>}
      {admin && (
        <CareForm
          label="إضافة الخدمة"
          submit={async (f) => {
            const s = await api<(typeof services)[number]>(
              `clinics/${clinicId}/services`,
              {
                method: 'POST',
                body: JSON.stringify({
                  name: f.get('name'),
                  durationMinutes: Number(f.get('duration')),
                  bufferMinutes: Number(f.get('buffer')),
                  priceMinor: iqdToMinor(String(f.get('price'))),
                  requiresResource: f.get('resource') === 'on',
                }),
              },
            );
            setServices([...services, s]);
          }}
        >
          <div className="care-fields">
            <label>
              اسم خدمة الرعاية
              <input name="name" maxLength={100} required />
            </label>
            <label>
              مدة الخدمة بالدقائق
              <input
                type="number"
                name="duration"
                min="15"
                max="180"
                defaultValue="30"
                required
              />
            </label>
          </div>
          <div className="care-fields">
            <label>
              فاصل بعد الموعد بالدقائق
              <input
                type="number"
                name="buffer"
                min={0}
                max={60}
                defaultValue={0}
                required
              />
            </label>
            <label>
              السعر الاسترشادي بالدينار
              <input
                type="number"
                name="price"
                min="0"
                max="999999999"
                step="0.001"
                defaultValue="0"
                required
              />
            </label>
          </div>
          <label className="check-label">
            <input type="checkbox" name="resource" />
            الحجز يتطلب غرفة علاج
          </label>
        </CareForm>
      )}
      <p className="panel-intro">
        ينشر الطبيب المنتسب أوقات هذه الخدمات من مساحة الطبيب.
      </p>
    </section>
  );
}
