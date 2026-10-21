'use client';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import type {
  IdentityMe,
  Pet,
  HomeVisitBooking,
  HomeVisitCatalog,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  mutate,
} from './platform-shared';
import { api } from '../lib/auth-client';
export function HomeVisits({
  me,
  pets,
  initialCatalog,
  initialBookings,
}: {
  me: IdentityMe;
  pets: Pet[];
  initialCatalog: HomeVisitCatalog;
  initialBookings: HomeVisitBooking[];
}) {
  const [catalog, setCatalog] = useState(initialCatalog),
    [bookings, setBookings] = useState(initialBookings),
    [city, setCity] = useState('');
  const keys = useRef(new Map<string, string>());
  async function refresh() {
    const [c, b] = await Promise.all([
      api<HomeVisitCatalog>(
        `home-visits/catalog?city=${encodeURIComponent(city)}`,
      ),
      api<HomeVisitBooking[]>('me/home-visits'),
    ]);
    setCatalog(c);
    setBookings(b);
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="رعاية تحت إشراف العيادة"
        title="الزيارات المنزلية"
      >
        اختر طبيباً ومنطقة وموعداً منشوراً. وقت الانتقال تقدير تنظيمي تضبطه
        العيادة، وهذه الخدمة ليست للحالات الطارئة.
      </PlatformHeading>
      <SandboxNotice />
      <CareForm label="عرض مناطق الخدمة" submit={refresh}>
        <label>
          مدينة الخدمة
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={100}
          />
        </label>
      </CareForm>
      <section className="care-section">
        <h2>العروض والمواعيد</h2>
        <div className="market-products">
          {catalog.offers.map((o) => (
            <article key={o.id} className="panel care-section">
              <p className="eyebrow">
                {o.clinic_name} · {o.branch_name}
              </p>
              <h3>{o.name}</h3>
              <p>
                الطبيب {o.doctor_name} · {o.service_name}
              </p>
              <p>{o.description}</p>
              <p>
                {o.city} · {o.district} · {o.duration_minutes} دقيقة للخدمة
              </p>
              <p>
                الانتقال المحجوز للطبيب: {o.travel_minutes} دقيقة قبل الموعد
                وبعده.
              </p>
              <p>
                الخدمة {formatIqd(o.service_minor)} + الانتقال{' '}
                {formatIqd(o.travel_minor)}
              </p>
              <strong>الإجمالي {formatIqd(o.total_minor)}</strong>
              <CareForm
                label="حجز زيارة منزلية اختبارية"
                submit={async (f) => {
                  const body = {
                    slotId: f.get('slot'),
                    petId: f.get('pet'),
                    priceMinor: o.total_minor,
                    contactName: f.get('contact'),
                    phone: f.get('phone'),
                    addressLine: f.get('address'),
                    notes: f.get('notes'),
                    addressConsent: f.get('addressConsent') === 'on',
                    medicalConsent: f.get('medicalConsent') === 'on',
                    areaConfirmed: f.get('area') === 'on',
                  };
                  const sig = JSON.stringify(body),
                    key = keys.current.get(sig) ?? crypto.randomUUID();
                  keys.current.set(sig, key);
                  await mutate('sandbox/home-visits', {
                    ...body,
                    idempotencyKey: key,
                  });
                  await refresh();
                  keys.current.delete(sig);
                }}
              >
                <label>
                  الحيوان للزيارة المنزلية
                  <select name="pet" required>
                    <option value="">اختر الحيوان</option>
                    {pets
                      .filter(
                        (p) =>
                          p.scopes.includes('owner') &&
                          !p.archived_at &&
                          o.species.includes(p.species),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  موعد الزيارة المنزلية
                  <select name="slot" required>
                    <option value="">اختر موعداً بتوقيت بغداد</option>
                    {catalog.slots
                      .filter((s) => s.offer_id === o.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {careDate(s.starts_at)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  اسم المستقبِل
                  <input
                    name="contact"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  هاتف التواصل
                  <input
                    name="phone"
                    type="tel"
                    required
                    minLength={7}
                    maxLength={24}
                    dir="ltr"
                  />
                </label>
                <label>
                  العنوان الخاص للزيارة
                  <textarea
                    name="address"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                </label>
                <label>
                  ملاحظات الوصول
                  <textarea name="notes" maxLength={1000} />
                </label>
                <label className="care-check">
                  <input name="area" type="checkbox" required />
                  أؤكد أن العنوان داخل {o.city} / {o.district}. لا يتحقق النظام
                  من العنوان عبر الخرائط.
                </label>
                <label className="care-check">
                  <input name="addressConsent" type="checkbox" required />
                  أوافق على عرض العنوان والهاتف للطبيب المسند وفريق الإرسال
                  المخول بالعيادة.
                </label>
                <label className="care-check">
                  <input name="medicalConsent" type="checkbox" required />
                  أوافق على مشاركة الملف الطبي مع الطبيب {o.doctor_name} حتى يوم
                  بعد الموعد، مع الحفاظ على موافقتي القائمة إن كانت أطول. يمكنني
                  سحبها من ملف الحيوان.
                </label>
                <p className="panel-intro">
                  الإلغاء الكامل قبل الموعد وقبل بدء العلاج أو توثيق الزيارة.
                  تحتاج الحالات الأخرى مراجعة العيادة. لا تستخدم حقوق باقة رعاية
                  لهذه الزيارة المدفوعة حالياً.
                </p>
              </CareForm>
            </article>
          ))}
        </div>
        {!catalog.offers.length && (
          <Empty>لا توجد عروض متاحة في هذه المدينة.</Empty>
        )}
      </section>
      <section className="care-section">
        <h2>زياراتي المنزلية</h2>
        {bookings.map((b) => (
          <HomeVisitCard key={b.id} booking={b}>
            <Link className="text-link" href={`/care/pets/${b.pet_id}`}>
              الملف الطبي والموافقة
            </Link>
            {!['completed', 'cancelled'].includes(b.status) && (
              <CareAction
                action={async () => {
                  await mutate(`sandbox/home-visits/${b.id}/cancel`);
                  await refresh();
                }}
              >
                إلغاء الزيارة المنزلية وردها اختباريًا
              </CareAction>
            )}
          </HomeVisitCard>
        ))}
        {!bookings.length && <Empty>لم تحجز زيارة منزلية بعد.</Empty>}
      </section>
      <CareAction action={refresh}>تحديث الزيارات المنزلية</CareAction>
    </IdentityShell>
  );
}
export function HomeVisitCard({
  booking: b,
  children,
}: {
  booking: HomeVisitBooking;
  children?: ReactNode;
}) {
  return (
    <article className="panel care-section">
      <p className="eyebrow">{b.clinic_name}</p>
      <h3>
        {b.offer_name} · {b.pet_name}
      </h3>
      <p>
        الطبيب {b.doctor_name} · {careDate(b.starts_at)}
      </p>
      <span className="small-chip">
        {
          {
            confirmed: 'مؤكد',
            en_route: 'الطبيب في الطريق',
            arrived: 'وصل الطبيب',
            completed: 'مكتمل',
            cancelled: 'ملغى',
          }[b.status]
        }
      </span>
      <p>
        {b.city} · {b.district}
      </p>
      {b.address_line ? (
        <>
          <p>المستقبِل: {b.contact_name}</p>
          <p>العنوان الخاص: {b.address_line}</p>
          <p>
            هاتف التواصل: <bdi>{b.phone}</bdi>
          </p>
          {b.notes && <p>{b.notes}</p>}
        </>
      ) : (
        <p>العنوان محجوب لغياب موافقة أو ملكية أو اعتماد ساري.</p>
      )}
      <p>
        الخدمة {formatIqd(b.service_minor)} + الانتقال{' '}
        {formatIqd(b.travel_minor)} · الإجمالي {formatIqd(b.total_minor)}
      </p>
      <p className="panel-intro">
        رقم الطلب: <bdi>{b.id}</bdi>
      </p>
      <p>إيصال اختباري؛ لا يمثل فاتورة ضريبية قانونية.</p>
      <Link className="text-link" href={`/home-visits/${b.id}/receipt`}>
        عرض إيصال الزيارة وطباعته
      </Link>
      {children}
    </article>
  );
}
