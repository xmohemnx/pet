'use client';
import { useState } from 'react';
import type {
  CareAppointment,
  CareDetail,
  VisitContent,
} from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareForm, localToUtc } from './care-shared';
import { CareConversation } from './pet-extended';
import { MedicalRecords } from './medical-records';
export function VisitEditor({
  appointment: a,
  data,
  onSaved,
}: {
  appointment: CareAppointment;
  data: CareDetail;
  onSaved: () => Promise<void>;
}) {
  const encounter = data.encounters.find((e) => e.appointment_id === a.id);
  const initial: VisitContent = encounter?.content ?? {
    complaint: '',
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    prescriptions: [],
    vaccines: [],
    labs: [],
    followUps: [],
  };
  const [dirty, setDirty] = useState(false);
  const [prescriptions, setPrescriptions] = useState(initial.prescriptions),
    [vaccines, setVaccines] = useState(initial.vaccines),
    [labs, setLabs] = useState(initial.labs),
    [followUps, setFollowUps] = useState(initial.followUps);
  async function post(path: string, body: unknown) {
    await api(path, { method: 'POST', body: JSON.stringify(body) });
    await onSaved();
  }
  return (
    <section className="panel care-section">
      <h2>زيارة {data.pet.name}</h2>
      <p className="panel-intro">
        {a.service_name} · {a.clinic_name}. السجل يوقع باسم حسابك، وبعد التوقيع
        تُحفظ التصحيحات بإضافة مستقلة.
      </p>
      {data.pet.allergies && (
        <p className="care-warning">حساسية مسجلة: {data.pet.allergies}</p>
      )}
      {data.pet.chronic_conditions && (
        <p className="care-warning">
          حالات مزمنة: {data.pet.chronic_conditions}
        </p>
      )}
      {encounter?.signed_at ? (
        <>
          <MedicalRecords encounters={[encounter]} />
          <CareForm
            label="توثيق استخدام باقة الرعاية"
            submit={(f) =>
              post(`subscriptions/${f.get('subscription')}/redeem`, {
                encounterId: encounter.id,
              })
            }
          >
            <label>
              معرف الاشتراك الذي شاركه المالك
              <input name="subscription" required />
            </label>
          </CareForm>
          <CareConversation appointmentId={a.id} title={data.pet.name} />
          {encounter.lab_orders
            .filter((l) => l.status === 'requested')
            .map((l) => (
              <CareForm
                key={l.id}
                label="اعتماد نتيجة الفحص"
                submit={async (f) =>
                  post(`encounters/${encounter.id}/labs/${l.id}/review`, {
                    result: f.get('result'),
                  })
                }
              >
                <h3>نتيجة {l.test}</h3>
                <label>
                  نص النتيجة التي راجعتها
                  <textarea name="result" required maxLength={3000} />
                </label>
                <label className="care-check">
                  <input type="checkbox" required />
                  أقر بمراجعة النتيجة وتوقيع اعتمادها.
                </label>
              </CareForm>
            ))}

          <CareForm
            label="توقيع الإضافة"
            submit={async (f) =>
              post(`encounters/${encounter.id}/addenda`, {
                note: f.get('note'),
              })
            }
          >
            <label>
              إضافة للسجل الموقع
              <textarea name="note" required maxLength={3000} />
            </label>
            <label className="care-check">
              <input type="checkbox" required />
              أقر أن هذه إضافة موقعة تحفظ أصل الزيارة.
            </label>
          </CareForm>
        </>
      ) : a.status === 'confirmed' ? (
        <>
          <div
            onChangeCapture={() => setDirty(true)}
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest('button[type="button"]'))
                setDirty(true);
            }}
          >
            <CareForm
              label="حفظ مسودة الزيارة"
              submit={async (f) =>
                post(`appointments/${a.id}/encounter`, {
                  version: encounter?.version ?? 0,
                  content: {
                    complaint: f.get('complaint'),
                    subjective: f.get('subjective'),
                    objective: f.get('objective'),
                    assessment: f.get('assessment'),
                    plan: f.get('plan'),
                    prescriptions,
                    vaccines,
                    labs,
                    followUps,
                  },
                })
              }
            >
              <label>
                سبب الزيارة
                <input
                  name="complaint"
                  required
                  maxLength={3000}
                  defaultValue={initial.complaint}
                />
              </label>
              <div className="care-fields">
                <label>
                  وصف الحالة (S)
                  <textarea
                    name="subjective"
                    maxLength={3000}
                    defaultValue={initial.subjective}
                  />
                </label>
                <label>
                  الفحص والعلامات (O)
                  <textarea
                    name="objective"
                    maxLength={3000}
                    defaultValue={initial.objective}
                  />
                </label>
                <label>
                  التقييم الطبي (A)
                  <textarea
                    name="assessment"
                    required
                    maxLength={3000}
                    defaultValue={initial.assessment}
                  />
                </label>
                <label>
                  الخطة (P)
                  <textarea
                    name="plan"
                    required
                    maxLength={3000}
                    defaultValue={initial.plan}
                  />
                </label>
              </div>
              <div className="care-editor-group">
                <h3>الوصفات</h3>
                {prescriptions.map((p, i) => (
                  <div className="care-editor-row" key={i}>
                    <label>
                      الدواء {i + 1}
                      <input
                        required
                        maxLength={100}
                        value={p.medicine}
                        onChange={(e) =>
                          setPrescriptions(
                            prescriptions.map((x, j) =>
                              j === i ? { ...x, medicine: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      تعليمات الطبيب {i + 1}
                      <textarea
                        required
                        maxLength={3000}
                        value={p.instructions}
                        onChange={(e) =>
                          setPrescriptions(
                            prescriptions.map((x, j) =>
                              j === i
                                ? { ...x, instructions: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      مدة الوصفة {i + 1}
                      <input
                        required
                        maxLength={100}
                        value={p.duration}
                        onChange={(e) =>
                          setPrescriptions(
                            prescriptions.map((x, j) =>
                              j === i ? { ...x, duration: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        setPrescriptions(
                          prescriptions.filter((_, j) => j !== i),
                        )
                      }
                    >
                      حذف الوصفة {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button outline small"
                  disabled={prescriptions.length >= 20}
                  onClick={() =>
                    setPrescriptions([
                      ...prescriptions,
                      { medicine: '', instructions: '', duration: '' },
                    ])
                  }
                >
                  إضافة وصفة
                </button>
              </div>
              <div className="care-editor-group">
                <h3>اللقاحات المنفذة</h3>
                {vaccines.map((v, i) => (
                  <div className="care-editor-row" key={i}>
                    <label>
                      اسم اللقاح {i + 1}
                      <input
                        required
                        maxLength={100}
                        value={v.name}
                        onChange={(e) =>
                          setVaccines(
                            vaccines.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      تاريخ إعطاء اللقاح {i + 1}
                      <input
                        type="date"
                        required
                        value={v.administeredOn}
                        onChange={(e) =>
                          setVaccines(
                            vaccines.map((x, j) =>
                              j === i
                                ? { ...x, administeredOn: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      تشغيلة اللقاح {i + 1}
                      <input
                        maxLength={100}
                        value={v.batch}
                        onChange={(e) =>
                          setVaccines(
                            vaccines.map((x, j) =>
                              j === i ? { ...x, batch: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      تاريخ متابعة اللقاح {i + 1}
                      <input
                        type="date"
                        value={v.nextDueOn ?? ''}
                        onChange={(e) =>
                          setVaccines(
                            vaccines.map((x, j) =>
                              j === i
                                ? { ...x, nextDueOn: e.target.value || null }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        setVaccines(vaccines.filter((_, j) => j !== i))
                      }
                    >
                      حذف اللقاح {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button outline small"
                  disabled={vaccines.length >= 20}
                  onClick={() =>
                    setVaccines([
                      ...vaccines,
                      {
                        name: '',
                        administeredOn: '',
                        batch: '',
                        nextDueOn: null,
                      },
                    ])
                  }
                >
                  توثيق لقاح
                </button>
              </div>
              <div className="care-editor-group">
                <h3>الفحوص</h3>
                {labs.map((l, i) => (
                  <div className="care-editor-row" key={i}>
                    <label>
                      اسم الفحص {i + 1}
                      <input
                        required
                        maxLength={100}
                        value={l.test}
                        onChange={(e) =>
                          setLabs(
                            labs.map((x, j) =>
                              j === i ? { ...x, test: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      حالة الفحص {i + 1}
                      <select
                        value={l.status}
                        onChange={(e) =>
                          setLabs(
                            labs.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    status: e.target.value as
                                      'requested' | 'reviewed',
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="requested">مطلوب</option>
                        <option value="reviewed">نتيجة راجعها الطبيب</option>
                      </select>
                    </label>
                    <label>
                      نتيجة الفحص {i + 1}
                      <textarea
                        required={l.status === 'reviewed'}
                        maxLength={3000}
                        value={l.result}
                        onChange={(e) =>
                          setLabs(
                            labs.map((x, j) =>
                              j === i ? { ...x, result: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setLabs(labs.filter((_, j) => j !== i))}
                    >
                      حذف الفحص {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button outline small"
                  disabled={labs.length >= 20}
                  onClick={() =>
                    setLabs([
                      ...labs,
                      { test: '', status: 'requested', result: '' },
                    ])
                  }
                >
                  إضافة فحص
                </button>
              </div>
              <div className="care-editor-group">
                <h3>مهام المتابعة بعد التوقيع</h3>
                {followUps.map((f, i) => (
                  <div className="care-editor-row" key={i}>
                    <label>
                      عنوان المتابعة {i + 1}
                      <input
                        required
                        maxLength={100}
                        value={f.title}
                        onChange={(e) =>
                          setFollowUps(
                            followUps.map((x, j) =>
                              j === i ? { ...x, title: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      وقت المتابعة بتوقيت بغداد {i + 1}
                      <input
                        type="datetime-local"
                        required
                        value={
                          f.dueAt
                            ? new Date(
                                new Date(f.dueAt).getTime() + 3 * 3600000,
                              )
                                .toISOString()
                                .slice(0, 16)
                            : ''
                        }
                        onChange={(e) =>
                          setFollowUps(
                            followUps.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    dueAt: e.target.value
                                      ? localToUtc(e.target.value)
                                      : '',
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        setFollowUps(followUps.filter((_, j) => j !== i))
                      }
                    >
                      حذف المتابعة {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button outline small"
                  disabled={followUps.length >= 20}
                  onClick={() =>
                    setFollowUps([...followUps, { title: '', dueAt: '' }])
                  }
                >
                  إضافة متابعة
                </button>
              </div>
            </CareForm>
          </div>
          {dirty && (
            <p role="status" className="care-warning">
              لديك تعديلات غير محفوظة؛ احفظ المسودة قبل توقيعها.
            </p>
          )}
          {encounter && !dirty && (
            <CareForm
              label="توقيع الزيارة وإنهاء الموعد"
              submit={async () =>
                post(`encounters/${encounter.id}/sign`, {
                  version: encounter.version,
                })
              }
            >
              <p className="panel-intro">
                التوقيع يثبت النسخة المحفوظة. احفظ أي تعديل في النموذج أولًا. لا
                يمكن توقيع زيارة قبل وقت الموعد.
              </p>
              <label className="care-check">
                <input type="checkbox" required />
                راجعت المسودة المحفوظة وأوافق على توقيعها باسمي.
              </label>
            </CareForm>
          )}
        </>
      ) : (
        <p>هذا الموعد غير مفتوح للتوثيق.</p>
      )}
      <details className="care-disclosure">
        <summary>السجل الطبي السابق المصرح به</summary>
        <MedicalRecords
          encounters={data.encounters.filter(
            (e) => e.id !== encounter?.id && e.signed_at,
          )}
        />
      </details>
    </section>
  );
}
