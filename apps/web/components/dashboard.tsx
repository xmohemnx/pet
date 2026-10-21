'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  Heart,
  LayoutDashboard,
  PawPrint,
  Search,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  CarFront,
  X,
  ArrowLeft,
  Clock3,
  Sparkles,
} from 'lucide-react';
import {
  formatIqd,
  type CustomerDemo,
  type FinanceDemo,
} from '@petra/contracts';
import { Brand } from './brand';
const spaces = [
  { id: 'customer', name: 'العميل', icon: Heart },
  { id: 'doctor', name: 'الطبيب', icon: Stethoscope },
  { id: 'clinic', name: 'العيادة', icon: ShoppingBag },
  { id: 'driver', name: 'السائق', icon: CarFront },
  { id: 'admin', name: 'الإدارة', icon: ShieldCheck },
];
function DemoShell({
  workspace,
  children,
}: {
  workspace: string;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">استكشف مساحات Petra</div>
        <nav aria-label="مساحات العمل التجريبية">
          {spaces.map((s) => (
            <Link
              href={
                s.id === 'clinic' ? '/demo/clinic/finance' : `/demo/${s.id}`
              }
              key={s.id}
              className={s.id === workspace ? 'active' : ''}
            >
              <s.icon size={21} />
              {s.name}
              {s.id === workspace && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <PawPrint size={32} />
          <h3>رعاية تبدأ من القلب.</h3>
          <p>نبني مساحة أجمل لك ولرفيقك.</p>
          <Link href="/">
            العودة للرئيسية <ArrowLeft size={16} />
          </Link>
        </div>
        <small className="sidebar-version" dir="ltr">
          PETRA / DESIGN EXPLORATION 01
        </small>
      </aside>
      <div className="dashboard-content">
        <div className="demo-banner">
          <span>
            <Sparkles size={16} />
            عرض تصميم فقط · الأسماء والمبالغ أمثلة وهمية، ولا تُنفّذ حجوزات أو
            مدفوعات.
          </span>
          <button
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            className="workspace-toggle"
          >
            المساحات <ChevronDown size={16} />
          </button>
        </div>
        {menu && (
          <nav className="mobile-spaces" aria-label="اختيار مساحة العمل">
            {spaces.map((s) => (
              <Link
                key={s.id}
                href={
                  s.id === 'clinic' ? '/demo/clinic/finance' : `/demo/${s.id}`
                }
              >
                {s.name}
              </Link>
            ))}
          </nav>
        )}
        <header className="dashboard-header">
          <div>
            <span className="header-caption">
              مساحة {spaces.find((s) => s.id === workspace)?.name}
            </span>
            <span className="header-breadcrumb">
              {' '}
              / {workspace === 'clinic' ? 'المالية والمحاسبة' : 'نظرة عامة'}
            </span>
          </div>
          <Link href="/" className="home-mini">
            <PawPrint size={20} />
            <span>Petra</span>
          </Link>
        </header>
        <main id="main" className="dashboard-main">
          {children}
        </main>
        <footer className="dashboard-footer">
          Petra · نموذج المرحلة التأسيسية <span>حبّ أكثر. رعاية أقرب.</span>
        </footer>
      </div>
    </div>
  );
}
export function CustomerDashboard({ data }: { data: CustomerDemo }) {
  const [petId, setPetId] = useState(data.pets[0]!.id);
  const [tab, setTab] = useState('overview');
  const pet = data.pets.find((p) => p.id === petId)!;
  const appointments = data.appointments.filter((a) => a.petId === petId);
  return (
    <DemoShell workspace="customer">
      <div className="page-title">
        <div>
          <span className="eyebrow">يوم جديد، وحبّ يتجدد</span>
          <h1>
            أهلًا بك في عالمهم <span className="wave">✦</span>
          </h1>
          <p>كل ما يخص رفيقك، أقرب إليك.</p>
        </div>
        <span className="date-chip">
          <CalendarDays size={17} /> نموذج رعاية توضيحي
        </span>
      </div>
      <div className="customer-columns">
        <div className="customer-primary">
          <section className={`pet-hero ${pet.color}`}>
            <div className="pet-hero-copy">
              <span className="pet-label">
                <PawPrint size={15} /> رفيقك الصغير
              </span>
              <h2>
                مع {pet.name}،<br />
                كل يوم حكاية.
              </h2>
              <p>{pet.description}</p>
              <span className="pet-species">
                {pet.species} · بيانات تجريبية
              </span>
            </div>
            <div className="pet-hero-image">
              <Image
                src="/pet-garden.svg"
                alt="رسم توضيحي لحيوانات Petra"
                width={280}
                height={288}
              />
            </div>
            <div className="pet-switcher" aria-label="اختر الحيوان">
              {data.pets.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={pet.id === p.id}
                  onClick={() => setPetId(p.id)}
                >
                  <PawPrint size={16} />
                  {p.name}
                  {pet.id === p.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>
          <div className="care-tabs" role="tablist" aria-label="أقسام الرعاية">
            {[
              ['overview', 'نظرة عامة'],
              ['appointments', 'المواعيد'],
              ['record', 'الملف الصحي'],
            ].map(([id, label]) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id!)}
              >
                {label}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="care-panel"
            tabIndex={0}
          >
            {tab === 'record' ? (
              <div className="empty-state">
                <ShieldCheck size={38} />
                <h3>خصوصيتهم، من أول خطوة.</h3>
                <p>
                  هذه مساحة لتصميم الملف الصحي. لا توجد سجلات طبية حقيقية في هذا
                  النموذج، وستُضاف المشاركة والصلاحيات في مرحلة الرعاية.
                </p>
              </div>
            ) : (
              <>
                <div className="panel-heading">
                  <h2>
                    {tab === 'appointments'
                      ? 'مواعيد الرعاية'
                      : 'قريبًا في رحلة الرعاية'}
                  </h2>
                  <span className="small-chip">أمثلة توضيحية</span>
                </div>
                {appointments.map((a) => (
                  <article className="appointment" key={a.id}>
                    <span className="appointment-icon">
                      <Stethoscope size={24} />
                    </span>
                    <div>
                      <h3>
                        {a.title} · {pet.name}
                      </h3>
                      <p>{a.clinic}</p>
                      <span>
                        <CalendarDays size={14} />
                        <time dateTime={a.date}>
                          {new Intl.DateTimeFormat('ar-IQ', {
                            month: 'long',
                            day: 'numeric',
                            timeZone: 'Asia/Baghdad',
                          }).format(new Date(`${a.date}T12:00:00Z`))}
                        </time>
                        <Clock3 size={14} />
                        {a.time}
                      </span>
                    </div>
                    <span className="status planned">مثال</span>
                  </article>
                ))}
                <p className="subtle-note">
                  لا يُعد هذا موعدًا محجوزًا؛ الحجوزات الحقيقية ستتوفر بعد
                  استكمال الحسابات والرعاية.
                </p>
              </>
            )}
          </section>
          <section className="care-callout">
            <span className="callout-icon">
              <Heart size={28} />
            </span>
            <div>
              <h3>صحة أفضل تبدأ بمعرفة أكثر.</h3>
              <p>للتشخيص والعلاج، استشر طبيبًا بيطريًا مرخّصًا.</p>
            </div>
          </section>
        </div>
        <aside className="customer-secondary">
          <section className="panel">
            <div className="panel-heading">
              <h2>رفقاؤك</h2>
              <PawPrint size={19} />
            </div>
            {data.pets.map((p, i) => (
              <button
                className="pet-row"
                key={p.id}
                aria-pressed={pet.id === p.id}
                onClick={() => setPetId(p.id)}
              >
                <span className={`pet-initial ${p.color}`}>{p.name[0]}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.species}</small>
                </span>
                <span
                  className={`pet-select-dot ${pet.id === p.id ? 'selected' : ''}`}
                >
                  {pet.id === p.id ? <Check size={13} /> : i + 1}
                </span>
              </button>
            ))}
          </section>
          <section className="tip-card">
            <span className="tip-icon">✳</span>
            <span className="eyebrow">اهتمام يصنع فرقًا</span>
            <h3>
              هم لا يتحدثون،
              <br />
              لكننا نستطيع
              <br />
              أن نفهمهم أكثر.
            </h3>
            <p>
              مساحة هادئة، وقت للعب، وقرب منك. أحيانًا، أجمل الرعاية هي أبسطها.
            </p>
            <span className="tip-foot">
              لأنهم جزء من العائلة <Heart size={15} />
            </span>
          </section>
          <div className="roadmap-note">
            <CircleHelp size={21} />
            <p>
              هذا نموذج للتصميم والتفاعل. الحفظ والحسابات الحقيقية ضمن المراحل
              التالية.
            </p>
          </div>
        </aside>
      </div>
    </DemoShell>
  );
}
const statusText = {
  paid: 'مدفوعة',
  pending: 'بانتظار الدفع',
  refunded: 'مستردة',
};
export function ClinicFinance({ data }: { data: FinanceDemo }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<
    FinanceDemo['invoices'][number] | null
  >(null);
  const invoices = data.invoices.filter(
    (i) =>
      (status === 'all' || i.status === status) &&
      `${i.id} ${i.customer} ${i.description}`.includes(search),
  );
  const paid = data.invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + BigInt(i.amountMinor), 0n);
  const pending = data.invoices
    .filter((i) => i.status === 'pending')
    .reduce((s, i) => s + BigInt(i.amountMinor), 0n);
  function download() {
    const csv =
      '\uFEFFرقم الفاتورة,العميل,الخدمة,المبلغ بالوحدات الصغرى IQD,الحالة\n' +
      invoices
        .map((i) =>
          [
            i.id,
            i.customer,
            i.description,
            i.amountMinor,
            statusText[i.status],
          ].join(','),
        )
        .join('\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'petra-design-demo-invoices.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <DemoShell workspace="clinic">
      <div className="page-title">
        <div>
          <span className="eyebrow">عيادة الأصدقاء · منشأة توضيحية</span>
          <h1>صورة أوضح، لكل التفاصيل.</h1>
          <p>مساحة المالية داخل لوحة العيادة.</p>
        </div>
        <button className="button outline small" onClick={download}>
          <Download size={17} />
          تصدير النتائج التجريبية
        </button>
      </div>
      <div className="finance-notice">
        <ShieldCheck size={23} />
        <div>
          <strong>هذه معاينة تصميم وليست نظامًا محاسبيًا.</strong>
          <p>
            الأرقام مشتقة من فواتير وهمية فقط؛ لا تمثل إيرادًا معترفًا به أو
            رصيد دفتر أستاذ، ولا تتوفر إجراءات ترحيل أو صرف.
          </p>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card green">
          <span>فواتير مدفوعة · مثال</span>
          <strong>
            <bdi>{formatIqd(paid.toString())}</bdi>
          </strong>
          <small>مجموع الفواتير التجريبية المدفوعة</small>
          <FileText size={24} />
        </div>
        <div className="stat-card">
          <span>فواتير معلّقة · مثال</span>
          <strong>
            <bdi>{formatIqd(pending.toString())}</bdi>
          </strong>
          <small>لا يعني تحصيلًا أو تسوية</small>
          <Clock3 size={24} />
        </div>
        <div className="stat-card">
          <span>عدد الفواتير · مثال</span>
          <strong>
            {new Intl.NumberFormat('ar-IQ').format(data.invoices.length)}{' '}
            <span>فواتير</span>
          </strong>
          <small>لشرح التصميم والتصفية فقط</small>
          <LayoutDashboard size={24} />
        </div>
      </div>
      <section className="panel invoice-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">سجل العرض</span>
            <h2>الفواتير التجريبية</h2>
          </div>
          <span className="small-chip">IQD · بيانات وهمية</span>
        </div>
        <div className="table-filters">
          <label className="search-field">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالعميل أو رقم الفاتورة"
              aria-label="ابحث في الفواتير"
            />
          </label>
          <label className="status-filter">
            <span>الحالة</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="حالة الفاتورة"
            >
              <option value="all">كل الحالات</option>
              {Object.entries(statusText).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="جدول الفواتير القابل للتمرير"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>العميل والخدمة</th>
                <th>التاريخ</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>
                  <span className="sr-only">تفاصيل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <bdi className="invoice-id">{i.id}</bdi>
                  </td>
                  <td>
                    <strong>{i.customer}</strong>
                    <small>{i.description}</small>
                  </td>
                  <td>
                    <time dateTime={i.issuedAt}>
                      <bdi>{i.issuedAt}</bdi>
                    </time>
                  </td>
                  <td>
                    <bdi className="money">{formatIqd(i.amountMinor)}</bdi>
                  </td>
                  <td>
                    <span className={`status ${i.status}`}>
                      {statusText[i.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      onClick={() => setSelected(i)}
                      aria-label={`تفاصيل ${i.id}`}
                    >
                      <ArrowUpLeft size={19} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!invoices.length && (
          <div className="empty-state" role="status">
            <Search size={28} />
            <h3>لا توجد نتائج مطابقة</h3>
            <p>جرّب اسمًا آخر أو غيّر حالة الفاتورة.</p>
          </div>
        )}
        <div className="table-summary" aria-live="polite">
          عرض {new Intl.NumberFormat('ar-IQ').format(invoices.length)} من{' '}
          {new Intl.NumberFormat('ar-IQ').format(data.invoices.length)} فواتير
          تجريبية
        </div>
      </section>
      <section className="finance-next">
        <span className="note-icon">
          <ShoppingBag size={25} />
        </span>
        <div>
          <h3>التجارة والمالية، في مساحة واحدة.</h3>
          <p>
            سيُدار متجر العيادة ومخزونها ومحاسبتها هنا بصلاحيات موظفيها، ضمن
            المراحل القادمة.
          </p>
        </div>
      </section>
      {selected && (
        <InvoiceDialog invoice={selected} close={() => setSelected(null)} />
      )}
    </DemoShell>
  );
}
function InvoiceDialog({
  invoice,
  close,
}: {
  invoice: FinanceDemo['invoices'][number];
  close: () => void;
}) {
  return (
    <dialog
      open
      className="invoice-dialog"
      ref={(el) => {
        if (el && !el.hasAttribute('data-modal')) {
          el.close();
          el.showModal();
          el.setAttribute('data-modal', 'true');
        }
      }}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="invoice-title"
    >
      <div className="dialog-top">
        <span className="small-chip">مثال تصميم غير صالح للدفع</span>
        <button
          autoFocus
          className="icon-button"
          onClick={close}
          aria-label="إغلاق تفاصيل الفاتورة"
        >
          <X size={22} />
        </button>
      </div>
      <span className="dialog-icon">
        <FileText size={28} />
      </span>
      <h2 id="invoice-title">تفاصيل الفاتورة التجريبية</h2>
      <bdi className="invoice-id">{invoice.id}</bdi>
      <dl>
        <div>
          <dt>العميل</dt>
          <dd>{invoice.customer}</dd>
        </div>
        <div>
          <dt>الخدمة</dt>
          <dd>{invoice.description}</dd>
        </div>
        <div>
          <dt>المبلغ التوضيحي</dt>
          <dd>
            <bdi>{formatIqd(invoice.amountMinor)}</bdi>
          </dd>
        </div>
        <div>
          <dt>الحالة التوضيحية</dt>
          <dd>{statusText[invoice.status]}</dd>
        </div>
      </dl>
      <p className="subtle-note">
        لا يوجد قيد محاسبي أو عملية دفع مرتبطة بهذا المثال.
      </p>
      <button onClick={close} className="button primary">
        العودة للفواتير
      </button>
    </dialog>
  );
}
export function PlannedWorkspace({ workspace }: { workspace: string }) {
  const title = spaces.find((s) => s.id === workspace)?.name;
  return (
    <DemoShell workspace={workspace}>
      <div className="page-title">
        <div>
          <span className="eyebrow">ملامح المساحة القادمة</span>
          <h1>مساحة {title}</h1>
        </div>
      </div>
      <section className="panel planned-workspace">
        <PawPrint size={48} />
        <h2>هنا تبدأ رحلة {title}.</h2>
        <p>
          لم يبدأ تنفيذ وظائف هذه المساحة بعد. النموذج الحالي يركز على تجربة
          العميل ومالية العيادة، والخطوة التالية هي الحسابات والصلاحيات
          الحقيقية.
        </p>
        <Link href="/demo/customer" className="button primary">
          استكشف نموذج العميل <ArrowUpLeft size={18} />
        </Link>
      </section>
    </DemoShell>
  );
}
