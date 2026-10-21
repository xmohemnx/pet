'use client';
import Link from 'next/link';
import { useState } from 'react';
import type {
  IdentityMe,
  ClinicInfo,
  HomeVisitManagement,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import {
  CareForm,
  CareAction,
  careDate,
  localToUtc,
  speciesLabels,
} from './care-shared';
import { PlatformHeading, SandboxNotice, mutate } from './platform-shared';
import { HomeVisitCard } from './home-visits';
import { api } from '../lib/auth-client';
export function ClinicHomeVisits({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: HomeVisitManagement;
}) {
  const [data, setData] = useState(initial),
    base = `clinics/${clinic.id}/home-visits`;
  async function refresh() {
    setData(await api<HomeVisitManagement>(base));
  }
  async function send(path: string, body: unknown) {
    await mutate(`${base}/${path}`, body);
    await refresh();
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="إدارة الزيارات المنزلية">
        العنوان خاص بالطبيب المسند وفريق الإرسال المخول، ولا يظهر في تقويم
        العيادة العام.
      </PlatformHeading>
      <Link className="text-link" href={`/clinic/${clinic.id}`}>
        لوحة العيادة
      </Link>
      <SandboxNotice />
      <div className="care-columns">
        <div className="care-stack">
          <section className="care-section">
            <h2>الإرسال والمتابعة</h2>
            {data.bookings.map((b) => (
              <HomeVisitCard key={b.id} booking={b}>
                {b.can_execute &&
                  b.doctor_id === me.user.id &&
                  ['confirmed', 'en_route'].includes(b.status) && (
                    <CareAction
                      action={async () => {
                        await mutate(`home-visits/${b.id}/dispatch`, {
                          version: b.version,
                          state:
                            b.status === 'confirmed' ? 'en_route' : 'arrived',
                        });
                        await refresh();
                      }}
                    >
                      {b.status === 'confirmed'
                        ? 'تأكيد الانطلاق للزيارة'
                        : 'تأكيد الوصول للزيارة'}
                    </CareAction>
                  )}
                {b.status === 'arrived' && b.doctor_id === me.user.id && (
                  <Link className="button outline" href="/doctor">
                    بدء العلاج وتوقيع الزيارة من مساحة الطبيب
                  </Link>
                )}
                {data.admin &&
                  !['completed', 'cancelled'].includes(b.status) && (
                    <CareAction
                      action={async () => {
                        await mutate(`sandbox/home-visits/${b.id}/cancel`);
                        await refresh();
                      }}
                    >
                      إلغاء ورد الزيارة قبل بدء التوثيق
                    </CareAction>
                  )}
              </HomeVisitCard>
            ))}
          </section>
          <section className="panel care-section">
            <h2>الأوقات المنشورة</h2>
            {data.slots.map((s) => (
              <p key={s.id}>
                {data.offers.find((o) => o.id === s.offer_id)?.name} ·{' '}
                {careDate(s.starts_at)} {s.cancelled_at ? '· غير متاح' : ''}
              </p>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          {data.admin && (
            <section className="panel care-section">
              <h2>إنشاء عرض زيارة منزلية</h2>
              <CareForm
                label="نشر عرض الزيارة المنزلية"
                submit={(f) =>
                  send('offers', {
                    name: f.get('name'),
                    description: f.get('description'),
                    branchId: f.get('branch'),
                    serviceId: f.get('service'),
                    doctorId: f.get('doctor'),
                    city: f.get('city'),
                    district: f.get('district'),
                    species: f.getAll('species'),
                    serviceMinor: f.get('price'),
                    travelMinor: f.get('travelPrice'),
                    travelMinutes: Number(f.get('travelMinutes')),
                  })
                }
              >
                <label>
                  اسم العرض
                  <input name="name" required minLength={2} maxLength={100} />
                </label>
                <label>
                  وصف الزيارة
                  <textarea name="description" maxLength={1500} />
                </label>
                <label>
                  الفرع المسؤول
                  <select name="branch" required>
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  الخدمة الطبية المنزلية
                  <select name="service" required>
                    {data.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  الطبيب المسند
                  <select name="doctor" required>
                    {data.doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  مدينة المنطقة
                  <input name="city" required minLength={2} maxLength={100} />
                </label>
                <label>
                  الحي المشمول
                  <input
                    name="district"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <fieldset>
                  <legend>أنواع الحيوانات المقبولة</legend>
                  {Object.entries(speciesLabels).map(([value, label]) => (
                    <label key={value} className="care-check">
                      <input name="species" type="checkbox" value={value} />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <label>
                  سعر الخدمة بوحدات IQD الصغرى
                  <input name="price" required pattern="(0|[1-9][0-9]{0,11})" />
                </label>
                <label>
                  رسوم الانتقال بوحدات IQD الصغرى
                  <input
                    name="travelPrice"
                    required
                    pattern="(0|[1-9][0-9]{0,11})"
                  />
                </label>
                <label>
                  الانتقال قبل الموعد وبعده بالدقائق
                  <input
                    name="travelMinutes"
                    type="number"
                    min="5"
                    max="120"
                    required
                    defaultValue="30"
                  />
                </label>
                <p className="panel-intro">
                  لا يمكن تعديل الشروط لاحقاً؛ أخفِ العرض وأنشئ آخر للتغيير. لا
                  تضبط هذه الأرقام من مسافة خرائط مفترضة.
                </p>
              </CareForm>
            </section>
          )}
          <section className="panel care-section">
            <h2>إتاحة العروض ونشر الأوقات</h2>
            {data.offers.map((o) => (
              <div key={o.id} className="care-section">
                <h3>{o.name}</h3>
                <p>
                  {o.doctor_name} · {o.city} / {o.district}
                </p>
                {data.admin && (
                  <CareAction
                    action={() =>
                      send(`offers/${o.id}/availability`, {
                        version: o.version,
                        active: !o.active,
                      })
                    }
                  >
                    {o.active ? 'إخفاء' : 'إتاحة'} {o.name}
                  </CareAction>
                )}
                {o.active && (data.admin || o.doctor_id === me.user.id) && (
                  <CareForm
                    label={`نشر وقت ${o.name}`}
                    submit={(f) =>
                      send('slots', {
                        offerId: o.id,
                        startsAt: localToUtc(f.get('start')),
                      })
                    }
                  >
                    <label>
                      وقت الزيارة بتوقيت بغداد
                      <input name="start" type="datetime-local" required />
                    </label>
                  </CareForm>
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
      <CareAction action={refresh}>تحديث إدارة الزيارات</CareAction>
    </IdentityShell>
  );
}
