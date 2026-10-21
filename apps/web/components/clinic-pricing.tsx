'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { IdentityMe, ClinicInfo, CommercePricing } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate, localToUtc } from './care-shared';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  mutate,
} from './platform-shared';
export function ClinicPricing({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: CommercePricing;
}) {
  const [data, setData] = useState(initial),
    base = `clinics/${clinic.id}`;
  async function refresh() {
    setData(await api<CommercePricing>(`${base}/pricing`));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="العروض وتسعير التجارة">
        كوبون واحد لكل عيادة، وخصم محفوظ في الطلب لا يتغير بعد إنشائه.
      </PlatformHeading>
      <Link className="button outline" href={`/clinic/${clinic.id}/commerce`}>
        تجارة العيادة
      </Link>
      <SandboxNotice />
      <div className="care-columns">
        <section className="panel care-section">
          <h2>إنشاء كوبون</h2>
          <p>
            شروط الرمز ثابتة بعد حفظه. يمكن تعطيله؛ لتغيير الشروط أنشئ رمزاً
            جديداً. الحجز غير المنتهي والتحصيل يحتسبان استخداماً، والمرتجع لا
            يعيد الاستخدام.
          </p>
          <CareForm
            label="إنشاء الكوبون"
            submit={async (f) => {
              await mutate(`${base}/coupons`, {
                code: f.get('code'),
                kind: f.get('kind'),
                value: f.get('value'),
                minimumMinor: f.get('minimum'),
                maximumDiscountMinor: f.get('maximum') || null,
                startsAt: localToUtc(f.get('start')),
                endsAt: localToUtc(f.get('end')),
                maxUses: Number(f.get('uses')),
                maxPerUser: Number(f.get('perUser')),
              });
              await refresh();
            }}
          >
            <label>
              رمز الكوبون
              <input
                name="code"
                dir="ltr"
                pattern="[A-Za-z0-9_-]{3,32}"
                minLength={3}
                maxLength={32}
                required
              />
            </label>
            <label>
              نوع الخصم
              <select name="kind">
                <option value="fixed">مبلغ ثابت بوحدات IQD الصغرى</option>
                <option value="percent">نسبة بنقاط الأساس (100 = 1%)</option>
              </select>
            </label>
            <label>
              قيمة الخصم
              <input
                name="value"
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={12}
                required
              />
            </label>
            <label>
              أدنى قيمة منتجات بوحدات IQD الصغرى
              <input
                name="minimum"
                pattern="[0-9]+"
                defaultValue="0"
                maxLength={12}
                required
              />
            </label>
            <label>
              سقف الخصم بوحدات IQD الصغرى (اختياري)
              <input name="maximum" pattern="[0-9]+" maxLength={12} />
            </label>
            <label>
              بداية الكوبون بتوقيت بغداد
              <input type="datetime-local" name="start" required />
            </label>
            <label>
              نهاية الكوبون بتوقيت بغداد
              <input type="datetime-local" name="end" required />
            </label>
            <label>
              أقصى استخدام إجمالي
              <input
                name="uses"
                type="number"
                min="1"
                max="100000"
                defaultValue="100"
                required
              />
            </label>
            <label>
              أقصى استخدام لكل عميل
              <input
                name="perUser"
                type="number"
                min="1"
                max="100"
                defaultValue="1"
                required
              />
            </label>
          </CareForm>
        </section>
        <section className="panel care-section">
          <h2>إعداد الضريبة الاختباري</h2>
          <p>
            تضاف الضريبة على صافي كل بند بعد الخصم، وتقرب إلى أقرب وحدة صغرى
            بنصف إلى أعلى. الإعداد افتراضيًا صفر، ولا يمثل نسبة قانونية معتمدة.
            يتطلب الحفظ صلاحية مالية وجلسة MFA حديثة.
          </p>
          <CareForm
            key={data.tax.version}
            label="حفظ الضريبة الاختبارية"
            submit={async (f) => {
              await mutate(`${base}/tax-settings`, {
                rateBps: Number(f.get('rate')),
                label: f.get('label'),
                version: data.tax.version,
              });
              await refresh();
            }}
          >
            <label>
              تسمية الضريبة
              <input
                name="label"
                defaultValue={data.tax.label}
                maxLength={100}
                required
              />
            </label>
            <label>
              نسبة الضريبة بنقاط الأساس (100 = 1%)
              <input
                name="rate"
                type="number"
                min="0"
                max="10000"
                defaultValue={data.tax.rate_bps}
                required
              />
            </label>
          </CareForm>
        </section>
      </div>
      <section className="care-section">
        <h2>كوبونات العيادة</h2>
        {!data.coupons.length && <Empty>لم تنشئ كوبوناً بعد.</Empty>}
        {data.coupons.map((c) => (
          <article className="panel care-section" key={c.id}>
            <h3 dir="ltr">{c.code}</h3>
            <p>
              {c.kind === 'fixed'
                ? formatIqd(c.value)
                : `${Number(c.value) / 100}%`}{' '}
              · {c.active ? 'مفعل' : 'معطل'} · الاستخدام {c.uses} من{' '}
              {c.max_uses} · لكل عميل {c.max_per_user}
            </p>
            <p>
              الحد الأدنى {formatIqd(c.minimum_minor)}
              {c.maximum_discount_minor &&
                ` · السقف ${formatIqd(c.maximum_discount_minor)}`}
            </p>
            <p>
              {careDate(c.starts_at)} — {careDate(c.ends_at)}
            </p>
            <CareAction
              action={async () => {
                await api(`${base}/coupons/${c.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    active: !c.active,
                    version: c.version,
                  }),
                });
                await refresh();
              }}
            >
              {c.active ? 'تعطيل ' + c.code : 'تفعيل ' + c.code}
            </CareAction>
          </article>
        ))}
      </section>
    </IdentityShell>
  );
}
