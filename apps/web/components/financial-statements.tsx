'use client';
import Link from 'next/link';
import { useState } from 'react';
import type {
  FinancialStatements as Report,
  IdentityMe,
  ClinicInfo,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
import { CareForm } from './care-shared';
import { PlatformHeading, SandboxNotice } from './platform-shared';
const money = (s: string) =>
  (s.startsWith('-') ? '−' : '') + formatIqd(s.replace('-', ''));
export function FinancialStatements({
  me,
  clinic,
  initial,
}: {
  me: IdentityMe;
  clinic: ClinicInfo;
  initial: Report;
}) {
  const [data, setData] = useState(initial);
  const labels = {
    assets: 'الأصول',
    liabilities: 'الالتزامات',
    equity: 'حقوق الملكية',
    revenue: 'الإيرادات',
    expenses: 'المصروفات',
    profit: 'النتيجة التراكمية',
    difference: 'فرق المركز المالي',
  };
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow={clinic.name}
        title="التقارير المؤرخة وأعمار المستحقات"
      >
        قيود مرحّلة حتى نهاية التاريخ المحدد، لا تشمل المسودات. تقارير تشغيلية
        اختبارية قبل المراجعة المحاسبية القانونية.
      </PlatformHeading>
      <SandboxNotice />
      <Link className="button outline" href={`/clinic/${clinic.id}/finance`}>
        القيود والموافقات
      </Link>
      <section className="panel care-section">
        <h2>تاريخ التقرير</h2>
        <CareForm
          label="عرض التقرير"
          submit={async (f) =>
            setData(
              await api<Report>(
                `clinics/${clinic.id}/finance/statements?asOf=${encodeURIComponent(String(f.get('date')))}`,
              ),
            )
          }
        >
          <label>
            حتى تاريخ
            <input type="date" name="date" defaultValue={data.asOf} required />
          </label>
        </CareForm>
        <button className="button outline" onClick={() => window.print()}>
          طباعة التقرير
        </button>
        <p>التاريخ: {data.asOf}</p>
      </section>
      <section className="panel care-section">
        <h2>الدخل والمركز المالي</h2>
        <dl>
          {Object.entries(data.statements).map(([k, v]) => (
            <div className="care-list-row" key={k}>
              <dt>{labels[k as keyof typeof labels]}</dt>
              <dd>{money(v)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel care-section">
        <h2>أعمار مستحقات الموردين</h2>
        <div className="finance-real-stats">
          {Object.entries(data.aging).map(([k, v]) => (
            <article className="panel" key={k}>
              <span>
                {
                  {
                    current: 'غير متأخر',
                    days1to30: '1–30 يوماً',
                    days31to60: '31–60 يوماً',
                    days61to90: '61–90 يوماً',
                    over90: 'أكثر من 90 يوماً',
                  }[k]
                }
              </span>
              <strong>{money(v)}</strong>
            </article>
          ))}
        </div>
        <div
          className="data-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="جدول أعمار المستحقات القابل للتمرير"
        >
          <table>
            <thead>
              <tr>
                <th>المورد</th>
                <th>الاستحقاق</th>
                <th>المتبقي</th>
                <th>تأخر بالأيام</th>
              </tr>
            </thead>
            <tbody>
              {data.payables.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.vendor_name}</th>
                  <td>{p.due_on}</td>
                  <td>{money(p.outstanding_minor)}</td>
                  <td>{p.days_overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel care-section">
        <h2>ميزان المراجعة في التاريخ المحدد</h2>
        <div
          className="data-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="جدول ميزان المراجعة القابل للتمرير"
        >
          <table>
            <thead>
              <tr>
                <th>الحساب</th>
                <th>مدين</th>
                <th>دائن</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((a) => (
                <tr key={a.code}>
                  <th scope="row">
                    {a.code} · {a.name}
                  </th>
                  <td>{money(a.debit)}</td>
                  <td>{money(a.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </IdentityShell>
  );
}
