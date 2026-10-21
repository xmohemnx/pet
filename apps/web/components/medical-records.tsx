'use client';
import type { Encounter } from '@petra/contracts';
import { careDate } from './care-shared';
export function MedicalRecords({ encounters }: { encounters: Encounter[] }) {
  return (
    <>
      {!encounters.length && (
        <p className="compact-empty">لا توجد زيارات موقعة بعد.</p>
      )}
      {encounters.map((e) => (
        <article className="medical-record" key={e.id}>
          <div className="care-heading">
            <div>
              <h3>{e.content.complaint}</h3>
              <p>
                {e.doctor_name} · {e.clinic_name}
              </p>
            </div>
            <span className="small-chip">
              {e.signed_at
                ? `موقّع · ${careDate(e.signed_at)}`
                : 'مسودة للطبيب فقط'}
            </span>
          </div>
          <dl className="medical-soap">
            <div>
              <dt>وصف الحالة</dt>
              <dd>{e.content.subjective || '—'}</dd>
            </div>
            <div>
              <dt>الفحص</dt>
              <dd>{e.content.objective || '—'}</dd>
            </div>
            <div>
              <dt>تقييم الطبيب</dt>
              <dd>{e.content.assessment}</dd>
            </div>
            <div>
              <dt>الخطة</dt>
              <dd>{e.content.plan}</dd>
            </div>
          </dl>
          {e.content.prescriptions.map((p, i) => (
            <div className="medical-item" key={i}>
              <h4>وصفة · {p.medicine}</h4>
              <p>{p.instructions}</p>
              <p>المدة: {p.duration}</p>
            </div>
          ))}
          {e.content.vaccines.map((v, i) => (
            <div className="medical-item" key={i}>
              <h4>لقاح · {v.name}</h4>
              <p>
                أُعطي في {v.administeredOn} · التشغيلة: {v.batch || 'غير مسجلة'}
              </p>
              {v.nextDueOn && <p>المتابعة التي حددها الطبيب: {v.nextDueOn}</p>}
            </div>
          ))}
          {(e.signed_at ? e.lab_orders : e.content.labs).map((l, i) => (
            <div className="medical-item" key={i}>
              <h4>فحص · {l.test}</h4>
              <p>
                {l.status === 'requested'
                  ? 'طلب فحص، بانتظار النتيجة'
                  : 'نتيجة راجعها الطبيب'}
              </p>
              {l.result && <p>{l.result}</p>}
            </div>
          ))}
          {e.addenda.map((a) => (
            <div className="medical-addendum" key={a.id}>
              <h4>إضافة موقعة · {careDate(a.signed_at)}</h4>
              <p>{a.note}</p>
            </div>
          ))}
        </article>
      ))}
    </>
  );
}
