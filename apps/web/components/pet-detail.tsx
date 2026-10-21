'use client';
import Link from 'next/link';
import { PetExtended } from './pet-extended';
import { PetSafety } from './pet-safety';
import { useState } from 'react';
import type { IdentityMe, CareDetail, AvailableSlot } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { PetForm } from './pet-form';
import {
  CareForm,
  CareAction,
  careDate,
  localToUtc,
  speciesLabels,
  appointmentLabels,
} from './care-shared';
import { MedicalRecords } from './medical-records';
import { api } from '../lib/auth-client';
export function PetDetail({
  me,
  initial,
  slots,
}: {
  me: IdentityMe;
  initial: CareDetail;
  slots: AvailableSlot[];
}) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState(false),
    [slot, setSlot] = useState(''),
    [key, setKey] = useState('');
  const p = data.pet,
    owner = p.scopes.includes('owner'),
    medical = p.scopes.includes('medical'),
    booking = p.scopes.includes('booking');
  async function refresh() {
    setData(await api<CareDetail>(`pets/${p.id}`));
  }
  async function post(path: string, body: unknown) {
    await api(path, { method: 'POST', body: JSON.stringify(body) });
    await refresh();
  }
  const appointments = data.appointments.filter(
    (a) => a.status !== 'cancelled',
  );
  const doctors = appointments.filter(
    (a, i, all) =>
      all.findIndex(
        (x) => x.doctor_id === a.doctor_id && x.clinic_id === a.clinic_id,
      ) === i,
  );
  return (
    <IdentityShell me={me}>
      <Link href="/care" className="text-link">
        ← مركز الرعاية
      </Link>
      <div className="care-heading">
        <div>
          <p className="eyebrow">
            {speciesLabels[p.species]} · {p.breed || 'ملف خاص'}
          </p>
          <h1>{p.name}</h1>
          <p>
            {p.archived_at
              ? 'ملف مؤرشف؛ الزيارات السابقة محفوظة.'
              : 'رعاية مستمرة، بإذن منك.'}
          </p>
        </div>
        {owner && (
          <button
            className="button outline"
            onClick={() => setEditing(!editing)}
            aria-expanded={editing}
          >
            تعديل الملف
          </button>
        )}
      </div>
      {owner && (
        <div className="care-actions">
          <Link className="button outline" href={`/care/pets/${p.id}/passport`}>
            جواز الرعاية والطباعة
          </Link>
        </div>
      )}
      {owner && <PetSafety petId={p.id} />}
      {editing && (
        <section className="panel care-section">
          <h2>بيانات {p.name}</h2>
          <PetForm
            pet={p}
            onSaved={() => {
              setEditing(false);
              void refresh();
            }}
          />
          {!p.archived_at && (
            <CareForm
              label="أرشفة الحيوان"
              submit={async (f) => {
                if (f.get('confirm') !== 'on')
                  throw new Error('أكد الأرشفة أولًا');
                await api(`pets/${p.id}`, { method: 'DELETE' });
                await refresh();
              }}
            >
              <label className="care-check">
                <input name="confirm" type="checkbox" required />
                أريد أرشفة الملف ومنع الحجوزات الجديدة؛ تبقى السجلات محفوظة.
              </label>
            </CareForm>
          )}
        </section>
      )}
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>المواعيد</h2>
            {!data.appointments.length && (
              <p className="compact-empty">لم يُحجز موعد بعد.</p>
            )}
            {data.appointments.map((a) => (
              <article className="care-list-row" key={a.id}>
                <div>
                  <h3>
                    {a.service_name} · {a.doctor_name}
                  </h3>
                  <p>{a.clinic_name}</p>
                  <p>{careDate(a.starts_at)}</p>
                  <span className="small-chip">
                    {appointmentLabels[a.status]}
                  </span>
                </div>
                {booking &&
                  a.status === 'confirmed' &&
                  a.attendance_state === 'scheduled' &&
                  !a.encounter_id && (
                    <CareAction
                      action={() => post(`appointments/${a.id}/cancel`, {})}
                    >
                      إلغاء الموعد
                    </CareAction>
                  )}
                {owner && a.status === 'completed' && (
                  <details>
                    <summary>تقييم زيارة مكتملة</summary>
                    <CareForm
                      label="حفظ تقييم الطبيب"
                      submit={async (f) => {
                        await api(`appointments/${a.id}/review`, {
                          method: 'POST',
                          body: JSON.stringify({
                            rating: Number(f.get('rating')),
                            body: f.get('body'),
                          }),
                        });
                      }}
                    >
                      <label>
                        التقييم من خمس نجوم
                        <select name="rating">
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        رأيك دون معلومات طبية خاصة
                        <textarea
                          name="body"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </CareForm>
                  </details>
                )}
              </article>
            ))}
            {booking && !p.archived_at && (
              <details className="care-disclosure">
                <summary>حجز موعد جديد</summary>
                <CareForm
                  label="تأكيد الحجز"
                  submit={async () => {
                    if (!slot) throw new Error('اختر موعدًا');
                    await post('appointments', {
                      petId: p.id,
                      slotId: slot,
                      idempotencyKey: key,
                    });
                    setSlot('');
                  }}
                >
                  <label>
                    الموعد (توقيت بغداد)
                    <select
                      name="slot"
                      required
                      value={slot}
                      onChange={(e) => {
                        setSlot(e.target.value);
                        setKey(crypto.randomUUID());
                      }}
                    >
                      <option value="">اختر موعدًا متاحًا</option>
                      {slots
                        .filter(
                          (s) =>
                            !data.appointments.some(
                              (a) =>
                                a.status !== 'cancelled' &&
                                a.starts_at === s.starts_at &&
                                a.doctor_id === s.doctor_id,
                            ),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {careDate(s.starts_at)} · {s.doctor_name} ·{' '}
                            {s.service_name} · {s.clinic_name} / {s.branch_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="panel-intro">
                    الحجز مؤكد عند الحفظ، ويمكن إلغاؤه قبل بدء توثيق الزيارة.
                    الموافقة على قراءة الملف الطبي منفصلة أدناه.
                  </p>
                </CareForm>
              </details>
            )}
          </section>
          {medical && (
            <>
              <section className="panel care-section">
                <h2>المتابعة والتذكيرات</h2>
                <p className="panel-intro">
                  مهام داخل التطبيق. اختر مواعيد الرعاية الطبية بالتشاور مع
                  الطبيب.
                </p>
                {!data.tasks.length && (
                  <p className="compact-empty">لا توجد مهام متابعة.</p>
                )}
                {data.tasks.map((t) => (
                  <article className="care-list-row" key={t.id}>
                    <div>
                      <h3>{t.title}</h3>
                      <p>{careDate(t.due_at)}</p>
                      <span className="small-chip">
                        {
                          {
                            planned: 'مخطط',
                            due: 'مستحق',
                            completed: 'مكتمل',
                            skipped: 'متجاوز',
                            expired: 'منتهي',
                          }[t.status]
                        }{' '}
                        · {t.encounter_id ? 'حددها الطبيب' : 'مهمة شخصية'}
                      </span>
                    </div>
                    {['planned', 'due'].includes(t.status) && (
                      <div className="care-actions">
                        <CareAction
                          action={() =>
                            post(`care/tasks/${t.id}/resolve`, {
                              status: 'completed',
                            })
                          }
                        >
                          تمت المهمة
                        </CareAction>
                        <CareAction
                          action={() =>
                            post(`care/tasks/${t.id}/resolve`, {
                              status: 'skipped',
                            })
                          }
                        >
                          تجاوز المهمة
                        </CareAction>
                      </div>
                    )}
                  </article>
                ))}
                <details className="care-disclosure">
                  <summary>إضافة مهمة شخصية</summary>
                  <CareForm
                    submit={async (f) =>
                      post(`pets/${p.id}/tasks`, {
                        title: f.get('title'),
                        dueAt: localToUtc(f.get('dueAt')),
                        ...(f.get('expiresAt')
                          ? { expiresAt: localToUtc(f.get('expiresAt')) }
                          : {}),
                      })
                    }
                  >
                    <label>
                      عنوان المهمة
                      <input name="title" required maxLength={100} />
                    </label>
                    <label>
                      الوقت بتوقيت بغداد
                      <input type="datetime-local" name="dueAt" required />
                    </label>
                    <label>
                      انتهاء المهمة بتوقيت بغداد، اختياري
                      <input type="datetime-local" name="expiresAt" />
                    </label>
                  </CareForm>
                </details>
              </section>
              <section className="panel care-section medical-passport">
                <div className="care-heading">
                  <div>
                    <h2>سجل {p.name} الطبي</h2>
                    <p className="panel-intro">
                      ملخص خاص للزيارات الموقعة والوصفات واللقاحات والفحوص.
                    </p>
                  </div>
                  <button
                    className="button outline no-print"
                    onClick={() => window.print()}
                  >
                    طباعة الملخص
                  </button>
                </div>
                {p.allergies && (
                  <p>
                    <strong>الحساسية:</strong> {p.allergies}
                  </p>
                )}
                {p.chronic_conditions && (
                  <p>
                    <strong>الحالات المزمنة:</strong> {p.chronic_conditions}
                  </p>
                )}
                <MedicalRecords encounters={data.encounters} />
              </section>
            </>
          )}
        </div>
        <aside className="care-stack">
          {owner && (
            <>
              <section className="panel care-section">
                <h2>موافقات العلاج</h2>
                <p className="panel-intro">
                  حدد الطبيب والعيادة من حجوزاتك. الموافقة تتيح قراءة الملف
                  وتوثيق العلاج حتى انتهائها أو إلغائها.
                </p>
                {data.consents.map((c) => (
                  <div
                    className="care-list-row"
                    key={`${c.clinic_id}:${c.doctor_id}`}
                  >
                    <div>
                      <h3>{c.doctor_name}</h3>
                      <p>{c.clinic_name}</p>
                      <p>حتى {careDate(c.expires_at)}</p>
                    </div>
                    <CareAction
                      action={async () => {
                        await api(
                          `pets/${p.id}/consents/${c.clinic_id}/${c.doctor_id}`,
                          { method: 'DELETE' },
                        );
                        await refresh();
                      }}
                    >
                      سحب الموافقة
                    </CareAction>
                  </div>
                ))}
                {doctors.length > 0 ? (
                  <CareForm
                    label="منح الموافقة"
                    submit={async (f) => {
                      const d = doctors.find((a) => a.id === f.get('doctor'));
                      if (!d) throw new Error('اختر الطبيب');
                      await post(`pets/${p.id}/consents`, {
                        clinicId: d.clinic_id,
                        doctorId: d.doctor_id,
                        expiresAt: new Date(
                          Date.now() + Number(f.get('days')) * 86400000,
                        ).toISOString(),
                      });
                    }}
                  >
                    <label>
                      الطبيب والعيادة
                      <select name="doctor" required>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.doctor_name} · {d.clinic_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      مدة الموافقة بالأيام
                      <input
                        type="number"
                        min="1"
                        max="89"
                        defaultValue="30"
                        name="days"
                        required
                      />
                    </label>
                    <label className="care-check">
                      <input type="checkbox" required />
                      أوافق على مشاركة الملف الطبي مع الطبيب المحدد.
                    </label>
                  </CareForm>
                ) : (
                  <p>احجز موعدًا لاختيار الطبيب.</p>
                )}
              </section>
              <section className="panel care-section">
                <h2>الأوصياء</h2>
                <p className="panel-intro">
                  شارك مع حساب موثق، واختر ما تسمح به. لا يستطيع الوصي منح وصاية
                  أو موافقة علاجية.
                </p>
                {data.guardians.map((g) => (
                  <div className="care-list-row" key={g.user_id}>
                    <div>
                      <h3>{g.name}</h3>
                      <p>
                        {g.scopes
                          .map(
                            (s) =>
                              ({
                                profile: 'الملف',
                                medical: 'السجل الطبي',
                                booking: 'الحجز',
                              })[s],
                          )
                          .join('، ')}
                      </p>
                    </div>
                    <CareAction
                      action={async () => {
                        await api(`pets/${p.id}/guardians/${g.user_id}`, {
                          method: 'DELETE',
                        });
                        await refresh();
                      }}
                    >
                      إلغاء الوصاية
                    </CareAction>
                  </div>
                ))}
                <CareForm
                  label="حفظ الوصاية"
                  submit={async (f) =>
                    post(`pets/${p.id}/guardians`, {
                      email: f.get('email'),
                      scopes: ['profile', ...f.getAll('scopes')],
                    })
                  }
                >
                  <label>
                    بريد الوصي
                    <input name="email" type="email" dir="ltr" required />
                  </label>
                  <p className="panel-intro">
                    قراءة بيانات الملف الأساسية مشمولة دائمًا.
                  </p>
                  <label className="care-check">
                    <input type="checkbox" name="scopes" value="medical" />
                    قراءة السجل الطبي ومتابعة المهام
                  </label>
                  <label className="care-check">
                    <input type="checkbox" name="scopes" value="booking" />
                    حجز المواعيد وإلغاؤها
                  </label>
                </CareForm>
              </section>
            </>
          )}
          <section className="panel care-section">
            <h2>بيانات أساسية</h2>
            <dl className="medical-soap">
              <div>
                <dt>الجنس</dt>
                <dd>
                  {{ female: 'أنثى', male: 'ذكر', unknown: 'غير محدد' }[p.sex]}
                </dd>
              </div>
              <div>
                <dt>الوزن المسجل</dt>
                <dd>
                  {p.weight_grams ? `${p.weight_grams / 1000} كغم` : 'غير مسجل'}
                </dd>
              </div>
              <div>
                <dt>الميلاد</dt>
                <dd>
                  {p.birth_date?.slice(0, 10) || 'غير مسجل'}{' '}
                  {p.birth_estimated ? '(تقديري)' : ''}
                </dd>
              </div>
              <div>
                <dt>التعقيم</dt>
                <dd>{p.neutered ? 'معقم' : 'غير مسجل كمعقم'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
      {medical && (
        <div className="pet-extension-grid">
          <PetExtended
            petId={p.id}
            owner={owner}
            appointments={data.appointments}
          />
        </div>
      )}
    </IdentityShell>
  );
}
