'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PawPrint, CalendarDays, ArrowUpLeft } from 'lucide-react';
import type { IdentityMe, Pet, AvailableSlot } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { PetForm } from './pet-form';
import { careDate, speciesLabels } from './care-shared';
export function CareHome({
  me,
  pets,
  slots,
}: {
  me: IdentityMe;
  pets: Pet[];
  slots: AvailableSlot[];
}) {
  const [adding, setAdding] = useState(false);
  return (
    <IdentityShell me={me}>
      <div className="care-heading">
        <div>
          <h1>مركز الرعاية</h1>
          <p>ملفات رفاقك، مواعيدهم، ومتابعتهم في مكان واحد.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
        >
          {adding ? 'إغلاق النموذج' : 'إضافة حيوان'}
        </button>
      </div>
      <div className="care-actions">
        <Link className="button outline" href="/care/library">
          مكتبة الرعاية المراجعة
        </Link>
        <Link className="button outline" href="/home-visits">
          الزيارات المنزلية
        </Link>
        <Link className="button outline" href="/care/directory">
          دليل الأطباء والحجز
        </Link>
        <Link className="button outline" href="/care/calendar">
          تقويم الرعاية
        </Link>
      </div>
      {adding && (
        <section className="panel care-section">
          <h2>رفيق جديد</h2>
          <PetForm
            onSaved={(id) => window.location.assign(`/care/pets/${id}`)}
          />
        </section>
      )}
      <div className="petra-care-overview">
        <section className="care-section">
          <h2>
            <PawPrint size={22} />
            حيواناتي
          </h2>
          {!pets.length ? (
            <div className="panel care-empty">
              <PawPrint size={36} />
              <h3>تبدأ الرعاية بملف صغير</h3>
              <p>أضف حيوانك لتحتفظ ببياناته وتحجز موعده الأول.</p>
            </div>
          ) : (
            <div className="pet-real-grid">
              {pets.map((p) => (
                <Link
                  key={p.id}
                  href={`/care/pets/${p.id}`}
                  className="panel pet-real-card"
                >
                  <span className="pet-real-avatar">
                    <PawPrint size={30} />
                  </span>
                  <h3>{p.name}</h3>
                  <p>
                    {speciesLabels[p.species]}
                    {p.breed ? ` · ${p.breed}` : ''}
                  </p>
                  <span className="small-chip">
                    {p.archived_at
                      ? 'مؤرشف'
                      : p.scopes.includes('owner')
                        ? 'أنت المالك'
                        : 'وصاية مشتركة'}
                  </span>
                  <ArrowUpLeft size={18} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="care-section">
          <h2>
            <CalendarDays size={22} />
            مواعيد متاحة لدى أطباء معتمدين
          </h2>
          <p className="panel-intro">
            الأوقات بتوقيت بغداد. افتح ملف الحيوان لاختيار الموعد وتأكيد الحجز.
          </p>
          {!slots.length ? (
            <div className="panel care-empty">
              <p>
                لا توجد أوقات منشورة حاليًا. تظهر هنا الأوقات التي ينشرها أطباء
                العيادات المعتمدة.
              </p>
            </div>
          ) : (
            <div className="care-slot-grid">
              {slots.slice(0, 8).map((s) => (
                <article key={s.id} className="panel care-slot">
                  <span className="small-chip">{s.service_name}</span>
                  <h3>{s.doctor_name}</h3>
                  <p>
                    {s.clinic_name} · {s.branch_name}
                  </p>
                  <strong>{careDate(s.starts_at)}</strong>
                  <Link
                    className="text-link"
                    href={pets[0] ? `/care/pets/${pets[0].id}` : '/care'}
                  >
                    {pets.length ? 'اختيار للحيوان' : 'أضف حيوانًا أولًا'}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </IdentityShell>
  );
}
