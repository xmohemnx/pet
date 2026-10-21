'use client';
import { useRef, useState } from 'react';
import type {
  IdentityMe,
  Pet,
  GroomingCatalog,
  GroomingBooking,
  GroomingOffer,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate, speciesLabels } from './care-shared';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  mutate,
} from './platform-shared';
import { api } from '../lib/auth-client';
function BookGrooming({
  offer,
  slots,
  pets,
  refresh,
}: {
  offer: GroomingOffer;
  slots: GroomingCatalog['slots'];
  pets: Pet[];
  refresh: () => Promise<void>;
}) {
  const [extras, setExtras] = useState<string[]>([]),
    keys = useRef(new Map<string, string>());
  const chosen = offer.addons.filter((a) => extras.includes(a.code)),
    amount =
      BigInt(offer.price_minor) +
      chosen.reduce((s, a) => s + BigInt(a.priceMinor), 0n),
    eligible = pets.filter(
      (p) => offer.species.includes(p.species) && !p.archived_at,
    );
  return (
    <article className="panel care-section">
      <p className="eyebrow">
        {offer.clinic_name} · {offer.branch_name} · {offer.city}
      </p>
      <h2>{offer.name}</h2>
      <p>{offer.description}</p>
      <p>
        الأنواع: {offer.species.map((s) => speciesLabels[s] ?? s).join('، ')}
      </p>
      <CareForm
        label={`حجز ${offer.name} اختبارياً`}
        submit={async (f) => {
          const input = {
              slotId: String(f.get('slot')),
              petId: String(f.get('pet')),
              addonCodes: [...extras].sort(),
              priceMinor: amount.toString(),
              photosConsent: f.get('photos') === 'on',
            },
            fingerprint = JSON.stringify(input),
            key = keys.current.get(fingerprint) ?? crypto.randomUUID();
          keys.current.set(fingerprint, key);
          await mutate('sandbox/grooming', { ...input, idempotencyKey: key });
          await refresh();
          keys.current.delete(fingerprint);
        }}
      >
        <label>
          حيوان لخدمة {offer.name}
          <select name="pet" required>
            <option value="">اختر الحيوان</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          موعد {offer.name}
          <select name="slot" required>
            <option value="">اختر الموعد</option>
            {slots
              .filter((s) => s.service_id === offer.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {careDate(s.starts_at)} · {s.staff_name} · {s.resource_name}
                </option>
              ))}
          </select>
        </label>
        {offer.addons.map((a) => (
          <label className="care-check" key={a.code}>
            <input
              type="checkbox"
              checked={extras.includes(a.code)}
              onChange={(e) =>
                setExtras(
                  e.target.checked
                    ? [...extras, a.code]
                    : extras.filter((c) => c !== a.code),
                )
              }
            />
            {a.name} · {formatIqd(a.priceMinor)} · {a.minutes} دقيقة إضافية
          </label>
        ))}
        <p aria-live="polite">
          الإجمالي {formatIqd(amount.toString())} · المدة{' '}
          {offer.duration_minutes + chosen.reduce((s, a) => s + a.minutes, 0)}{' '}
          دقيقة
        </p>
        <label className="care-check">
          <input type="checkbox" name="photos" />
          أوافق على صور إتمام خاصة بهذا الحجز، ويمكنني سحب الموافقة لاحقاً.
        </label>
        <label className="care-check">
          <input type="checkbox" required />
          أوافق على التحصيل الاختباري والإلغاء برد كامل قبل الموعد وبدء التنفيذ.
        </label>
      </CareForm>
    </article>
  );
}
export function GroomingCenter({
  me,
  pets,
  initialCatalog,
  initialBookings,
}: {
  me: IdentityMe;
  pets: Pet[];
  initialCatalog: GroomingCatalog;
  initialBookings: GroomingBooking[];
}) {
  const [catalog, setCatalog] = useState(initialCatalog),
    [bookings, setBookings] = useState(initialBookings);
  async function refresh() {
    const [c, b] = await Promise.all([
      api<GroomingCatalog>('grooming/catalog'),
      api<GroomingBooking[]>('me/grooming'),
    ]);
    setCatalog(c);
    setBookings(b);
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="خدمات العيادات" title="العناية والتجميل">
        اختر خدمة وموظفاً وغرفة من العيادة. يتحقق الخادم من النوع والسعر وعدم
        تعارض الموعد.
      </PlatformHeading>
      <SandboxNotice />
      <section className="care-section">
        <h2>الخدمات المتاحة</h2>
        {!catalog.services.length && (
          <Empty>لا توجد خدمات تجميل منشورة بعد.</Empty>
        )}
        {catalog.services.map((s) => (
          <BookGrooming
            key={s.id}
            offer={s}
            slots={catalog.slots}
            pets={pets}
            refresh={refresh}
          />
        ))}
      </section>
      <section className="care-section">
        <h2>حجوزات التجميل الخاصة بي</h2>
        {!bookings.length && <Empty>لا توجد حجوزات بعد.</Empty>}
        {bookings.map((b) => (
          <article className="panel care-section" key={b.id}>
            <h3>
              {b.service_name} · {b.pet_name}
            </h3>
            <p>
              {careDate(b.starts_at)} · {b.staff_name} · {b.resource_name}
            </p>
            <p>
              {
                {
                  confirmed: 'مؤكد',
                  in_progress: 'قيد التنفيذ',
                  completed: 'مكتمل',
                  cancelled: 'ملغى',
                }[b.status]
              }{' '}
              · {formatIqd(b.total_minor)}
            </p>
            <p>
              إيصال اختباري #{b.id.slice(0, 8)} · {b.clinic_name}
            </p>
            {b.addons.map((a) => (
              <p key={a.code}>
                {a.name} · {formatIqd(a.priceMinor)}
              </p>
            ))}
            {b.photos.map((id) => (
              <img
                key={id}
                src={`/api/v1/media/${id}/file`}
                alt={`صورة إتمام ${b.service_name}`}
                style={{ maxWidth: '100%', borderRadius: 12 }}
              />
            ))}
            {b.status === 'confirmed' && (
              <CareAction
                action={async () => {
                  await mutate(`sandbox/grooming/${b.id}/cancel`);
                  await refresh();
                }}
              >
                إلغاء حجز {b.pet_name}
              </CareAction>
            )}
            {b.photos_consent && (
              <CareAction
                action={async () => {
                  await mutate(`grooming/${b.id}/withdraw-photos`);
                  await refresh();
                }}
              >
                سحب موافقة صور {b.pet_name}
              </CareAction>
            )}
            {b.status === 'completed' && !b.review && (
              <CareForm
                label="تقييم خدمة التجميل"
                submit={async (f) => {
                  await mutate(`grooming/${b.id}/review`, {
                    rating: Number(f.get('rating')),
                    body: f.get('body'),
                  });
                  await refresh();
                }}
              >
                <label>
                  تقييم {b.service_name}
                  <select name="rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  تعليق على خدمة التجميل
                  <textarea
                    name="body"
                    minLength={5}
                    maxLength={1000}
                    required
                  />
                </label>
              </CareForm>
            )}
            {b.review && (
              <p>
                تقييمي {b.review.rating}/5 · {b.review.body}
              </p>
            )}
          </article>
        ))}
      </section>
      <button
        type="button"
        className="button outline"
        onClick={() => window.print()}
      >
        طباعة حجوزاتي وإيصالاتي
      </button>
    </IdentityShell>
  );
}
