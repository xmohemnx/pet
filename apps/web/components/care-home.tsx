'use client';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { ArrowUpLeft, Plus, X } from 'lucide-react';
import type {
  IdentityMe,
  Pet,
  AvailableSlot,
  SiteBanner,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { DashboardSummary, CustomerBanners } from './dashboard-summary';
import { PetForm } from './pet-form';
import { careDate, speciesLabels } from './care-shared';
import {
  WorkspaceHeading,
  WorkspaceLink,
  WorkspaceEmpty,
} from './workspace-overview';
export function CareHome({
  me,
  pets,
  slots,
  banners = [],
}: {
  me: IdentityMe;
  pets: Pet[];
  slots: AvailableSlot[];
  banners?: SiteBanner[];
}) {
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (adding) {
      formRef.current?.scrollIntoView({ block: 'nearest' });
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, [adding]);
  const activePets = pets.filter((p) => !p.archived_at);
  return (
    <IdentityShell me={me}>
      <div className="role-desk customer-desk">
        <CustomerBanners banners={banners} />
        <WorkspaceHeading
          title="رعاية رفاقك"
          description={`أهلًا، ${me.user.name}. ملفات حيواناتك وخطوتك التالية في مكان واحد.`}
          action={
            <button
              className="button primary"
              onClick={() => setAdding(!adding)}
              aria-expanded={adding}
              aria-controls="new-companion"
            >
              {adding ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Plus size={18} aria-hidden="true" />
              )}
              {adding ? 'إغلاق النموذج' : 'إضافة حيوان'}
            </button>
          }
        />
        <DashboardSummary kind="customer" />
        <nav className="desk-tabs" aria-label="أقسام رعاية العميل">
          <a href="#companions">
            حيواناتي <span>{activePets.length}</span>
          </a>
          <Link href="/care/calendar">المواعيد والمتابعة</Link>
          <Link href="/care/directory">الأطباء والعيادات</Link>
        </nav>
        {adding && (
          <section
            ref={formRef}
            id="new-companion"
            className="panel care-section"
          >
            <h2>رفيق جديد</h2>
            <PetForm
              onSaved={(id) => window.location.assign(`/care/pets/${id}`)}
            />
          </section>
        )}
        <div className="desk-body">
          <div className="desk-main">
            <section className="desk-panel" id="companions">
              <div className="desk-section-heading">
                <div>
                  <h2>حيواناتي</h2>
                  <p>ملف مستقل لكل رفيق، وخصوصية تتحكم بها.</p>
                </div>
                <span className="desk-count">{activePets.length} نشط</span>
              </div>
              {!pets.length ? (
                <WorkspaceEmpty
                  title="لنبدأ بالتعرّف إلى رفيقك"
                  action={
                    <button
                      className="button primary"
                      onClick={() => setAdding(true)}
                    >
                      <Plus size={18} aria-hidden="true" />
                      إنشاء أول ملف
                    </button>
                  }
                >
                  أضف بياناته مرة واحدة للوصول إلى سجله وحجز رعايته ومتابعة
                  مواعيده.
                </WorkspaceEmpty>
              ) : (
                <div className="companion-list">
                  {pets.map((p) => (
                    <Link
                      key={p.id}
                      href={`/care/pets/${p.id}`}
                      className="companion-row"
                    >
                      <span className="companion-initial" aria-hidden="true">
                        {Array.from(p.name)[0]}
                      </span>
                      <div>
                        <h3>{p.name}</h3>
                        <p>
                          {speciesLabels[p.species]}
                          {p.breed ? ` · ${p.breed}` : ''}
                        </p>
                        <span>
                          {p.archived_at
                            ? 'ملف مؤرشف'
                            : p.scopes.includes('owner')
                              ? 'أنت المالك'
                              : 'وصاية مشتركة'}
                        </span>
                      </div>
                      <span className="companion-open">
                        فتح الملف <ArrowUpLeft size={17} aria-hidden="true" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section className="desk-panel">
              <div className="desk-section-heading">
                <div>
                  <h2>أوقات متاحة للرعاية</h2>
                  <p>أطباء العيادات المعتمدة · بتوقيت بغداد</p>
                </div>
                <Link className="text-link" href="/care/directory">
                  دليل الأطباء
                </Link>
              </div>
              {!slots.length ? (
                <WorkspaceEmpty title="لا أوقات منشورة حاليًا">
                  يمكنك استكشاف الأطباء والعيادات، أو العودة لاحقًا بعد نشر
                  أوقات جديدة.
                </WorkspaceEmpty>
              ) : (
                <div className="desk-slot-list">
                  {slots.slice(0, 4).map((s) => (
                    <article className="desk-slot" key={s.id}>
                      <time dateTime={s.starts_at}>
                        {careDate(s.starts_at)}
                      </time>
                      <div>
                        <h3>{s.doctor_name}</h3>
                        <p>
                          {s.service_name} · {s.clinic_name} · {s.branch_name}
                        </p>
                      </div>
                      {pets[0] ? (
                        <Link
                          className="text-link"
                          href={`/care/pets/${pets[0].id}`}
                        >
                          اختيار للحيوان
                        </Link>
                      ) : (
                        <button
                          className="button outline small"
                          onClick={() => setAdding(true)}
                        >
                          أضف حيوانًا أولًا
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
          <aside className="desk-aside">
            <section className="desk-panel">
              <h2>ماذا يحتاج رفيقك؟</h2>
              <nav aria-label="خدمات العميل">
                <WorkspaceLink href="/care/directory" title="موعد مع طبيب">
                  ابحث عن الطبيب والخدمة المناسبة.
                </WorkspaceLink>
                <WorkspaceLink href="/home-visits" title="طبيب إلى المنزل">
                  استكشف الزيارات المنزلية المتاحة.
                </WorkspaceLink>
                <WorkspaceLink href="/taxi" title="نقل الحيوانات">
                  خطّط للنقل وتابع طلب رحلتك.
                </WorkspaceLink>
                <WorkspaceLink href="/services" title="العناية والإقامة">
                  استكشف الخدمات والباقات.
                </WorkspaceLink>
              </nav>
            </section>
            <section className="desk-note">
              <h2>متابعة لا تضيع</h2>
              <p>
                راجع مواعيد حيواناتك ومهام الرعاية من التقويم، وامنح الطبيب
                موافقة الوصول من ملف الحيوان عند الحاجة.
              </p>
              <Link href="/care/calendar" className="text-link">
                افتح تقويم الرعاية <ArrowUpLeft size={16} aria-hidden="true" />
              </Link>
            </section>
            <Link className="desk-library" href="/care/library">
              <strong>مكتبة الرعاية</strong>
              <span>اقرأ المحتوى المراجع قبل اتخاذ قرارات الرعاية.</span>
              <ArrowUpLeft size={20} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>
    </IdentityShell>
  );
}
