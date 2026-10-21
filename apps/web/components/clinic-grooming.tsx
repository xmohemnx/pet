'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  IdentityMe,
  ClinicInfo,
  GroomingManagement,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import {
  CareForm,
  CareAction,
  careDate,
  localToUtc,
  speciesLabels,
} from './care-shared';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  mutate,
} from './platform-shared';
import { api } from '../lib/auth-client';
async function upload(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error('الصورة حتى 5MB');
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]!);
    reader.readAsDataURL(file);
  });
  return (
    await api<{ id: string }>('media', {
      method: 'POST',
      body: JSON.stringify({ dataBase64 }),
    })
  ).id;
}
export function ClinicGrooming({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: GroomingManagement;
}) {
  const [data, setData] = useState(initial),
    [extras, setExtras] = useState<number[]>([]),
    [service, setService] = useState(initial.services[0]?.id ?? ''),
    base = `clinics/${clinic.id}`,
    admin = clinic.capabilities.includes('clinic_admin');
  const selected = data.services.find((s) => s.id === service);
  async function refresh() {
    setData(await api<GroomingManagement>(`${base}/grooming`));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="إدارة العناية والتجميل">
        خدمة وفرع وموظف وغرفة. السعة مشتركة مع المواعيد الطبية.
      </PlatformHeading>
      <Link className="button outline" href={`/clinic/${clinic.id}/services`}>
        خدمات العيادة
      </Link>
      <SandboxNotice />
      {admin && (
        <div className="care-columns">
          <section className="panel care-section">
            <h2>خدمة تجميل جديدة</h2>
            <CareForm
              label="حفظ خدمة التجميل"
              submit={async (f) => {
                const s = await api<{ id: string }>(
                  `${base}/grooming-services`,
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      branchId: f.get('branch'),
                      name: f.get('name'),
                      description: f.get('description'),
                      species: f.getAll('species'),
                      priceMinor: f.get('price'),
                      minutes: Number(f.get('minutes')),
                      addons: extras.map((n) => ({
                        code: String(f.get(`code-${n}`)),
                        name: String(f.get(`name-${n}`)),
                        priceMinor: String(f.get(`price-${n}`)),
                        minutes: Number(f.get(`minutes-${n}`)),
                      })),
                    }),
                  },
                );
                setService(s.id);
                await refresh();
              }}
            >
              <label>
                اسم خدمة التجميل
                <input name="name" maxLength={100} required />
              </label>
              <label>
                وصف خدمة التجميل
                <textarea name="description" maxLength={3000} />
              </label>
              <label>
                فرع خدمة التجميل
                <select name="branch" required>
                  {data.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                سعر التجميل بوحدات IQD الصغرى
                <input
                  name="price"
                  pattern="[1-9][0-9]*"
                  maxLength={12}
                  required
                />
              </label>
              <label>
                مدة التجميل بالدقائق
                <input
                  name="minutes"
                  type="number"
                  min="15"
                  max="180"
                  defaultValue="60"
                  required
                />
              </label>
              <fieldset>
                <legend>أنواع الحيوانات المقبولة</legend>
                {Object.entries(speciesLabels).map(([id, name]) => (
                  <label className="care-check" key={id}>
                    <input name="species" type="checkbox" value={id} />
                    {name}
                  </label>
                ))}
              </fieldset>
              {extras.map((n, index) => (
                <fieldset key={n}>
                  <legend>إضافة {index + 1}</legend>
                  <label>
                    رمز الإضافة {index + 1}
                    <input
                      name={`code-${n}`}
                      pattern="[A-Z0-9_-]{1,20}"
                      maxLength={20}
                      required
                    />
                  </label>
                  <label>
                    اسم الإضافة {index + 1}
                    <input name={`name-${n}`} maxLength={100} required />
                  </label>
                  <label>
                    سعر الإضافة {index + 1} بوحدات IQD الصغرى
                    <input
                      name={`price-${n}`}
                      pattern="[1-9][0-9]*"
                      maxLength={12}
                      required
                    />
                  </label>
                  <label>
                    دقائق الإضافة {index + 1}
                    <input
                      name={`minutes-${n}`}
                      type="number"
                      min="0"
                      max="120"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => setExtras(extras.filter((i) => i !== n))}
                  >
                    حذف الإضافة {index + 1}
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className="button outline"
                disabled={extras.length >= 10}
                onClick={() => setExtras([...extras, (extras.at(-1) ?? 0) + 1])}
              >
                إضافة خيار إضافي
              </button>
            </CareForm>
          </section>
          <div className="care-stack">
            <section className="panel care-section">
              <h2>غرفة للخدمة</h2>
              <CareForm
                label="إضافة غرفة تجميل"
                submit={async (f) => {
                  await mutate(`${base}/resources`, {
                    branchId: f.get('branch'),
                    name: f.get('name'),
                  });
                  await refresh();
                }}
              >
                <label>
                  فرع الغرفة
                  <select name="branch">
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  اسم غرفة التجميل
                  <input name="name" maxLength={100} required />
                </label>
              </CareForm>
            </section>
            <section className="panel care-section">
              <h2>إتاحة موعد تجميل</h2>
              <p>
                النهاية نافذة تستوعب الخدمة والإضافات. لا تمنح الإتاحة حجزاً؛
                يعاد فحص التعارض عند حجز العميل.
              </p>
              <CareForm
                label="إضافة موعد تجميل"
                submit={async (f) => {
                  await mutate(`${base}/grooming-slots`, {
                    serviceId: service,
                    staffId: f.get('staff'),
                    resourceId: f.get('resource'),
                    startsAt: localToUtc(f.get('start')),
                    endsAt: localToUtc(f.get('end')),
                  });
                  await refresh();
                }}
              >
                <label>
                  خدمة الموعد
                  <select
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    required
                  >
                    <option value="">اختر خدمة</option>
                    {data.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  موظف التجميل
                  <select name="staff" required>
                    {data.staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  غرفة التجميل
                  <select name="resource" required>
                    {data.resources
                      .filter((r) => r.branch_id === selected?.branch_id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  بداية موعد التجميل بتوقيت بغداد
                  <input type="datetime-local" name="start" required />
                </label>
                <label>
                  نهاية موعد التجميل بتوقيت بغداد
                  <input type="datetime-local" name="end" required />
                </label>
              </CareForm>
            </section>
          </div>
        </div>
      )}
      <section className="care-section">
        <h2>خدمات التجميل</h2>
        {!data.services.length && <Empty>لم تنشأ خدمات بعد.</Empty>}
        {data.services.map((s) => (
          <article className="panel care-section" key={s.id}>
            <h3>{s.name}</h3>
            <p>
              {formatIqd(s.price_minor)} · {s.duration_minutes} دقيقة ·{' '}
              {s.addons.length} إضافات
            </p>
            {admin && (
              <CareAction
                action={async () => {
                  await mutate(
                    `${base}/grooming-services/${s.id}/availability`,
                    { active: !s.active, version: s.version },
                  );
                  await refresh();
                }}
              >
                {s.active ? 'إخفاء خدمة ' + s.name : 'إظهار خدمة ' + s.name}
              </CareAction>
            )}
          </article>
        ))}
      </section>
      {admin && (
        <section className="care-section">
          <h2>الأوقات المتاحة للحجز</h2>
          {data.slots.map((s) => (
            <article className="panel care-section" key={s.id}>
              <h3>{data.services.find((o) => o.id === s.service_id)?.name}</h3>
              <p>
                {careDate(s.starts_at)} · {s.active ? 'متاح' : 'مخفي'}
              </p>
              <CareAction
                action={async () => {
                  await mutate(`${base}/grooming-slots/${s.id}/availability`, {
                    active: !s.active,
                    version: s.version,
                  });
                  await refresh();
                }}
              >
                {s.active
                  ? 'إخفاء موعد ' + s.id.slice(0, 8)
                  : 'إظهار موعد ' + s.id.slice(0, 8)}
              </CareAction>
            </article>
          ))}
        </section>
      )}
      <section className="care-section">
        <h2>حجوزات فريق التجميل</h2>
        {!data.bookings.length && <Empty>لا توجد حجوزات بعد.</Empty>}
        {data.bookings.map((b) => (
          <article className="panel care-section" key={b.id}>
            <h3>
              {b.service_name} · {b.pet_name}
            </h3>
            <p>
              {careDate(b.starts_at)} · {b.staff_name} · {b.resource_name} ·{' '}
              {formatIqd(b.total_minor)}
            </p>
            <p>
              {
                {
                  confirmed: 'مؤكد',
                  in_progress: 'قيد التنفيذ',
                  completed: 'مكتمل',
                  cancelled: 'ملغى',
                }[b.status]
              }
            </p>
            {(admin || clinic.capabilities.includes('service_staff')) && (
              <>
                {b.status === 'confirmed' && (
                  <CareAction
                    action={async () => {
                      await mutate(`${base}/grooming/${b.id}/transition`, {
                        status: 'in_progress',
                      });
                      await refresh();
                    }}
                  >
                    بدء خدمة {b.pet_name}
                  </CareAction>
                )}
                {b.status === 'in_progress' && (
                  <CareForm
                    label={`إتمام خدمة ${b.pet_name}`}
                    submit={async (f) => {
                      const files = f
                        .getAll('photos')
                        .filter(
                          (x): x is File => x instanceof File && x.size > 0,
                        );
                      if (files.length > 4)
                        throw new Error('أربع صور كحد أقصى');
                      const photos = [];
                      for (const file of files) photos.push(await upload(file));
                      await mutate(`${base}/grooming/${b.id}/transition`, {
                        status: 'completed',
                        photos,
                      });
                      await refresh();
                    }}
                  >
                    {b.photos_consent ? (
                      <label>
                        صور إتمام خاصة اختيارية
                        <input
                          type="file"
                          name="photos"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                        />
                      </label>
                    ) : (
                      <p>العميل لم يوافق على صور الإتمام.</p>
                    )}
                    <label className="care-check">
                      <input type="checkbox" required />
                      أؤكد أن الخدمة نُفذت فعلياً.
                    </label>
                  </CareForm>
                )}
              </>
            )}
            {admin && b.status === 'confirmed' && (
              <CareAction
                action={async () => {
                  await mutate(`sandbox/grooming/${b.id}/cancel`);
                  await refresh();
                }}
              >
                إلغاء ورد حجز {b.pet_name}
              </CareAction>
            )}
          </article>
        ))}
      </section>
    </IdentityShell>
  );
}
