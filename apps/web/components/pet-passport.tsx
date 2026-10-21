'use client';
import Link from 'next/link';
import type { PetPassport as Passport, IdentityMe } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { careDate, speciesLabels } from './care-shared';
export function PetPassport({ me, data }: { me: IdentityMe; data: Passport }) {
  return (
    <IdentityShell me={me}>
      <article className="panel care-section medical-passport">
        <div className="no-print">
          <Link href={`/care/pets/${data.pet.id}`}>← ملف الحيوان</Link>
          <button className="button primary" onClick={() => window.print()}>
            طباعة الجواز أو حفظه PDF
          </button>
        </div>
        <h1>جواز الرعاية · {data.pet.name}</h1>
        <p>
          نسخة خاصة للمالك من الزيارات الموقعة. ليست شهادة سفر أو تصريحًا
          رسميًا.
        </p>
        <p>
          {speciesLabels[data.pet.species]} ·{' '}
          {data.pet.breed || 'السلالة غير محددة'}
        </p>
        <p>رقم الشريحة: {data.pet.microchip || 'غير مسجل'}</p>
        <p>وقت التصدير: {careDate(data.exportedAt)}</p>
        {!data.visits.length && <p>لا زيارات موقعة قابلة للتصدير بعد.</p>}
        {data.visits.map((v) => (
          <section className="care-section" key={v.id}>
            <h2>
              {v.clinic_name} · {v.doctor_name}
            </h2>
            <p>التوقيع: {careDate(v.signed_at)}</p>
            <h3>اللقاحات الموثقة</h3>
            {v.addenda.length > 0 && (
              <aside className="care-warning">
                <h3>إضافات وتصحيحات موقعة لهذه الزيارة</h3>
                {v.addenda.map((a) => (
                  <p key={a.id}>
                    {careDate(a.signed_at)} · {a.note}
                  </p>
                ))}
              </aside>
            )}
            {v.vaccines.length ? (
              v.vaccines.map((x, i) => (
                <p key={i}>
                  {x.name} · {x.administeredOn} · التشغيلة:{' '}
                  {x.batch || 'غير مسجلة'}
                  {x.nextDueOn
                    ? ` · موعد لاحق حدده الطبيب: ${x.nextDueOn}`
                    : ''}
                </p>
              ))
            ) : (
              <p>لا لقاحات في هذه الزيارة.</p>
            )}
            <h3>الوصفات الصادرة من الطبيب</h3>
            {v.prescriptions.length ? (
              v.prescriptions.map((x, i) => (
                <p key={i}>
                  {x.medicine} · {x.instructions} · {x.duration}
                </p>
              ))
            ) : (
              <p>لا وصفات في هذه الزيارة.</p>
            )}
          </section>
        ))}
      </article>
    </IdentityShell>
  );
}
