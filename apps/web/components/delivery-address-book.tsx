'use client';
import { useState } from 'react';
import type { DeliveryAddress } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareForm, CareAction } from './care-shared';
const fields = [
  ['label', 'تسمية العنوان'],
  ['contactName', 'اسم مستلم التسليم'],
  ['phone', 'رقم اتصال التسليم'],
  ['province', 'المحافظة'],
  ['city', 'مدينة التسليم'],
  ['area', 'المنطقة'],
  ['street', 'الشارع'],
  ['building', 'البناية'],
  ['landmark', 'نقطة دالة (اختياري)'],
] as const;
export function DeliveryAddressBook({
  initial,
  onChanged,
}: {
  initial: DeliveryAddress[];
  onChanged: (a: DeliveryAddress[]) => void;
}) {
  const [addresses, setAddresses] = useState(initial),
    [editing, setEditing] = useState<DeliveryAddress | null>(null);
  async function refresh() {
    const next = await api<DeliveryAddress[]>('me/delivery-addresses');
    setAddresses(next);
    onChanged(next);
  }
  return (
    <section className="panel care-section">
      <h2>عناوين التسليم الخاصة</h2>
      <p>
        تظهر لك وللفريق المخول بتجهيز طلبك. تعديل العنوان أو حذفه لا يغير طلباً
        سابقاً.
      </p>
      {addresses.map((a) => (
        <article key={a.id} className="care-list-row">
          <div>
            <h3>{a.label}</h3>
            <p>
              {a.contact_name} · {a.phone}
            </p>
            <p>
              {[a.province, a.city, a.area, a.street, a.building, a.landmark]
                .filter(Boolean)
                .join('، ')}
            </p>
            <div className="inline-actions">
              <button
                type="button"
                className="button outline"
                onClick={() => setEditing(a)}
              >
                تعديل {a.label}
              </button>
              <CareAction
                action={async () => {
                  await api(`me/delivery-addresses/${a.id}`, {
                    method: 'DELETE',
                  });
                  if (editing?.id === a.id) setEditing(null);
                  await refresh();
                }}
              >
                حذف العنوان
              </CareAction>
            </div>
          </div>
        </article>
      ))}
      <details open={!!editing}>
        <summary>
          {editing ? 'تعديل العنوان المحدد' : 'إضافة عنوان تسليم'}
        </summary>
        <CareForm
          key={`${editing?.id ?? 'new'}:${editing?.version ?? 0}`}
          label="حفظ عنوان التسليم"
          submit={async (f) => {
            const body = Object.fromEntries(
              fields.map(([key]) => [key, f.get(key)]),
            );
            await api(
              editing
                ? `me/delivery-addresses/${editing.id}`
                : 'me/delivery-addresses',
              {
                method: editing ? 'PATCH' : 'POST',
                body: JSON.stringify({
                  ...body,
                  ...(editing ? { version: editing.version } : {}),
                }),
              },
            );
            setEditing(null);
            await refresh();
          }}
        >
          {fields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                type={key === 'phone' ? 'tel' : 'text'}
                defaultValue={
                  editing
                    ? key === 'contactName'
                      ? editing.contact_name
                      : (editing[key as keyof DeliveryAddress] as string)
                    : ''
                }
                required={key !== 'landmark'}
                maxLength={
                  key === 'street' || key === 'landmark'
                    ? 300
                    : key === 'phone'
                      ? 21
                      : 100
                }
              />
            </label>
          ))}
        </CareForm>
      </details>
    </section>
  );
}
