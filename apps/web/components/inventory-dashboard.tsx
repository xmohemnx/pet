'use client';
import Link from 'next/link';
import { useState, useRef } from 'react';
import type { IdentityMe, ClinicInfo, InventoryData } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import { PlatformHeading, SandboxNotice, Empty } from './platform-shared';
export function InventoryDashboard({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: InventoryData;
}) {
  const [data, setData] = useState(initial),
    [purchaseList, setPurchases] = useState(initial.purchases);
  const base = `clinics/${clinic.id}`;
  const pending = useRef(
    new Map<string, { fingerprint: string; key: string }>(),
  );
  async function refresh() {
    const next = await api<InventoryData>(`${base}/inventory`);
    setData(next);
    setPurchases(next.purchases);
  }
  async function send(path: string, body: unknown) {
    let payload = body;
    if (body && typeof body === 'object' && 'idempotencyKey' in body) {
      const content = { ...body } as Record<string, unknown>;
      delete content.idempotencyKey;
      const fingerprint = JSON.stringify(content),
        old = pending.current.get(path);
      const key =
        old?.fingerprint === fingerprint ? old.key : crypto.randomUUID();
      pending.current.set(path, { fingerprint, key });
      payload = { ...content, idempotencyKey: key };
    }
    await api(`${base}/${path}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await refresh();
    pending.current.delete(path);
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="المستودعات والدفعات">
        المتاح للبيع يستبعد المحجور والمنتهي والحجوزات. التاريخ شامل نهاية يوم
        بغداد.
      </PlatformHeading>
      <SandboxNotice />
      <div className="inline-actions">
        <Link className="button outline" href={`/clinic/${clinic.id}/commerce`}>
          التجارة والمشتريات
        </Link>
        <Link className="button outline" href={`/clinic/${clinic.id}/finance`}>
          الدفتر المالي
        </Link>
      </div>
      <section className="panel care-section">
        <h2>رصيد المنتجات</h2>
        <div
          className="data-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="جدول رصيد المخزون القابل للتمرير"
        >
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>فعلي</th>
                <th>غير صالح للبيع</th>
                <th>محجوز</th>
                <th>متاح</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  <td>{p.on_hand}</td>
                  <td>{p.on_hand - p.eligible}</td>
                  <td>{p.reserved}</td>
                  <td>{p.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>دفعات المخزون</h2>
            {data.layers.map((l) => (
              <article key={l.id} className="care-list-row">
                <div>
                  <h3>
                    {l.product_name} · {l.batch_code || 'بلا رمز دفعة'}
                  </h3>
                  <p>
                    {l.warehouse_name} · المتبقي {l.remaining} · كلفة الوحدة{' '}
                    {formatIqd(l.unit_cost)}
                  </p>
                  <p>
                    {l.expires_on
                      ? `صالح حتى ${l.expires_on.slice(0, 10)}`
                      : 'دون تاريخ صلاحية'}{' '}
                    ·{' '}
                    {l.expired
                      ? 'منتهي'
                      : l.quarantined
                        ? 'محجور'
                        : 'غير محجور'}
                  </p>
                  <details>
                    <summary>حجر أو نقل أو طلب إتلاف</summary>
                    <CareForm
                      label={l.quarantined ? 'فك الحجر' : 'حجر الدفعة'}
                      submit={(f) =>
                        send(`inventory/${l.id}/quarantine`, {
                          quarantined: !l.quarantined,
                          reason: f.get('reason'),
                        })
                      }
                    >
                      <label>
                        سبب الحجر أو فكه
                        <textarea
                          name="reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </CareForm>
                    <CareForm
                      label="نقل كمية للمستودع"
                      submit={(f) =>
                        send('inventory/transfers', {
                          idempotencyKey: crypto.randomUUID(),
                          layerId: l.id,
                          warehouseId: f.get('warehouse'),
                          quantity: Number(f.get('quantity')),
                        })
                      }
                    >
                      <label>
                        المستودع الوجهة
                        <select name="warehouse" required>
                          {data.warehouses
                            .filter((w) => w.id !== l.warehouse_id)
                            .map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        كمية النقل
                        <input
                          name="quantity"
                          type="number"
                          min={1}
                          max={l.remaining}
                          required
                        />
                      </label>
                    </CareForm>
                    <CareForm
                      label="طلب إتلاف باعتماد مستقل"
                      submit={(f) =>
                        send('inventory/writeoffs', {
                          idempotencyKey: crypto.randomUUID(),
                          layerId: l.id,
                          quantity: Number(f.get('quantity')),
                          reason: f.get('reason'),
                        })
                      }
                    >
                      <label>
                        كمية الإتلاف
                        <input
                          name="quantity"
                          type="number"
                          min={1}
                          max={l.remaining}
                          required
                        />
                      </label>
                      <label>
                        سبب الإتلاف
                        <textarea
                          name="reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </CareForm>
                  </details>
                </div>
              </article>
            ))}
            {!data.layers.length && (
              <Empty>لا دفعات ذات رصيد. استلم أمر شراء لإضافتها.</Empty>
            )}
          </section>
          <section className="panel care-section">
            <h2>طلبات الإتلاف</h2>
            {data.requests.map((r) => (
              <article key={r.id} className="care-list-row">
                <div>
                  <h3>
                    {r.product_name} × {r.quantity}
                  </h3>
                  <p>
                    {r.reason} · {r.status}
                  </p>
                  {r.status === 'pending' &&
                    (r.created_by === me.user.id ? (
                      <p>بانتظار اعتماد شخص آخر.</p>
                    ) : (
                      <div className="inline-actions">
                        <CareAction
                          action={() =>
                            send(`inventory/writeoffs/${r.id}/decision`, {
                              decision: 'approved',
                            })
                          }
                        >
                          اعتماد الإتلاف
                        </CareAction>
                        <CareAction
                          action={() =>
                            send(`inventory/writeoffs/${r.id}/decision`, {
                              decision: 'rejected',
                            })
                          }
                        >
                          رفض الإتلاف
                        </CareAction>
                      </div>
                    ))}
                </div>
              </article>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>المستودعات</h2>
            {data.warehouses.map((w) => (
              <p key={w.id}>
                {w.name}
                {w.is_primary ? ' · الرئيسي' : ''}
              </p>
            ))}
            <CareForm
              label="إضافة مستودع"
              submit={(f) =>
                send('warehouses', {
                  name: f.get('name'),
                  ...(f.get('branch') ? { branchId: f.get('branch') } : {}),
                })
              }
            >
              <label>
                اسم المستودع
                <input name="name" required maxLength={100} />
              </label>
              <label>
                الفرع
                <select name="branch">
                  <option value="">مستودع عام للعيادة</option>
                  {clinic.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>استلام جزئي وتوثيق دفعة</h2>
            <CareForm
              label="تأكيد الاستلام الجزئي"
              submit={(f) =>
                send(`purchases/${f.get('purchase')}/receipts`, {
                  idempotencyKey: crypto.randomUUID(),
                  quantity: Number(f.get('quantity')),
                  warehouseId: f.get('warehouse'),
                  batchCode: f.get('batch'),
                  expiresOn: f.get('expiry') || null,
                })
              }
            >
              <label>
                أمر الشراء
                <select name="purchase" required>
                  {purchaseList
                    .filter((p) => p.status === 'ordered')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.product_name} · {p.vendor_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                المستودع
                <select name="warehouse" required>
                  {data.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                كمية الاستلام
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={10000}
                  required
                />
              </label>
              <label>
                رمز الدفعة
                <input name="batch" maxLength={100} />
              </label>
              <label>
                تاريخ الصلاحية (اختياري)
                <input name="expiry" type="date" />
              </label>
              <p>يمكن توثيق بضاعة منتهية، لكنها لا تصبح متاحة للبيع.</p>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>سندات الاستلام</h2>
            {data.receipts.map((r) => (
              <p key={r.id}>
                {r.product_name} × {r.quantity} · {careDate(r.created_at)}
              </p>
            ))}
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
