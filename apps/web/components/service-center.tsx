'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  Pet,
  ServicesCatalog,
  MyServices,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import { api } from '../lib/auth-client';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  Status,
  mutate,
} from './platform-shared';
export function ServiceCenter({
  me,
  pets,
  catalog,
  initial,
}: {
  me: IdentityMe;
  pets: Pet[];
  catalog: ServicesCatalog;
  initial: MyServices;
}) {
  const [data, setData] = useState(initial),
    [cancelKind, setCancelKind] = useState('boarding');
  async function refresh() {
    setData(await api<MyServices>('me/services'));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="رعاية وخدمات لدى العيادة"
        title="باقات الرعاية والإقامة"
      >
        باقات خدمات محددة، وإقامة بوحدات محجوزة لحيوان واحد. ليست منتجات تأمين.
      </PlatformHeading>
      <SandboxNotice />
      <Link className="button outline" href="/grooming">
        العناية والتجميل
      </Link>
      <section className="care-section">
        <h2>طلبات نقل ملكية إليك</h2>
        {data.transfers
          .filter((t) => t.to_id === me.user.id)
          .map((t) => (
            <article className="panel care-section" key={t.id}>
              <h3>{t.name}</h3>
              <p>
                نقل الملكية يشمل الملف الطبي ويلغي الوصايات والموافقات السابقة.
              </p>
              <CareForm
                label="قبول نقل الملكية"
                submit={async () => {
                  await mutate(`pet-transfers/${t.id}/accept`);
                  await refresh();
                }}
              >
                <label className="care-check">
                  <input type="checkbox" required />
                  أقبل مسؤولية رعاية الحيوان واستلام ملفه.
                </label>
              </CareForm>
            </article>
          ))}
      </section>
      <section className="care-section">
        <h2>باقات الخدمات</h2>
        <div className="market-products">
          {catalog.plans.map((p) => (
            <article key={p.id} className="panel care-section">
              <p className="eyebrow">{p.clinic_name}</p>
              <h3>{p.name}</h3>
              <p>
                {p.service_name} · {p.uses} استخدام · {p.valid_days} يومًا
              </p>
              <strong>{formatIqd(p.price_minor)}</strong>
              <CareForm
                label="اشتراك اختباري"
                submit={async (f) => {
                  await mutate('sandbox/subscriptions', {
                    planId: p.id,
                    petId: f.get('pet'),
                    idempotencyKey: crypto.randomUUID(),
                  });
                  await refresh();
                }}
              >
                <label>
                  الحيوان للاشتراك
                  <select name="pet" required>
                    {pets
                      .filter((p) => p.scopes.includes('owner'))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              </CareForm>
            </article>
          ))}
        </div>
        {!catalog.plans.length && <Empty>لا باقات منشورة بعد.</Empty>}
      </section>
      <section className="panel care-section">
        <h2>اشتراكاتي</h2>
        {data.subscriptions.map((s) => (
          <div key={s.id} className="care-list-row">
            <div>
              <h3>
                {s.name} · {s.pet_name}
              </h3>
              {s.status === 'cancelled' && <Status value="cancelled" />}
              <p>
                استُخدم {s.uses_used} من {s.uses_total} · حتى{' '}
                {careDate(s.expires_at)}
              </p>
              <p className="panel-intro">
                معرف الاشتراك للطبيب: <bdi>{s.id}</bdi>
              </p>
            </div>
          </div>
        ))}
      </section>
      <section className="care-section">
        <h2>إقامة لدى عيادة</h2>
        <div className="market-products">
          {catalog.units.map((u) => (
            <article className="panel care-section" key={u.id}>
              <p className="eyebrow">{u.clinic_name}</p>
              <h3>{u.name}</h3>
              <strong>{formatIqd(u.night_price)} / ليلة</strong>
              <CareForm
                label="تأكيد إقامة اختبارية"
                submit={async (f) => {
                  await mutate('sandbox/boarding', {
                    unitId: u.id,
                    petId: f.get('pet'),
                    startsOn: f.get('start'),
                    endsOn: f.get('end'),
                    idempotencyKey: crypto.randomUUID(),
                  });
                  await refresh();
                }}
              >
                <label>
                  الحيوان للإقامة
                  <select name="pet" required>
                    {pets
                      .filter(
                        (p) =>
                          p.species === u.species &&
                          p.scopes.includes('booking'),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  الوصول
                  <input type="date" name="start" required />
                </label>
                <label>
                  المغادرة
                  <input type="date" name="end" required />
                </label>
              </CareForm>
            </article>
          ))}
        </div>
        {!catalog.units.length && <Empty>لا وحدات إقامة منشورة بعد.</Empty>}
      </section>
      <section className="panel care-section">
        <h2>حجوزات الإقامة</h2>
        {data.boarding.map((b) => (
          <div className="care-list-row" key={b.id}>
            <div>
              <h3>
                {b.name} · {b.pet_name}
              </h3>
              <p>
                {b.starts_on.slice(0, 10)} — {b.ends_on.slice(0, 10)} ·{' '}
                {formatIqd(b.total_minor)}
              </p>
              <Status value={b.status} />
            </div>
          </div>
        ))}
      </section>
      <section className="panel care-section">
        <h2>إلغاء خدمة اختبارية</h2>
        <p className="panel-intro">
          الإقامة قبل الحضور، والاشتراك غير المستخدم خلال 7 أيام. يرد الخادم
          القيد كاملًا مرة واحدة ويُحرر الحجز.
        </p>
        <CareForm
          label="إلغاء الخدمة وردها اختباريًا"
          submit={async (f) => {
            await mutate(`sandbox/${f.get('kind')}/${f.get('id')}/cancel`);
            await refresh();
          }}
        >
          <label>
            نوع الخدمة للإلغاء
            <select
              name="kind"
              value={cancelKind}
              onChange={(e) => setCancelKind(e.target.value)}
            >
              <option value="boarding">إقامة</option>
              <option value="subscriptions">اشتراك رعاية</option>
            </select>
          </label>
          <label>
            الخدمة التي تريد إلغاءها
            <select name="id" required>
              {cancelKind === 'boarding'
                ? data.boarding
                    .filter((b) => b.status === 'confirmed')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {b.pet_name} · {b.starts_on.slice(0, 10)}
                      </option>
                    ))
                : data.subscriptions
                    .filter(
                      (s) => s.uses_used === 0 && s.status !== 'cancelled',
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.pet_name}
                      </option>
                    ))}
            </select>
          </label>
          <label className="care-check">
            <input type="checkbox" required />
            أطلب إلغاء هذه الخدمة وفق سياسة الاختبار الموضحة
          </label>
        </CareForm>
      </section>
      <CareAction action={refresh}>تحديث الاشتراكات والحجوزات</CareAction>
    </IdentityShell>
  );
}
