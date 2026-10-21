'use client';
import { useState } from 'react';
import type { IdentityMe } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import {
  SandboxNotice,
  PlatformHeading,
  Status,
  mutate,
} from './platform-shared';
export interface PlatformFinanceData {
  mode: string;
  balances: {
    account_code: string;
    party_id: string | null;
    debit: string;
    credit: string;
  }[];
  payouts: {
    id: string;
    kind: string;
    party_id: string;
    amount_minor: string;
    status: string;
    created_by: string;
  }[];
}
export function PlatformFinance({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: PlatformFinanceData;
}) {
  const [data, setData] = useState(initial);
  async function send(path: string, body: unknown = {}) {
    await mutate(`admin/sandbox/${path}`, body);
    setData(await api<PlatformFinanceData>('admin/finance'));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="تفويض مالي مستقل"
        title="دفتر المنصة وتسويات الاختبار"
      />
      <SandboxNotice />
      <section className="panel care-section">
        <h2>أرصدة حسابات الدفتر حسب الجهة</h2>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>الحساب</th>
                <th>الجهة</th>
                <th>مدين</th>
                <th>دائن</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((b, i) => (
                <tr key={i}>
                  <th>{b.account_code}</th>
                  <td>
                    <bdi>{b.party_id ?? 'المنصة'}</bdi>
                  </td>
                  <td>{formatIqd(b.debit)}</td>
                  <td>{formatIqd(b.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="care-columns">
        <section className="panel care-section">
          <h2>الصرف والمطابقة</h2>
          {data.payouts.map((p) => (
            <article className="care-list-row" key={p.id}>
              <div>
                <h3>
                  {p.kind} · {formatIqd(p.amount_minor)}
                </h3>
                <p>
                  <bdi>{p.party_id}</bdi>
                </p>
                <Status value={p.status} />
              </div>
              {p.status === 'pending' && p.created_by !== me.user.id && (
                <CareAction action={() => send(`payouts/${p.id}/pay`)}>
                  اعتماد وصرف اختباري
                </CareAction>
              )}
              {p.status === 'pending' && p.created_by === me.user.id && (
                <CareAction action={() => send(`payouts/${p.id}/cancel`)}>
                  سحب طلب الصرف
                </CareAction>
              )}
              {p.status === 'paid' && (
                <CareForm
                  label="مطابقة مستند الصرف"
                  submit={(f) =>
                    send(`payouts/${p.id}/reconcile`, {
                      amountMinor: f.get('amount'),
                      statementReference: f.get('reference'),
                    })
                  }
                >
                  <label>
                    المبلغ المطابق بوحدات IQD الصغرى
                    <input name="amount" required pattern="[1-9][0-9]{0,11}" />
                  </label>
                  <label>
                    مرجع كشف اختبار فريد
                    <input
                      name="reference"
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </label>
                </CareForm>
              )}
            </article>
          ))}
        </section>
        <section className="panel care-section">
          <h2>إعداد طلب صرف اختباري</h2>
          <CareForm
            label="إرسال للمعتمد المالي"
            submit={(f) =>
              send('payouts', {
                kind: f.get('kind'),
                partyId: f.get('party'),
                amountMinor: f.get('amount'),
              })
            }
          >
            <label>
              نوع المستحق
              <select name="kind">
                <option value="clinic">عيادة</option>
                <option value="driver">سائق</option>
                <option value="fund">صندوق مقيد</option>
              </select>
            </label>
            <label>
              معرف الجهة
              <input name="party" required />
            </label>
            <label>
              مبلغ الطلب بوحدات IQD الصغرى
              <input name="amount" required pattern="[1-9][0-9]{0,11}" />
            </label>
          </CareForm>
        </section>
      </div>
    </IdentityShell>
  );
}
