'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  BoardingManagementData,
  ClinicInfo,
  IdentityMe,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, speciesLabels } from './care-shared';
import {
  SandboxNotice,
  PlatformHeading,
  Status,
  mutate,
} from './platform-shared';
import { api } from '../lib/auth-client';
export function BoardingManagement({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: BoardingManagementData;
}) {
  const [data, setData] = useState(initial),
    base = `clinics/${clinic.id}`;
  async function send(path: string, body: unknown) {
    await mutate(`${base}/${path}`, body);
    setData(await api<BoardingManagementData>(`${base}/boarding`));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="الفندق ومراجعات القبول">
        الوحدة لحيوان واحد. شروط ثابتة ومراجعة طبيب قبل الوصول، وسجل حوادث خاص
        بفريق الإقامة والمالك الحالي.
      </PlatformHeading>
      <Link className="text-link" href={`/clinic/${clinic.id}/services`}>
        باقات العيادة وخدماتها
      </Link>
      <SandboxNotice />
      <div className="care-columns">
        <section className="panel care-section">
          <h2>حجوزات الإقامة</h2>
          {data.bookings.map((b) => (
            <article className="care-list-row" key={b.id}>
              <div>
                <h3>
                  {b.pet_name} · {b.unit_name}
                </h3>
                <p>
                  <bdi dir="ltr">{b.starts_on}</bdi> إلى{' '}
                  <bdi dir="ltr">{b.ends_on}</bdi> · {formatIqd(b.total_minor)}
                </p>
                <Status value={b.status} />
                <p>
                  قرار القبول:{' '}
                  {b.review_decision === 'approved'
                    ? 'مقبول'
                    : b.review_decision === 'rejected'
                      ? 'مرفوض'
                      : 'بانتظار مراجعة الطبيب'}
                </p>
                <Link className="button outline" href={`/boarding/${b.id}`}>
                  فتح الإقامة
                </Link>
              </div>
            </article>
          ))}
          {!data.bookings.length && <p>لا حجوزات إقامة بعد.</p>}
        </section>
        <aside className="care-stack">
          {data.access.admin && (
            <section className="panel care-section">
              <h2>إنشاء وحدة إقامة</h2>
              <p>
                الأسعار والشروط ثابتة بعد الحفظ؛ أنشئ وحدة جديدة عند تغييرها.
              </p>
              <CareForm
                label="حفظ وحدة الإقامة"
                submit={(f) =>
                  send('boarding-units', {
                    name: f.get('name'),
                    species: f.get('species'),
                    nightPrice: f.get('price'),
                    maxWeightGrams: f.get('weight')
                      ? Number(f.get('weight'))
                      : null,
                    vaccinesRequired: f.get('vaccines') === 'on',
                    healthRequirements: f.get('rules'),
                  })
                }
              >
                <label>
                  اسم الوحدة
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  نوع الحيوان
                  <select name="species">
                    {Object.entries(speciesLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  سعر الليلة بالوحدات الصغرى IQD
                  <input
                    name="price"
                    inputMode="numeric"
                    pattern="[1-9][0-9]{0,11}"
                    required
                  />
                </label>
                <label>
                  الوزن الأقصى بالغرام، اختياري
                  <input
                    name="weight"
                    type="number"
                    min={1}
                    max={2000000}
                    step={1}
                  />
                </label>
                <label className="care-check">
                  <input name="vaccines" type="checkbox" />
                  يلزم تدقيق وثائق اللقاح
                </label>
                <label>
                  متطلبات صحية إضافية
                  <textarea name="rules" maxLength={1500} />
                </label>
              </CareForm>
            </section>
          )}
          <section className="panel care-section">
            <h2>وحدات الفندق</h2>
            {data.units.map((u) => (
              <article className="care-section" key={u.id}>
                <h3>{u.name}</h3>
                <p>
                  {formatIqd(u.night_price)} / ليلة ·{' '}
                  {u.active ? 'متاحة للحجز' : 'مخفية'}
                </p>
                <p>{u.health_requirements}</p>
                {data.access.admin && (
                  <CareAction
                    action={() =>
                      send(`boarding-units/${u.id}/availability`, {
                        version: u.version,
                        active: !u.active,
                      })
                    }
                  >
                    {u.active ? 'إخفاء الوحدة' : 'إتاحة الوحدة'}
                  </CareAction>
                )}
              </article>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
