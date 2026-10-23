import Link from 'next/link';
import {
  Store,
  Warehouse,
  Boxes,
  PackageCheck,
  ShoppingBag,
  ArrowUpLeft,
  Layers3,
  ClipboardList,
} from 'lucide-react';
import type {
  IdentityMe,
  ClinicInfo,
  InventoryData,
  CommerceData,
} from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { WorkspaceHeading } from './workspace-overview';
import type { Category } from './catalog-taxonomy';
export function ClinicStore({
  me,
  clinic,
  inventory,
  commerce,
  categories,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  inventory: InventoryData;
  commerce: CommerceData;
  categories: Category[];
}) {
  const base = `/clinic/${clinic.id}`;
  const sections = [
    ['الأقسام', categories.length, Layers3],
    ['المنتجات', commerce.products.length, Boxes],
    ['المخازن', inventory.warehouses.length, Warehouse],
    ['الطلبات', commerce.orders.length, ShoppingBag],
  ] as const;
  const links = [
    [
      'catalog',
      'الأقسام وترتيب العرض',
      'إضافة القسم، تغيير اسمه وترتيبه، إخفاؤه أو حذف القسم الفارغ.',
      Layers3,
    ],
    [
      'commerce',
      'المنتجات والطلبات',
      'إدارة المنتجات والأسعار ونشرها ومتابعة طلبات العملاء.',
      Boxes,
    ],
    [
      'inventory',
      'المخازن والدفعات',
      'إنشاء مخزن، استلام دفعة، متابعة الصلاحية ونقل الكميات.',
      Warehouse,
    ],
    [
      'storefront',
      'واجهة العيادة',
      'تعريف متجرك وإعداد واجهته المنشورة للعميل.',
      Store,
    ],
  ] as const;
  return (
    <IdentityShell me={me}>
      <div className="role-desk clinic-store">
        <WorkspaceHeading
          title={`إدارة متجر ${clinic.name}`}
          description="الأقسام والمنتجات والمخازن في نطاق عيادتك. يعرض العميل المنتجات المنشورة وحالة توفرها."
          action={
            <Link
              className="button outline"
              href={`/marketplace/stores/${clinic.id}`}
            >
              <Store size={18} aria-hidden="true" />
              عرض واجهة العميل
            </Link>
          }
        />
        <dl className="store-summary">
          {sections.map(([label, value, Icon]) => (
            <div key={label}>
              <dt>
                <Icon size={22} aria-hidden="true" />
                {label}
              </dt>
              <dd>{new Intl.NumberFormat('ar-IQ').format(value)}</dd>
            </div>
          ))}
        </dl>
        <div className="store-management-layout">
          <section className="store-management-tools">
            <h2>إدارة المتجر</h2>
            {links.map(([path, title, description, Icon]) => (
              <Link href={`${base}/${path}`} key={path}>
                <Icon size={26} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <ArrowUpLeft size={19} aria-hidden="true" />
              </Link>
            ))}
          </section>
          <aside className="desk-panel">
            <div className="dashboard-section-title">
              <Warehouse size={24} aria-hidden="true" />
              <h2>المخازن المسجلة</h2>
            </div>
            {inventory.warehouses.length ? (
              inventory.warehouses.map((w) => (
                <div className="store-warehouse" key={w.id}>
                  <Warehouse size={20} aria-hidden="true" />
                  <strong>{w.name}</strong>
                  <span>{w.is_primary ? 'المخزن الرئيسي' : 'مخزن فرعي'}</span>
                </div>
              ))
            ) : (
              <p>لا مخازن بعد. أنشئ المخزن قبل استلام المنتجات.</p>
            )}
            <Link className="button primary" href={`${base}/inventory`}>
              <PackageCheck size={19} aria-hidden="true" />
              إدارة المخزون
            </Link>
            <p className="store-policy">
              <ClipboardList size={19} aria-hidden="true" />
              المتاح للبيع يستبعد المنتهي والمحجور والمحجوز. حذف القسم لا يحذف
              المنتج أو حركة المخزون.
            </p>
          </aside>
        </div>
      </div>
    </IdentityShell>
  );
}
