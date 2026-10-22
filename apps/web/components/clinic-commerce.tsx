'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { IdentityMe, ClinicInfo, CommerceData } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import { ProductCatalogEditor } from './product-catalog-editor';
import { ProductMatrixEditor } from './product-matrix-editor';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  Status,
  mutate,
} from './platform-shared';
export function ClinicCommerce({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: CommerceData;
}) {
  const [data, setData] = useState(initial);
  const base = `clinics/${clinic.id}`;
  async function refresh() {
    setData(await api<CommerceData>(`${base}/commerce`));
  }
  async function send(path: string, body: unknown = {}) {
    await mutate(`${base}/${path}`, body);
    await refresh();
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="تجارة العيادة ومخزونها">
        كتالوج ومشتريات وطلبات، داخل منشأتك وبصلاحيات فريقها.
      </PlatformHeading>
      <div className="inline-actions">
        <Link className="button outline" href={`/clinic/${clinic.id}/catalog`}>
          التصنيفات والوسوم
        </Link>
        <Link
          className="button outline"
          href={`/clinic/${clinic.id}/promotions`}
        >
          العروض وتسعير التجارة
        </Link>
        <Link
          className="button outline"
          href={`/clinic/${clinic.id}/inventory`}
        >
          المستودعات والدفعات
        </Link>
        <Link
          className="button outline"
          href={`/clinic/${clinic.id}/storefront`}
        >
          إعدادات المتجر
        </Link>
        <Link
          className="button outline"
          href={`/marketplace/stores/${clinic.id}`}
        >
          عرض المتجر
        </Link>
        <Link className="button outline" href={`/clinic/${clinic.id}`}>
          فريق العيادة
        </Link>
        <Link className="button outline" href={`/clinic/${clinic.id}/finance`}>
          المالية والمحاسبة
        </Link>
      </div>
      <SandboxNotice />
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>المنتجات والمخزون</h2>
            {data.products.map((p) => (
              <article className="care-list-row" key={p.id}>
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.sku} · {formatIqd(p.price_minor)}
                  </p>
                  <p>
                    بالمخزن {p.on_hand} · محجوز {p.reserved}
                  </p>
                  <details>
                    <summary>تعديل المنتج</summary>
                    <CareForm
                      submit={async (f) => {
                        await api(`${base}/products/${p.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            name: f.get('name'),
                            description: f.get('description'),
                            priceMinor: f.get('price'),
                            active: f.get('active') === 'on',
                            version: p.version,
                          }),
                        });
                        await refresh();
                      }}
                    >
                      <label>
                        اسم المنتج
                        <input name="name" defaultValue={p.name} required />
                      </label>
                      <label>
                        وصف المنتج
                        <textarea
                          name="description"
                          defaultValue={p.description}
                        />
                      </label>
                      <label>
                        سعر المنتج بوحدات IQD الصغرى
                        <input
                          name="price"
                          pattern="[0-9]+"
                          defaultValue={p.price_minor}
                          required
                        />
                      </label>
                      <label className="care-check">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={p.active}
                        />
                        المنتج منشور
                      </label>
                    </CareForm>
                  </details>
                  <ProductCatalogEditor
                    key={`${p.id}:${p.version}`}
                    product={p}
                    clinicId={clinic.id}
                    refresh={refresh}
                  />
                  <ProductMatrixEditor
                    key={`matrix:${p.id}:${p.version}`}
                    product={p}
                    clinicId={clinic.id}
                    hasVariants={data.products.some(
                      (v) => v.parent_product_id === p.id,
                    )}
                    refresh={refresh}
                  />
                </div>
              </article>
            ))}
            {!data.products.length && (
              <Empty>أضف المنتج ثم استلم المخزون من طلب شراء.</Empty>
            )}
          </section>
          <section className="panel care-section">
            <h2>الطلبات</h2>
            {data.orders.map((o) => (
              <div className="care-list-row" key={o.id}>
                <div>
                  <h3>#{o.id.slice(0, 8)}</h3>
                  <p>{formatIqd(o.total_minor)}</p>
                  <Status value={o.status} />
                  <p>{o.delivery_address}</p>
                  {['confirmed', 'packed', 'shipped', 'delivered'].includes(
                    o.status,
                  ) && (
                    <details>
                      <summary>بيانات الناقل والتتبع</summary>
                      <CareForm
                        label="حفظ التتبع"
                        submit={(f) =>
                          send(`orders/${o.id}/tracking`, {
                            carrier: f.get('carrier'),
                            trackingCode: f.get('tracking'),
                            version: o.shipment?.version ?? 0,
                          })
                        }
                      >
                        <label>
                          اسم الناقل
                          <input
                            name="carrier"
                            defaultValue={o.shipment?.carrier}
                            maxLength={100}
                            required
                          />
                        </label>
                        <label>
                          رمز التتبع
                          <input
                            name="tracking"
                            defaultValue={o.shipment?.tracking_code}
                            maxLength={100}
                            required
                          />
                        </label>
                        <p>تسجيل يدوي؛ لا اتصال بمزود شحن.</p>
                      </CareForm>
                    </details>
                  )}
                </div>
                {['confirmed', 'packed', 'shipped'].includes(o.status) && (
                  <CareAction
                    action={() =>
                      send(`orders/${o.id}/transition`, {
                        status: {
                          confirmed: 'packed',
                          packed: 'shipped',
                          shipped: 'delivered',
                        }[o.status],
                      })
                    }
                  >
                    {
                      {
                        confirmed: 'تأكيد التجهيز',
                        packed: 'تأكيد الشحن',
                        shipped: 'إثبات التسليم',
                      }[o.status]
                    }
                  </CareAction>
                )}
              </div>
            ))}
            {!data.orders.length && <Empty>لا طلبات للعيادة بعد.</Empty>}
          </section>
          <section className="panel care-section">
            <h2>طلبات الإرجاع</h2>
            {data.returns.map((r) => (
              <div key={r.id} className="care-list-row">
                <div>
                  <h3>
                    {r.product_name} × {r.quantity}
                  </h3>
                  <p>{r.reason}</p>
                  <Status value={r.status} />
                </div>
                {r.status === 'pending' && (
                  <CareForm
                    label="اعتماد المرتجع والرد الاختباري"
                    submit={(f) =>
                      send(`returns/${r.id}/approve`, {
                        restock: f.get('restock') === 'on',
                      })
                    }
                  >
                    <label className="care-check">
                      <input type="checkbox" name="restock" />
                      استلمت القطع وهي صالحة لإعادة المخزون
                    </label>
                  </CareForm>
                )}
              </div>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>إضافة منتج</h2>
            <CareForm
              label="حفظ المنتج"
              submit={(f) =>
                send('products', {
                  sku: f.get('sku'),
                  name: f.get('name'),
                  description: f.get('description'),
                  species: f.get('species'),
                  priceMinor: f.get('price'),
                  costMinor: f.get('cost'),
                  ...(f.get('parent')
                    ? {
                        parentProductId: f.get('parent'),
                        variantLabel: f.get('variant'),
                      }
                    : {}),
                })
              }
            >
              <label>
                SKU
                <input name="sku" required maxLength={100} />
              </label>
              <label>
                اسم المنتج الجديد
                <input name="name" required maxLength={100} />
              </label>
              <label>
                الوصف
                <textarea name="description" maxLength={3000} />
              </label>
              <label>
                ملاءمة النوع
                <select name="species">
                  <option value="all">كل الحيوانات</option>
                  <option value="cat">قطط</option>
                  <option value="dog">كلاب</option>
                  <option value="bird">طيور</option>
                </select>
              </label>
              <label>
                خيار لمنتج موجود (اختياري)
                <select name="parent">
                  <option value="">منتج مستقل</option>
                  {data.products
                    .filter((p) => !p.parent_product_id && !p.matrix_dimensions)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                اسم الخيار، مثل 2 كغ
                <input name="variant" maxLength={100} />
              </label>
              <label>
                السعر بوحدات IQD الصغرى
                <input
                  name="price"
                  inputMode="numeric"
                  pattern="[0-9]{1,12}"
                  required
                />
              </label>
              <label>
                تكلفة تقديرية بوحدات IQD الصغرى
                <input
                  name="cost"
                  inputMode="numeric"
                  pattern="[0-9]{1,12}"
                  required
                />
              </label>
              <p className="panel-intro">
                1000 وحدة صغرى = 1 د.ع. التكلفة الفعلية تأتي من طبقات الاستلام
                FIFO.
              </p>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>الموردون</h2>
            {data.vendors.map((v) => (
              <p key={v.id}>{v.name}</p>
            ))}
            <CareForm
              label="إضافة المورد"
              submit={(f) =>
                send('vendors', {
                  name: f.get('vendorName'),
                  contact: f.get('contact'),
                })
              }
            >
              <label>
                اسم المورد
                <input name="vendorName" required maxLength={100} />
              </label>
              <label>
                بيانات الاتصال الخاصة
                <input name="contact" maxLength={3000} />
              </label>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>طلب شراء واستلام</h2>
            <CareForm
              label="إنشاء طلب شراء"
              submit={(f) =>
                send('purchases', {
                  productId: f.get('product'),
                  vendorId: f.get('vendor'),
                  quantity: Number(f.get('quantity')),
                  unitCost: f.get('cost'),
                })
              }
            >
              <label>
                المنتج
                <select name="product" required>
                  {data.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                المورد
                <select name="vendor" required>
                  {data.vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                كمية الشراء
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  max="10000"
                  required
                />
              </label>
              <label>
                تكلفة الوحدة الفعلية بوحدات IQD الصغرى
                <input name="cost" pattern="[0-9]{1,12}" required />
              </label>
            </CareForm>
            {data.purchases.map((p) => (
              <div key={p.id} className="care-list-row">
                <div>
                  <h3>
                    {p.product_name} × {p.quantity}
                  </h3>
                  <p>
                    {p.vendor_name} · {formatIqd(p.unit_cost)}
                  </p>
                  <Status value={p.status} />
                </div>
                {p.status === 'ordered' && (
                  <CareAction action={() => send(`purchases/${p.id}/receive`)}>
                    تأكيد استلام البضاعة
                  </CareAction>
                )}
                {p.status === 'received' && (
                  <CareAction action={() => send(`purchases/${p.id}/bill`)}>
                    مطابقة فاتورة المورد
                  </CareAction>
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
