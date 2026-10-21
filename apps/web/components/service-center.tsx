'use client';
import { useRef, useState } from 'react';
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
  const pendingKeys = useRef(new Map<string, string>());
  async function sendKeyed(path: string, body: Record<string, unknown>) {
    const signature = JSON.stringify([path, body]);
    const key = pendingKeys.current.get(signature) ?? crypto.randomUUID();
    pendingKeys.current.set(signature, key);
    await mutate(path, { ...body, idempotencyKey: key });
    await refresh();
    pendingKeys.current.delete(signature);
  }
  function upgradeOptions(s: MyServices['subscriptions'][number]) {
    return catalog.plans.filter(
      (p) =>
        p.clinic_id === s.clinic_id &&
        p.branch_id === s.branch_id &&
        BigInt(p.price_minor) > BigInt(s.price_minor) &&
        p.valid_days >= s.valid_days &&
        p.waiting_days <= s.waiting_days &&
        p.max_pause_days >= s.max_pause_days &&
        s.entitlements.every((e) =>
          p.entitlements.some(
            (t) => t.service_id === e.service_id && t.uses >= e.uses,
          ),
        ),
    );
  }
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
                {p.category} · {p.uses} استخدام · {p.valid_days} يومًا
              </p>
              {p.entitlements.map((e) => (
                <p key={e.service_id}>
                  {e.service_name}: {e.uses} استخدام
                </p>
              ))}
              <p>
                {p.branch_name || 'جميع فروع العيادة'} · انتظار {p.waiting_days}{' '}
                يوم · تعليق حتى {p.max_pause_days} يوم
              </p>
              <strong>{formatIqd(p.price_minor)}</strong>
              <CareForm
                label="اشتراك اختباري"
                submit={async (f) => {
                  await sendKeyed('sandbox/subscriptions', {
                    planId: p.id,
                    petId: f.get('pet'),
                    priceMinor: p.price_minor,
                  });
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
          <article key={s.id} className="panel care-section">
            <div>
              <h3>
                {s.name} · {s.pet_name}
              </h3>
              <Status value={s.state} />
              <p>
                استُخدم {s.uses_used} من {s.uses_total} · حتى{' '}
                {careDate(s.expires_at)}
              </p>
              <p>
                {s.branch_name || 'جميع فروع العيادة'} · تبدأ الأهلية{' '}
                {careDate(s.available_at)}
              </p>
              {s.entitlements.map((e) => (
                <p key={e.service_id}>
                  {e.service_name}: استُخدم {e.used} من {e.uses}
                </p>
              ))}
              {s.state === 'paused' && s.paused_until && (
                <p>الاستئناف التلقائي {careDate(s.paused_until)}</p>
              )}
              <p className="panel-intro">
                معرف الاشتراك للطبيب: <bdi>{s.id}</bdi>
              </p>
            </div>
            {['active', 'waiting'].includes(s.state) &&
              Math.floor(s.max_pause_days - Number(s.pause_seconds) / 86400) >=
                1 && (
                <CareForm
                  label={`تعليق ${s.name}`}
                  submit={async (f) => {
                    await sendKeyed(`subscriptions/${s.id}/pause`, {
                      version: s.version,
                      days: Number(f.get('days')),
                    });
                  }}
                >
                  <label>
                    مدة التعليق بالأيام
                    <input
                      name="days"
                      type="number"
                      min="1"
                      max={Math.floor(
                        s.max_pause_days - Number(s.pause_seconds) / 86400,
                      )}
                      required
                    />
                  </label>
                  <p className="panel-intro">
                    يتوقف الاستهلاك وتمتد الصلاحية. الاستئناف تلقائي بعد المدة
                    أو مبكر بطلبك.
                  </p>
                </CareForm>
              )}
            {s.state === 'paused' && (
              <CareAction
                action={async () => {
                  await sendKeyed(`subscriptions/${s.id}/resume`, {
                    version: s.version,
                  });
                }}
              >
                استئناف {s.name} الآن
              </CareAction>
            )}
            {!s.successor_id &&
              ['expired', 'exhausted'].includes(s.state) &&
              catalog.plans.find((p) => p.id === s.plan_id) && (
                <CareForm
                  label={`تجديد ${s.name} اختباريًا`}
                  submit={async () => {
                    const p = catalog.plans.find((p) => p.id === s.plan_id)!;
                    await sendKeyed(`sandbox/subscriptions/${s.id}/renew`, {
                      priceMinor: p.price_minor,
                    });
                  }}
                >
                  <p>
                    دورة جديدة بسعر{' '}
                    {formatIqd(
                      catalog.plans.find((p) => p.id === s.plan_id)!
                        .price_minor,
                    )}
                    . لا ترحيل للمتبقي أو تحصيل دوري تلقائي.
                  </p>
                  <label className="care-check">
                    <input type="checkbox" required />
                    أوافق على بدء دورة جديدة بالشروط المنشورة.
                  </label>
                </CareForm>
              )}
            {!s.successor_id &&
              s.status === 'active' &&
              s.uses_used === 0 &&
              Date.now() - Date.parse(s.created_at) <= 7 * 86400000 &&
              ['active', 'waiting', 'paused'].includes(s.state) &&
              upgradeOptions(s).length > 0 && (
                <CareForm
                  label={`ترقية ${s.name} اختباريًا`}
                  submit={async (f) => {
                    const p = catalog.plans.find(
                      (p) => p.id === f.get('plan'),
                    )!;
                    await sendKeyed(`sandbox/subscriptions/${s.id}/upgrade`, {
                      planId: p.id,
                      priceMinor: p.price_minor,
                    });
                  }}
                >
                  <label>
                    الباقة الأعلى
                    <select name="plan" required>
                      {upgradeOptions(s).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · فرق{' '}
                          {formatIqd(
                            (
                              BigInt(p.price_minor) - BigInt(s.price_minor)
                            ).toString(),
                          )}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="panel-intro">
                    لغير المستخدم خلال سبعة أيام، بفرع واحد وحقوق لا تقل. يتحقق
                    الخادم من الشروط قبل عكس الاشتراك القديم وإنشاء الجديد.
                  </p>
                  <label className="care-check">
                    <input type="checkbox" required />
                    أوافق على استبدال الاشتراك ودفع الفرق اختباريًا.
                  </label>
                </CareForm>
              )}
          </article>
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
              <p>
                {u.max_weight_grams
                  ? `الوزن الأقصى ${u.max_weight_grams} غرام`
                  : 'لا حد وزن محدد'}{' '}
                ·{' '}
                {u.vaccines_required
                  ? 'يلزم تدقيق وثائق اللقاح'
                  : 'مراجعة صحية قبل الوصول'}
              </p>
              <p>
                {u.health_requirements ||
                  'مراجعة قبول من طبيب العيادة قبل تسجيل الوصول.'}
              </p>
              <CareForm
                label="تأكيد إقامة اختبارية"
                submit={async (f) => {
                  await sendKeyed('sandbox/boarding', {
                    unitId: u.id,
                    petId: f.get('pet'),
                    startsOn: f.get('start'),
                    endsOn: f.get('end'),
                    policyAccepted: f.get('policy') === 'on',
                  });
                }}
              >
                <label>
                  الحيوان للإقامة
                  <select name="pet" required>
                    {pets
                      .filter(
                        (p) =>
                          p.species === u.species &&
                          p.scopes.includes('owner') &&
                          !p.archived_at,
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
                <label className="care-check">
                  <input name="policy" type="checkbox" required />
                  أقبل شروط الوزن واللقاحات والمراجعة قبل الوصول. الإلغاء برد
                  كامل قبل الوصول، والمغادرة المبكرة تحتسب العقد كاملاً. هذا لا
                  يمنح الوصول إلى الملف الطبي.
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
              <Link className="text-link" href={`/boarding/${b.id}`}>
                متابعة الإقامة والمراجعة والإيصال
              </Link>
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
                      (s) =>
                        s.uses_used === 0 &&
                        s.status === 'active' &&
                        Date.now() - Date.parse(s.created_at) <= 7 * 86400000,
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
