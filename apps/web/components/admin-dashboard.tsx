'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  BadgeCheck,
  Megaphone,
  HeartHandshake,
  ShieldCheck,
  Wallet,
  Settings2,
  Car,
  FileCheck,
  ArrowUpLeft,
  ImagePlus,
  Trash2,
  Pencil,
  ClipboardCheck,
} from 'lucide-react';
import type {
  IdentityMe,
  AdminDashboardData,
  SiteBanner,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { WorkspaceHeading } from './workspace-overview';
import { CareForm, CareAction, localToUtc } from './care-shared';
import { api } from '../lib/auth-client';
import { outcomeNames, reviewNames } from './professional-portfolio';
function adminContext(me: IdentityMe) {
  return {
    ...me,
    activeWorkspace:
      me.workspaces.find((w) => w.persona === 'platform_admin') ??
      me.activeWorkspace,
  };
}
export function AdminDashboard({
  me,
  data,
}: {
  me: IdentityMe;
  data: AdminDashboardData;
}) {
  const stats = [
    ['الحسابات', data.counts.users, Users],
    ['عيادات معتمدة', data.counts.clinics, Building2],
    ['طلبات اعتماد', data.counts.applications, ShieldCheck],
    ['توثيق قيد المراجعة', data.counts.verifications, BadgeCheck],
    ['تقارير نتائج معلقة', data.counts.reports, ClipboardCheck],
    ['بنرات ظاهرة الآن', data.counts.banners, Megaphone],
  ] as const;
  const tools = [
    [
      '/admin/professionals',
      'الاعتماد المهني',
      'راجع الأطباء والعيادات والسائقين، واعتمد أو علّق الترخيص.',
      ShieldCheck,
    ],
    [
      '/admin/control#banners',
      'البنرات والإعلانات',
      'أنشئ وعدّل ورتّب وجدول محتوى أول صفحة للعميل.',
      Megaphone,
    ],
    [
      '/admin/control#identities',
      'توثيق هويات الحسابات',
      'راجع طلبات الهوية وأصدر قرارات موثقة مستقلة.',
      BadgeCheck,
    ],
    [
      '/admin/control#reports',
      'النتائج والأعمال الخيرية',
      'اعتمد ادعاءات النتائج أو اسحبها قبل احتسابها في الملفات.',
      HeartHandshake,
    ],
    [
      '/admin/control#users',
      'الحسابات وأنواعها',
      'اعرض الحسابات المسجلة وحالة توثيقها.',
      Users,
    ],
    [
      '/admin/account-types',
      'طلبات تغيير النوع',
      'مراجعة تغيير نوع الحساب وفق سجل وصلاحية مستقلة.',
      FileCheck,
    ],
    [
      '/admin/operations',
      'التشغيل والمحتوى',
      'المهام والإشعارات والمحتوى والتسويات التشغيلية.',
      Settings2,
    ],
    [
      '/admin/finance',
      'مالية المنصة',
      'الدفتر والمراجعات المالية مع التحقق وفصل الاعتماد.',
      Wallet,
    ],
    [
      '/admin/transport',
      'إدارة النقل والنزاعات',
      'مراجعة البلاغات والنزاعات بصلاحيات إدارة النقل.',
      Car,
    ],
  ] as const;
  return (
    <IdentityShell me={adminContext(me)}>
      <div className="role-desk admin-desk">
        <WorkspaceHeading
          title="لوحة إدارة Petra"
          description="إدارة الحسابات والمحتوى والاعتماد والتشغيل من مكان واحد، بصلاحيات الخادم وسجل القرارات."
          action={
            <Link className="button primary" href="/admin/control">
              <Megaphone size={18} aria-hidden="true" />
              إدارة محتوى الدخول
            </Link>
          }
        />
        <div className="admin-dashboard-summary">
          <LayoutDashboard size={25} aria-hidden="true" />
          <h2>حالة المنصة</h2>
          <dl>
            {stats.map(([label, value, Icon]) => (
              <div key={label}>
                <dt>
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </dt>
                <dd>{new Intl.NumberFormat('ar-IQ').format(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <section className="desk-panel admin-tools">
          <h2>أدوات المدير</h2>
          <nav aria-label="أقسام إدارة المنصة">
            {tools.map(([href, title, description, Icon]) => (
              <Link key={href} href={href}>
                <Icon size={25} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <ArrowUpLeft size={18} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </IdentityShell>
  );
}
export function AdminControl({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: AdminDashboardData;
}) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState<SiteBanner | null>(null),
    [asset, setAsset] = useState(''),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState('');
  async function refresh() {
    setData(await api<AdminDashboardData>('admin/dashboard'));
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      if (
        file.size > 5 * 1024 * 1024 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw new Error('اختر صورة PNG أو JPEG أو WebP حتى 5MB.');
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]!);
        reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
        reader.readAsDataURL(file);
      });
      const a = await api<{ id: string; status: string }>('media', {
        method: 'POST',
        body: JSON.stringify({ dataBase64: value }),
      });
      if (a.status !== 'ready')
        throw new Error('الصورة ليست جاهزة للنشر. أعد المحاولة بعد المعالجة.');
      setAsset(a.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'تعذر رفع الصورة');
    } finally {
      setUploading(false);
    }
  }
  const dateInput = (v: string | null) =>
    v ? new Date(Date.parse(v) + 10800000).toISOString().slice(0, 16) : '';
  const statusLabels: Record<string, string> = {
    pending: 'قيد المراجعة',
    verified: 'هوية موثقة',
    rejected: 'مرفوض',
    revoked: 'مسحوب',
  };
  return (
    <IdentityShell me={adminContext(me)}>
      <div className="role-desk admin-control">
        <WorkspaceHeading
          title="المحتوى والتوثيق والملفات المهنية"
          description="كل تغيير محفوظ على الخادم ومقيد بمراجعة الإدارة. لا تظهر مسودات البنرات أو النتائج المعلقة للعميل."
          action={
            <Link className="button outline" href="/admin">
              <LayoutDashboard size={18} aria-hidden="true" />
              لوحة المدير
            </Link>
          }
        />
        <nav className="desk-tabs" aria-label="أقسام تحكم المدير">
          <a href="#banners">البنرات</a>
          <a href="#identities">توثيق الهوية</a>
          <a href="#reports">النتائج المهنية</a>
          <a href="#users">الحسابات</a>
        </nav>
        <section className="desk-panel" id="banners">
          <div className="dashboard-section-title">
            <Megaphone size={24} aria-hidden="true" />
            <h2>البنرات الإعلانية</h2>
          </div>
          <div className="desk-body">
            <div>
              <h3>{editing ? 'تعديل البنر' : 'بنر جديد'}</h3>
              <label className="banner-upload">
                <ImagePlus size={24} aria-hidden="true" />
                صورة البنر
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
              {uploading && <p role="status">جارٍ رفع الصورة…</p>}
              {uploadError && <p role="alert">{uploadError}</p>}
              {asset && <p role="status">الصورة جاهزة للنشر.</p>}
              <CareForm
                key={editing ? editing.id + ':' + editing.version : 'new'}
                label={editing ? 'حفظ تعديلات البنر' : 'حفظ البنر'}
                submit={async (f) => {
                  if (uploading) throw new Error('انتظر اكتمال رفع الصورة');
                  const banner = {
                    title: String(f.get('title')),
                    body: String(f.get('body')),
                    assetId: asset || editing?.asset_id || null,
                    imageAlt: String(f.get('alt')),
                    href: String(f.get('href')),
                    position: Number(f.get('position')),
                    published: f.get('published') === 'on',
                    startsAt: f.get('start')
                      ? localToUtc(f.get('start'))
                      : null,
                    endsAt: f.get('end') ? localToUtc(f.get('end')) : null,
                    publicationConsent: f.get('consent') === 'on',
                  };
                  await api(
                    editing ? `admin/banners/${editing.id}` : 'admin/banners',
                    {
                      method: editing ? 'PATCH' : 'POST',
                      body: JSON.stringify(
                        editing ? { version: editing.version, banner } : banner,
                      ),
                    },
                  );
                  setEditing(null);
                  setAsset('');
                  await refresh();
                }}
              >
                <label>
                  عنوان البنر
                  <input
                    name="title"
                    minLength={2}
                    maxLength={100}
                    defaultValue={editing?.title}
                    required
                  />
                </label>
                <label>
                  وصف البنر
                  <textarea
                    name="body"
                    maxLength={500}
                    defaultValue={editing?.body}
                    rows={3}
                  />
                </label>
                <label>
                  وصف الصورة البديل
                  <input
                    name="alt"
                    maxLength={180}
                    defaultValue={editing?.image_alt}
                  />
                </label>
                <label>
                  رابط داخلي للزر
                  <input
                    name="href"
                    defaultValue={editing?.href ?? '/care/directory'}
                    dir="ltr"
                    required
                    maxLength={300}
                  />
                </label>
                <div className="form-row">
                  <label>
                    ترتيب البنر
                    <input
                      name="position"
                      type="number"
                      min={0}
                      max={999}
                      defaultValue={editing?.position ?? 0}
                      required
                    />
                  </label>
                  <label>
                    بداية العرض بتوقيت بغداد
                    <input
                      name="start"
                      type="datetime-local"
                      defaultValue={dateInput(editing?.starts_at ?? null)}
                    />
                  </label>
                  <label>
                    نهاية العرض بتوقيت بغداد
                    <input
                      name="end"
                      type="datetime-local"
                      defaultValue={dateInput(editing?.ends_at ?? null)}
                    />
                  </label>
                </div>
                <label className="care-check">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={editing?.published}
                  />
                  نشر البنر للعملاء
                </label>
                <label className="care-check">
                  <input type="checkbox" name="consent" required />
                  أملك حق نشر المحتوى والصورة وأؤكد أنها خالية من معلومات طبية
                  أو محادثات خاصة.
                </label>
              </CareForm>
              {editing && (
                <button
                  className="button outline"
                  onClick={() => {
                    setEditing(null);
                    setAsset('');
                  }}
                >
                  إلغاء التعديل
                </button>
              )}
            </div>
            <aside className="banner-management-list">
              <h3>البنرات المحفوظة</h3>
              {!data.banners.length && (
                <p>لا بنرات بعد. لن يظهر محتوى إعلاني افتراضي للعملاء.</p>
              )}
              {data.banners.map((b) => (
                <article key={b.id}>
                  <h4>{b.title}</h4>
                  <p>
                    {b.published ? 'منشور حسب الجدول' : 'مسودة'} · الترتيب
                    {b.position}
                  </p>
                  <div className="inline-actions">
                    <button
                      className="button outline small"
                      onClick={() => {
                        setEditing(b);
                        setAsset('');
                        document
                          .getElementById('banners')
                          ?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      تعديل البنر
                    </button>
                    <CareAction
                      variant="outline"
                      action={async () => {
                        if (!window.confirm('حذف البنر وإيقاف عرضه للعملاء؟'))
                          throw new Error('أُلغي الحذف؛ لم يتغير البنر.');
                        await api(`admin/banners/${b.id}`, {
                          method: 'DELETE',
                          body: JSON.stringify({ version: b.version }),
                        });
                        if (editing?.id === b.id) setEditing(null);
                        await refresh();
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      حذف البنر
                    </CareAction>
                  </div>
                </article>
              ))}
            </aside>
          </div>
        </section>
        <section className="desk-panel" id="identities">
          <div className="dashboard-section-title">
            <BadgeCheck size={24} aria-hidden="true" />
            <h2>توثيق هويات الحسابات</h2>
          </div>
          {!data.verifications.length && <p>لا طلبات توثيق هوية.</p>}
          {data.verifications.map((v) => (
            <article className="admin-review-row" key={v.id}>
              <h3>{v.applicant}</h3>
              <p>{v.reference}</p>
              <p>{statusLabels[v.status]}</p>
              {['pending', 'verified'].includes(v.status) && (
                <details
                  className="review-decision"
                  open={v.status === 'pending'}
                >
                  <summary>
                    {v.status === 'pending'
                      ? 'مراجعة طلب الهوية'
                      : 'سحب توثيق الهوية'}
                  </summary>
                  <CareForm
                    label="حفظ قرار توثيق الهوية"
                    submit={async (f) => {
                      await api(`admin/verifications/${v.id}/decision`, {
                        method: 'POST',
                        body: JSON.stringify({
                          decision: f.get('decision'),
                          reason: f.get('reason'),
                          version: v.version,
                        }),
                      });
                      await refresh();
                    }}
                  >
                    <label>
                      قرار توثيق الهوية
                      <select name="decision" aria-label="قرار توثيق الهوية">
                        {v.status === 'pending' ? (
                          <>
                            <option value="verified">توثيق الهوية</option>
                            <option value="rejected">رفض الطلب</option>
                          </>
                        ) : (
                          <option value="revoked">سحب التوثيق</option>
                        )}
                      </select>
                    </label>
                    <label>
                      سبب قرار توثيق الهوية
                      <textarea
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                  </CareForm>
                </details>
              )}
            </article>
          ))}
        </section>
        <section className="desk-panel" id="reports">
          <div className="dashboard-section-title">
            <HeartHandshake size={24} aria-hidden="true" />
            <h2>نتائج الإجراءات والأعمال الخيرية</h2>
          </div>
          {!data.reports.length && <p>لا تقارير نتائج بعد.</p>}
          {data.reports.map((r) => (
            <article className="admin-review-row" key={r.id}>
              <h3>{r.public_title}</h3>
              <p>
                {r.doctor_name} · {r.clinic_name}
              </p>
              <p>
                {outcomeNames[r.outcome]} ·{' '}
                {r.charitable ? 'عمل خيري' : 'إجراء مهني'} ·{' '}
                {reviewNames[r.status]}
              </p>
              <details>
                <summary>مرجع الإثبات الخاص بالمراجعة</summary>
                <p>{r.evidence_reference}</p>
              </details>
              {['pending', 'approved'].includes(r.status) && (
                <details
                  className="review-decision"
                  open={r.status === 'pending'}
                >
                  <summary>
                    {r.status === 'pending'
                      ? 'مراجعة النتيجة المهنية'
                      : 'سحب اعتماد النتيجة'}
                  </summary>
                  <CareForm
                    label="حفظ قرار النتيجة المهنية"
                    submit={async (f) => {
                      await api(`admin/portfolio-reports/${r.id}/decision`, {
                        method: 'POST',
                        body: JSON.stringify({
                          decision: f.get('decision'),
                          reason: f.get('reason'),
                          version: r.version,
                        }),
                      });
                      await refresh();
                    }}
                  >
                    <label>
                      قرار مراجعة النتيجة
                      <select name="decision" aria-label="قرار مراجعة النتيجة">
                        {r.status === 'pending' ? (
                          <>
                            <option value="approved">
                              اعتماد النتيجة للنشر
                            </option>
                            <option value="rejected">رفض التقرير</option>
                          </>
                        ) : (
                          <option value="revoked">سحب الاعتماد</option>
                        )}
                      </select>
                    </label>
                    <label>
                      سبب قرار النتيجة
                      <textarea
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                  </CareForm>
                </details>
              )}
            </article>
          ))}
        </section>
        <section className="desk-panel" id="users">
          <div className="dashboard-section-title">
            <Users size={24} aria-hidden="true" />
            <h2>الحسابات المسجلة</h2>
          </div>
          <p>
            أحدث 100 حساب. تغيير النوع والاعتماد المهني لهما مراجعات مستقلة.
          </p>
          <details className="admin-users-list">
            <summary>عرض أحدث {data.users.length} حساباً</summary>
            {data.users.map((u) => (
              <article key={u.id} className="admin-user-row">
                <div>
                  <h3>{u.name}</h3>
                  <p>
                    <bdi>{u.email}</bdi>
                  </p>
                </div>
                <span>
                  {
                    (
                      {
                        customer: 'عميل',
                        doctor: 'طبيب',
                        clinic: 'عيادة',
                        driver: 'سائق',
                      } as Record<string, string>
                    )[u.account_type]
                  }
                </span>
                {u.identity_verified && (
                  <span className="professional-badge">
                    <BadgeCheck size={18} aria-hidden="true" />
                    هوية موثقة
                  </span>
                )}
              </article>
            ))}
          </details>
        </section>
      </div>
    </IdentityShell>
  );
}
