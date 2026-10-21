'use client';
import Link from 'next/link';
import { BankReconciliation } from './bank-reconciliation';
import { useState } from 'react';
import type { IdentityMe, ClinicInfo, FinanceReport } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import {
  SandboxNotice,
  PlatformHeading,
  Status,
  Empty,
  mutate,
} from './platform-shared';
const positive = (v: bigint) => formatIqd((v < 0n ? -v : v).toString());
export function ClinicFinance({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: FinanceReport;
}) {
  const [data, setData] = useState(initial),
    [key, setKey] = useState('');
  const base = `clinics/${clinic.id}/finance`;
  async function refresh() {
    setData(await api<FinanceReport>(base));
  }
  async function send(path: string, body: unknown = {}) {
    await mutate(`${base}/${path}`, body);
    await refresh();
  }
  const debit = data.balances.reduce((s, a) => s + BigInt(a.debit), 0n),
    credit = data.balances.reduce((s, a) => s + BigInt(a.credit), 0n);
  function download() {
    const text = [
      'رمز الحساب,الحساب,مدين وحدة صغرى,دائن وحدة صغرى',
      ...data.balances.map((a) => `${a.code},${a.name},${a.debit},${a.credit}`),
    ].join('\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'petra-sandbox-trial-balance.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={clinic.name} title="المالية والمحاسبة">
        كل رقم قابل للتتبع إلى قيد مصدره. دفتر العيادة مستقل عن دفتر المنصة.
      </PlatformHeading>
      <Link className="text-link" href={`/clinic/${clinic.id}/commerce`}>
        ← تجارة العيادة
      </Link>
      <SandboxNotice />
      <Link
        className="button outline"
        href={`/clinic/${clinic.id}/finance/statements`}
      >
        التقارير المؤرخة وأعمار المستحقات
      </Link>
      <p className="panel-intro">
        اعتماد القيود والصرف يتطلب التحقق بخطوتين ودخولًا خلال آخر 30 دقيقة.{' '}
        <Link href="/security">إعدادات أمان الحساب</Link>
      </p>
      <div className="finance-real-stats">
        <article className="panel">
          <span>إجمالي المدين</span>
          <strong>{positive(debit)}</strong>
        </article>
        <article className="panel">
          <span>إجمالي الدائن</span>
          <strong>{positive(credit)}</strong>
        </article>
        <article className="panel">
          <span>فرق ميزان المراجعة</span>
          <strong>{positive(debit - credit)}</strong>
        </article>
      </div>
      <section className="panel care-section">
        <div className="care-heading">
          <h2>ميزان المراجعة</h2>
          <button className="button outline" onClick={download}>
            تصدير CSV
          </button>
        </div>
        <div className="data-table-wrap">
          <table>
            <caption className="sr-only">
              ميزان مراجعة العيادة بوحدات IQD
            </caption>
            <thead>
              <tr>
                <th>الحساب</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((a) => (
                <tr key={a.code}>
                  <th scope="row">
                    {a.code} · {a.name}
                  </th>
                  <td>{formatIqd(a.debit)}</td>
                  <td>{formatIqd(a.credit)}</td>
                  <td>
                    {positive(BigInt(a.debit) - BigInt(a.credit))}{' '}
                    {BigInt(a.debit) >= BigInt(a.credit) ? 'مدين' : 'دائن'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="care-columns">
        <div className="care-stack">
          <section className="panel care-section">
            <h2>القيود اليومية</h2>
            {data.journals.map((j) => (
              <details className="journal-row" key={j.id}>
                <summary>
                  {j.description} · <Status value={j.status} />
                </summary>
                <p className="panel-intro">
                  {j.effective_on.slice(0, 10)} · مرجع {j.source_key}
                </p>
                {j.lines.map((l, i) => (
                  <p key={i}>
                    {l.account} · مدين {formatIqd(l.debit)} · دائن{' '}
                    {formatIqd(l.credit)}
                  </p>
                ))}
                {j.status === 'posted' &&
                  j.source_key.startsWith('manual:') && (
                    <CareForm
                      label="طلب عكس القيد"
                      submit={(f) =>
                        send('approvals', {
                          kind: 'reversal',
                          sourceId: j.id,
                          reason: f.get('reason'),
                        })
                      }
                    >
                      <label>
                        سبب العكس
                        <textarea name="reason" minLength={10} required />
                      </label>
                    </CareForm>
                  )}
              </details>
            ))}
            {!data.journals.length && (
              <Empty>
                لا توجد قيود. تنشأ عند أحداث المخزون والتحصيل والتسليم أو اعتماد
                قيد يدوي.
              </Empty>
            )}
          </section>
          <section className="panel care-section">
            <h2>الموافقات وفصل المهام</h2>
            {data.approvals.map((a) => (
              <div className="care-list-row" key={a.id}>
                <div>
                  <h3>
                    {{
                      vendor_payment: 'صرف فاتورة مورد',
                      reversal: 'عكس قيد',
                      manual_post: 'اعتماد قيد يدوي',
                    }[a.kind] ?? a.kind}
                  </h3>
                  <p>{a.reason}</p>
                  <Status value={a.status} />
                </div>
                {a.status === 'pending' && a.created_by !== me.user.id && (
                  <CareAction action={() => send(`approvals/${a.id}/approve`)}>
                    اعتماد وتنفيذ اختباري
                  </CareAction>
                )}
                {a.status === 'pending' && a.created_by === me.user.id && (
                  <p>بانتظار حساب معتمد آخر.</p>
                )}
                {a.status === 'pending' && (
                  <CareAction action={() => send(`approvals/${a.id}/reject`)}>
                    رفض أو سحب طلب الموافقة
                  </CareAction>
                )}
              </div>
            ))}
          </section>
        </div>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>إعداد قيد يدوي</h2>
            <CareForm
              label="إرسال القيد للاعتماد"
              submit={async (f) => {
                const k = key || crypto.randomUUID();
                setKey(k);
                await send('journals', {
                  idempotencyKey: k,
                  description: f.get('description'),
                  date: f.get('date'),
                  lines: [
                    {
                      account: f.get('debitAccount'),
                      debit: f.get('amount'),
                      credit: '0',
                    },
                    {
                      account: f.get('creditAccount'),
                      debit: '0',
                      credit: f.get('amount'),
                    },
                  ],
                });
                setKey('');
              }}
            >
              <label>
                وصف القيد
                <input
                  name="description"
                  minLength={5}
                  maxLength={3000}
                  required
                />
              </label>
              <label>
                تاريخ القيد
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                حساب مدين
                <select name="debitAccount">
                  {data.balances.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                حساب دائن
                <select name="creditAccount">
                  {data.balances.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                المبلغ بوحدات IQD الصغرى
                <input name="amount" pattern="[1-9][0-9]{0,11}" required />
              </label>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>صرف فاتورة مورد</h2>
            <CareForm
              label="طلب موافقة الصرف"
              submit={(f) =>
                send('approvals', {
                  kind: 'vendor_payment',
                  sourceId: f.get('sourceId'),
                  reason: f.get('reason'),
                  ...(f.get('paymentAmount')
                    ? { amountMinor: f.get('paymentAmount') }
                    : {}),
                })
              }
            >
              <label>
                فاتورة المورد المستحقة
                <select name="sourceId" required>
                  {data.vendorBills?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.vendor_name} · {b.product_name} × {b.quantity} ·{' '}
                      {formatIqd(
                        b.outstanding_minor ??
                          (BigInt(b.unit_cost) * BigInt(b.quantity)).toString(),
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                مبلغ السداد الجزئي بوحدات IQD الصغرى (اختياري)
                <input name="paymentAmount" pattern="[1-9][0-9]{0,11}" />
                <span className="panel-intro">
                  اتركه فارغاً لسداد المتبقي كاملاً.
                </span>
              </label>
              <label>
                سبب الصرف
                <textarea name="reason" minLength={10} required />
              </label>
            </CareForm>
          </section>
          <section className="panel care-section">
            <h2>إقفال فترة منتهية</h2>
            <CareForm
              label="إقفال الفترة"
              submit={(f) =>
                send('periods/close', {
                  startsOn: f.get('start'),
                  endsOn: f.get('end'),
                })
              }
            >
              <label>
                بداية الفترة
                <input type="date" name="start" required />
              </label>
              <label>
                نهاية الفترة (غير مشمولة)
                <input type="date" name="end" required />
              </label>
            </CareForm>
          </section>
        </aside>
      </div>
      <BankReconciliation clinicId={clinic.id} />
    </IdentityShell>
  );
}
