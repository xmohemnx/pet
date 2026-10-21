'use client';
import { useState } from 'react';
import { RescueMatches } from './rescue-matches';
import type {
  IdentityMe,
  Pet,
  AdoptionListing,
  AdoptionApplication,
  RescueCase,
  Campaign,
  MyRescue,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import {
  PlatformHeading,
  SandboxNotice,
  Status,
  Empty,
  mutate,
} from './platform-shared';
export function RescueCenter({
  me,
  pets,
  initialListings,
  initialCases,
  initialCampaigns,
  initialMine,
}: {
  me: IdentityMe;
  pets: Pet[];
  initialListings: AdoptionListing[];
  initialCases: RescueCase[];
  initialCampaigns: Campaign[];
  initialMine: MyRescue;
}) {
  const [listings, setListings] = useState(initialListings),
    [cases, setCases] = useState(initialCases),
    [campaigns, setCampaigns] = useState(initialCampaigns),
    [mine, setMine] = useState(initialMine),
    [applications, setApplications] = useState<AdoptionApplication[]>([]),
    [selected, setSelected] = useState('');
  async function refresh() {
    const [l, c, f, m] = await Promise.all([
      api<AdoptionListing[]>('adoptions'),
      api<RescueCase[]>('rescue/cases'),
      api<Campaign[]>('donations/campaigns'),
      api<MyRescue>('me/rescue'),
    ]);
    setListings(l);
    setCases(c);
    setCampaigns(f);
    setMine(m);
  }
  async function send(path: string, body: unknown = {}) {
    await mutate(path, body);
    await refresh();
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="فرصة جديدة ورفق مسؤول" title="التبني والإنقاذ">
        إعلانات تُراجع، وطلبات خاصة، وبلاغات لا تكشف موقعك الدقيق للعامة.
      </PlatformHeading>
      <div className="care-columns">
        <div className="care-stack">
          <section className="care-section">
            <h2>حيوانات تبحث عن بيت</h2>
            {!listings.length && (
              <Empty>لا إعلانات متاحة حاليًا بعد المراجعة.</Empty>
            )}
            <div className="rescue-grid">
              {listings.map((l) => (
                <article className="panel care-section" key={l.id}>
                  <p className="eyebrow">
                    {l.city} · {l.species}
                  </p>
                  <h3>{l.title}</h3>
                  <p>{l.description}</p>
                  <p>الشروط: {l.requirements}</p>
                  {l.owner_id !== me.user.id && (
                    <details>
                      <summary>أرغب بالتبني</summary>
                      <CareForm
                        label="إرسال طلب خاص"
                        submit={(f) =>
                          send(`adoptions/${l.id}/applications`, {
                            privateDetails: f.get('details'),
                          })
                        }
                      >
                        <label>
                          عن بيئة الرعاية وقدرتك على الالتزام
                          <textarea
                            name="details"
                            minLength={20}
                            maxLength={3000}
                            required
                          />
                        </label>
                        <p className="panel-intro">
                          يراها صاحب الإعلان فقط، ولا تظهر في القائمة العامة.
                        </p>
                      </CareForm>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="panel care-section">
            <h2>طلباتي وإعلاناتي</h2>
            {mine.listings.map((l) => (
              <div className="care-list-row" key={l.id}>
                <div>
                  <h3>{l.title}</h3>
                  <Status value={l.status ?? 'pending'} />
                </div>
                <CareAction
                  action={async () => {
                    setApplications(
                      await api<AdoptionApplication[]>(
                        `adoptions/${l.id}/applications`,
                      ),
                    );
                    setSelected(l.id);
                  }}
                >
                  مراجعة الطلبات الخاصة
                </CareAction>
                {!['adopted', 'removed', 'rejected'].includes(
                  l.status ?? 'pending',
                ) && (
                  <details>
                    <summary>تعديل الإعلان أو إغلاقه</summary>
                    <CareForm
                      label="تعديل الإعلان وإرساله للمراجعة"
                      submit={async (f) => {
                        await api(`adoptions/${l.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            version: l.version,
                            title: f.get('title'),
                            description: f.get('description'),
                            city: f.get('city'),
                            requirements: f.get('requirements'),
                          }),
                        });
                        setSelected('');
                        setApplications([]);
                        await refresh();
                      }}
                    >
                      <label>
                        عنوان الإعلان المعدل
                        <input
                          name="title"
                          minLength={2}
                          maxLength={100}
                          defaultValue={l.title}
                          required
                        />
                      </label>
                      <label>
                        وصف الإعلان المعدل
                        <textarea
                          name="description"
                          minLength={5}
                          maxLength={3000}
                          defaultValue={l.description}
                          required
                        />
                      </label>
                      <label>
                        مدينة الإعلان المعدلة
                        <input
                          name="city"
                          minLength={2}
                          maxLength={100}
                          defaultValue={l.city}
                          required
                        />
                      </label>
                      <label>
                        شروط التبني المعدلة
                        <textarea
                          name="requirements"
                          minLength={5}
                          maxLength={3000}
                          defaultValue={l.requirements}
                          required
                        />
                      </label>
                    </CareForm>
                    <CareForm
                      label="إغلاق إعلان التبني"
                      submit={async () => {
                        await send(`adoptions/${l.id}/close`, {
                          version: l.version,
                        });
                        setSelected('');
                        setApplications([]);
                      }}
                    >
                      <label className="check-label">
                        <input type="checkbox" required />
                        أؤكد إغلاق الإعلان ورفض طلباته الجارية دون نقل ملكية.
                      </label>
                    </CareForm>
                  </details>
                )}
              </div>
            ))}
            {selected &&
              applications.map((a) => (
                <article className="medical-item" key={a.id}>
                  <h3>{a.display_name}</h3>
                  <p>{a.private_details}</p>
                  <Status value={a.status} />
                  {a.status === 'pending' && (
                    <CareForm
                      label="حفظ قرار طلب التبني"
                      submit={async (f) => {
                        await send(`adoption-applications/${a.id}/decision`, {
                          decision: f.get('decision'),
                          reason: f.get('reason'),
                        });
                        setApplications(
                          await api<AdoptionApplication[]>(
                            `adoptions/${selected}/applications`,
                          ),
                        );
                      }}
                    >
                      <label>
                        القرار
                        <select name="decision">
                          <option value="approved">قبول</option>
                          <option value="rejected">رفض</option>
                        </select>
                      </label>
                      <label>
                        سبب القرار
                        <textarea name="reason" minLength={10} required />
                      </label>
                    </CareForm>
                  )}
                </article>
              ))}
            {mine.applications.map((a) => (
              <div key={a.id} className="care-list-row">
                <div>
                  <h3>{a.title}</h3>
                  <Status value={a.status} />
                  {a.reason && <p>{a.reason}</p>}
                </div>
                {a.status === 'approved' && (
                  <CareForm
                    label="تأكيد استلام الحيوان"
                    submit={async () =>
                      send(`adoption-applications/${a.id}/handover`, {
                        received: true,
                      })
                    }
                  >
                    <label className="care-check">
                      <input type="checkbox" required />
                      استلمت الحيوان وأقبل نقل ملكيته وملفه إليّ
                    </label>
                  </CareForm>
                )}
              </div>
            ))}
          </section>
          <section className="panel care-section">
            <h2>بلاغات المجتمع</h2>
            <p className="panel-intro">
              لا يمثل البلاغ وعدًا بخدمة طوارئ. لا يظهر قبول عيادة إلا عند
              قبولها الفعلي.
            </p>
            {cases.map((c) => (
              <article className="care-list-row" key={c.id}>
                <div>
                  <h3>{c.title}</h3>
                  <p>
                    {c.city} · {c.description}
                  </p>
                  <Status value={c.status} />
                </div>
                {c.status === 'verified' &&
                  me.workspaces.some((w) =>
                    w.capabilities.includes('clinic_admin'),
                  ) && (
                    <CareForm
                      label="قبول البلاغ باسم العيادة"
                      submit={(f) =>
                        send(`rescue/cases/${c.id}/accept`, {
                          clinicId: f.get('clinic'),
                        })
                      }
                    >
                      <label>
                        العيادة المخولة
                        <select name="clinic">
                          {me.workspaces
                            .filter((w) =>
                              w.capabilities.includes('clinic_admin'),
                            )
                            .map((w) => (
                              <option key={w.id} value={w.clinicId!}>
                                {w.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </CareForm>
                  )}
              </article>
            ))}
          </section>
          <section className="panel care-section">
            <h2>حملات التبرع الاختبارية</h2>
            <SandboxNotice />
            {campaigns.map((c) => (
              <article className="medical-item" key={c.id}>
                <h3>{c.name}</h3>
                <p>{c.purpose}</p>
                <p>المستفيد: {c.beneficiary}</p>
                <Status value={c.status} />
                <p>
                  المجموع الاختباري {formatIqd(c.collected_minor)} من{' '}
                  {formatIqd(c.goal_minor)}
                </p>
                {c.status === 'active' && (
                  <CareForm
                    label="تبرع اختباري دون دفع فعلي"
                    submit={(f) =>
                      send(`sandbox/campaigns/${c.id}/donate`, {
                        amountMinor: f.get('amount'),
                        anonymous: f.get('anonymous') === 'on',
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                  >
                    <label>
                      المبلغ الاختباري بوحدات IQD الصغرى
                      <input
                        name="amount"
                        pattern="[1-9][0-9]{0,11}"
                        required
                      />
                    </label>
                    <label className="care-check">
                      <input type="checkbox" name="anonymous" defaultChecked />
                      متبرع مجهول للعرض العام
                    </label>
                  </CareForm>
                )}
              </article>
            ))}
            {mine.donations.map((d) => (
              <div className="care-list-row" key={d.id}>
                <div>
                  <h3>{d.name}</h3>
                  <p>{formatIqd(d.amount_minor)}</p>
                  <Status value={d.status} />
                </div>
                {d.status === 'captured' && (
                  <CareAction
                    action={() => send(`sandbox/donations/${d.id}/refund`)}
                  >
                    عكس التبرع الاختباري
                  </CareAction>
                )}
              </div>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>إعلان تبنٍ مسؤول</h2>
            <CareForm
              label="إرسال الإعلان للمراجعة"
              submit={(f) =>
                send('adoptions', {
                  petId: f.get('pet'),
                  title: f.get('title'),
                  description: f.get('description'),
                  city: f.get('city'),
                  requirements: f.get('requirements'),
                })
              }
            >
              <label>
                الحيوان المملوك لك
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
              <label>
                عنوان الإعلان
                <input name="title" minLength={2} maxLength={100} required />
              </label>
              <label>
                وصف حالة الحيوان
                <textarea
                  name="description"
                  minLength={5}
                  maxLength={3000}
                  required
                />
              </label>
              <label>
                مدينة الإعلان
                <input name="city" minLength={2} maxLength={100} required />
              </label>
              <label>
                شروط التبني
                <textarea
                  name="requirements"
                  minLength={5}
                  maxLength={3000}
                  required
                />
              </label>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>بلاغ إنقاذ أو مفقود</h2>
            <CareForm
              label="إرسال البلاغ للمراجعة"
              submit={(f) =>
                send('rescue/cases', {
                  kind: f.get('kind'),
                  title: f.get('title'),
                  description: f.get('description'),
                  city: f.get('city'),
                  privateLocation: f.get('location'),
                  species: f.get('caseSpecies'),
                })
              }
            >
              <label>
                نوع الحيوان في البلاغ
                <select name="caseSpecies">
                  <option value="unknown">غير محدد</option>
                  <option value="cat">قط</option>
                  <option value="dog">كلب</option>
                  <option value="bird">طائر</option>
                  <option value="rabbit">أرنب</option>
                  <option value="other">آخر</option>
                </select>
              </label>
              <label>
                نوع البلاغ
                <select name="kind">
                  <option value="rescue">إنقاذ</option>
                  <option value="lost">مفقود</option>
                  <option value="found">معثور عليه</option>
                </select>
              </label>
              <label>
                عنوان البلاغ
                <input name="title" minLength={2} maxLength={100} required />
              </label>
              <label>
                تفاصيل البلاغ
                <textarea
                  name="description"
                  minLength={5}
                  maxLength={3000}
                  required
                />
              </label>
              <label>
                مدينة البلاغ
                <input name="city" minLength={2} maxLength={100} required />
              </label>
              <label>
                وصف الموقع الخاص
                <textarea
                  name="location"
                  minLength={5}
                  maxLength={3000}
                  required
                />
              </label>
            </CareForm>
            <h3>بلاغاتي</h3>
            {mine.cases.map((c) => (
              <div key={c.id}>
                {c.title} · <Status value={c.status} />
                {['lost', 'found'].includes(c.kind) && (
                  <RescueMatches caseId={c.id} />
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
