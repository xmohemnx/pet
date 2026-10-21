'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  ClinicInfo,
  Plan,
  BoardingUnit,
  RescueCase,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import {
  PlatformHeading,
  SandboxNotice,
  Status,
  mutate,
} from './platform-shared';
type Data = {
  plans: Plan[];
  units: BoardingUnit[];
  boarding: {
    id: string;
    pet_name: string;
    unit_name: string;
    starts_on: string;
    ends_on: string;
    status: string;
  }[];
};
export function ClinicExtendedServices({
  me,
  clinic,
  initial,
  services,
  initialCases,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: Data;
  services: { id: string; name: string }[];
  initialCases: RescueCase[];
}) {
  const [data, setData] = useState(initial),
    [cases, setCases] = useState(initialCases);
  const base = `clinics/${clinic.id}`;
  async function refresh() {
    const [d, c] = await Promise.all([
      api<Data>(`${base}/services/management`),
      api<RescueCase[]>(`${base}/rescue`),
    ]);
    setData(d);
    setCases(c);
  }
  async function send(path: string, body: unknown) {
    await mutate(`${base}/${path}`, body);
    await refresh();
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow={clinic.name}
        title="الباقات والإقامة والإنقاذ"
      />
      <Link className="text-link" href={`/clinic/${clinic.id}`}>
        ← لوحة العيادة
      </Link>
      <SandboxNotice />
      <Link className="button outline" href={`/clinic/${clinic.id}/grooming`}>
        إدارة العناية والتجميل
      </Link>
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>حجوزات الفندق</h2>
            {data.boarding.map((b) => (
              <div className="care-list-row" key={b.id}>
                <div>
                  <h3>
                    {b.pet_name} · {b.unit_name}
                  </h3>
                  <p>
                    {b.starts_on.slice(0, 10)} إلى {b.ends_on.slice(0, 10)}
                  </p>
                  <Status value={b.status} />
                </div>
                {b.status === 'confirmed' && (
                  <CareForm
                    label="تسجيل الوصول"
                    submit={(f) =>
                      send(`boarding/${b.id}/transition`, {
                        status: 'checked_in',
                        healthReviewed: f.get('health') === 'on',
                      })
                    }
                  >
                    <label className="care-check">
                      <input type="checkbox" name="health" required />
                      راجعت متطلبات صحة الحيوان وقبلت إقامته
                    </label>
                  </CareForm>
                )}
                {b.status === 'checked_in' && (
                  <CareAction
                    action={() =>
                      send(`boarding/${b.id}/transition`, {
                        status: 'completed',
                        healthReviewed: true,
                      })
                    }
                  >
                    تأكيد المغادرة واكتمال الخدمة
                  </CareAction>
                )}
              </div>
            ))}
          </section>
          <section className="panel care-section">
            <h2>بلاغات قبلتها العيادة</h2>
            {cases.map((c) => (
              <div className="care-list-row" key={c.id}>
                <div>
                  <h3>{c.title}</h3>
                  <p>{c.description}</p>
                  <p>الموقع الخاص: {c.private_location}</p>
                  <Status value={c.status} />
                </div>
                {['assigned', 'in_progress'].includes(c.status) && (
                  <CareAction
                    action={async () => {
                      await mutate(`rescue/cases/${c.id}/transition`, {
                        status:
                          c.status === 'assigned' ? 'in_progress' : 'resolved',
                      });
                      await refresh();
                    }}
                  >
                    {c.status === 'assigned'
                      ? 'بدء معالجة البلاغ'
                      : 'توثيق حل البلاغ'}
                  </CareAction>
                )}
              </div>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>إنشاء باقة رعاية</h2>
            <CareForm
              label="نشر الباقة"
              submit={(f) =>
                send('care-plans', {
                  name: f.get('name'),
                  serviceId: f.get('service'),
                  priceMinor: f.get('price'),
                  uses: Number(f.get('uses')),
                  validDays: Number(f.get('days')),
                })
              }
            >
              <label>
                اسم الباقة
                <input name="name" required maxLength={100} />
              </label>
              <label>
                الخدمة المشمولة
                <select name="service" required>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                السعر بوحدات IQD الصغرى
                <input name="price" pattern="[1-9][0-9]{0,11}" required />
              </label>
              <label>
                عدد الاستخدامات
                <input name="uses" type="number" min="1" max="100" required />
              </label>
              <label>
                الصلاحية بالأيام
                <input name="days" type="number" min="1" max="730" required />
              </label>
            </CareForm>
            {data.plans.map((p) => (
              <p key={p.id}>
                {p.name} · {p.uses} استخدام
              </p>
            ))}
          </section>
          <section className="panel care-section">
            <h2>إضافة وحدة إقامة</h2>
            <CareForm
              label="إضافة الوحدة"
              submit={(f) =>
                send('boarding-units', {
                  name: f.get('name'),
                  species: f.get('species'),
                  nightPrice: f.get('price'),
                })
              }
            >
              <label>
                اسم الوحدة
                <input name="name" required maxLength={100} />
              </label>
              <label>
                نوع حيوان الوحدة
                <select name="species">
                  <option value="cat">قط</option>
                  <option value="dog">كلب</option>
                  <option value="bird">طائر</option>
                  <option value="rabbit">أرنب</option>
                </select>
              </label>
              <label>
                سعر الليلة بوحدات IQD الصغرى
                <input name="price" pattern="[1-9][0-9]{0,11}" required />
              </label>
            </CareForm>
            {data.units.map((u) => (
              <p key={u.id}>{u.name}</p>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
