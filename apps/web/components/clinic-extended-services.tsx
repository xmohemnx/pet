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
import { formatIqd } from '@petra/contracts';
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
  branches: { id: string; name: string }[];
  sales: {
    id: string;
    name: string;
    subscriptions: number;
    sold_minor: string;
    recognized_minor: string;
  }[];
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
                  priceMinor: f.get('price'),
                  validDays: Number(f.get('days')),
                  category: f.get('category'),
                  branchId: f.get('branch') || null,
                  waitingDays: Number(f.get('waiting')),
                  maxPauseDays: Number(f.get('pause')),
                  entitlements: services
                    .map((s) => ({
                      serviceId: s.id,
                      uses: Number(f.get(`uses:${s.id}`)),
                    }))
                    .filter((s) => s.uses > 0),
                })
              }
            >
              <label>
                اسم الباقة
                <input name="name" required maxLength={100} />
              </label>
              <label>
                فئة الباقة
                <input
                  name="category"
                  required
                  maxLength={60}
                  defaultValue="رعاية عامة"
                />
              </label>
              <fieldset>
                <legend>حصص الخدمات المشمولة</legend>
                <p className="panel-intro">
                  صفر لاستبعاد الخدمة. حتى عشر خدمات ومئة استخدام إجمالاً.
                  الشروط محفوظة؛ أنشئ باقة جديدة لتغييرها.
                </p>
                {services.map((s) => (
                  <label key={s.id}>
                    حصة {s.name}
                    <input
                      type="number"
                      name={`uses:${s.id}`}
                      min="0"
                      max="100"
                      defaultValue="0"
                      required
                    />
                  </label>
                ))}
              </fieldset>
              <label>
                نطاق الفرع
                <select name="branch">
                  <option value="">جميع فروع العيادة</option>
                  {data.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                السعر بوحدات IQD الصغرى
                <input name="price" pattern="[1-9][0-9]{0,11}" required />
              </label>
              <label>
                الانتظار قبل الأهلية بالأيام
                <input
                  name="waiting"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue="0"
                  required
                />
              </label>
              <label>
                حد التعليق بالأيام
                <input
                  name="pause"
                  type="number"
                  min="0"
                  max="90"
                  defaultValue="30"
                  required
                />
              </label>
              <label>
                الصلاحية بالأيام
                <input name="days" type="number" min="1" max="730" required />
              </label>
            </CareForm>
            {data.plans.map((p) => (
              <div className="care-list-row" key={p.id}>
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.uses} استخدام · {p.branch_name || 'جميع الفروع'} ·{' '}
                    {p.active ? 'متاحة' : 'مخفية'}
                  </p>
                  {p.entitlements.map((e) => (
                    <p key={e.service_id}>
                      {e.service_name}: {e.uses}
                    </p>
                  ))}
                </div>
                <CareAction
                  action={() =>
                    send(`care-plans/${p.id}/availability`, {
                      version: p.version,
                      active: !p.active,
                    })
                  }
                >
                  {p.active ? 'إخفاء' : 'إتاحة'} {p.name}
                </CareAction>
              </div>
            ))}
            {!!data.sales.length && (
              <>
                <h3>مبيعات الباقات والاستهلاك</h3>
                <p className="panel-intro">
                  مبالغ اختبارية، لا تشمل المردود أو المستبدل. الاعتراف موزع
                  بالتساوي على الاستخدامات.
                </p>
                {data.sales.map((s) => (
                  <div key={s.id} className="care-list-row">
                    <div>
                      <h4>{s.name}</h4>
                      <p>
                        {s.subscriptions} اشتراك · قيمة غير مردودة{' '}
                        {formatIqd(s.sold_minor)} · إيراد معترف به{' '}
                        {formatIqd(s.recognized_minor)}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
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
