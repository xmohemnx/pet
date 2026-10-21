'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/auth-client';
import { CareForm, CareAction } from './care-shared';
import { mutate, Status } from './platform-shared';
import { formatIqd } from '@petra/contracts';
type Data = {
  accounts: { id: string; name: string; account_reference: string }[];
  lines: {
    id: string;
    reference: string;
    booked_on: string;
    amount_minor: string;
    bank_name: string;
    journal_line_id: string | null;
  }[];
  journalLines: {
    id: string;
    description: string;
    debit: string;
    credit: string;
  }[];
};
export function BankReconciliation({ clinicId }: { clinicId: string }) {
  const [data, setData] = useState<Data>({
      accounts: [],
      lines: [],
      journalLines: [],
    }),
    [error, setError] = useState('');
  const base = `clinics/${clinicId}/finance/banks`;
  async function refresh() {
    setData(await api<Data>(base));
  }
  useEffect(() => {
    refresh().catch(() => setError('تعذر تحميل حسابات المطابقة'));
  }, [clinicId]);
  async function send(path: string, body: unknown) {
    await mutate(base + path, body);
    await refresh();
  }
  return (
    <section className="panel care-section">
      <h2>الكشوف والمطابقة المصرفية الاختبارية</h2>
      <p className="panel-intro">
        استيراد يدوي لكشف اختبار وربطه بقيد حساب 1010 مطابق لنفس العيادة
        والمبلغ. لا اتصال مصرفي خارجي.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="care-fields">
        <CareForm
          label="إضافة حساب اختبار"
          submit={(f) =>
            send('', { name: f.get('name'), reference: f.get('reference') })
          }
        >
          <label>
            اسم الحساب المصرفي
            <input name="name" minLength={2} required maxLength={100} />
          </label>
          <label>
            مرجع الحساب الخاص
            <input name="reference" minLength={2} required maxLength={100} />
          </label>
        </CareForm>
        <CareForm
          label="استيراد سطور الكشف"
          submit={(f) => {
            const rows = String(f.get('lines'))
              .trim()
              .split('\n')
              .map((row) => {
                const [reference, bookedOn, amountMinor] = row
                  .split(',')
                  .map((s) => s.trim());
                if (!reference || !bookedOn || !amountMinor)
                  throw new Error(
                    'صيغة كل سطر: مرجع,YYYY-MM-DD,مبلغ صحيح موقّع',
                  );
                return { reference, bookedOn, amountMinor };
              });
            return send(`/${f.get('bank')}/import`, { lines: rows });
          }}
        >
          <label>
            حساب الكشف
            <select name="bank" required>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            سطور الكشف: مرجع، تاريخ، مبلغ
            <textarea
              name="lines"
              required
              placeholder="ref-01,2026-10-21,1000"
              dir="ltr"
            />
          </label>
        </CareForm>
      </div>
      {data.lines.map((l) => (
        <div className="care-list-row" key={l.id}>
          <div>
            <h3>
              {l.bank_name} · {l.reference}
            </h3>
            <p>
              {l.booked_on} · {l.amount_minor.startsWith('-') ? '-' : ''}
              {formatIqd(l.amount_minor.replace('-', ''))}
            </p>
            <Status value={l.journal_line_id ? 'reconciled' : 'pending'} />
          </div>
          {!l.journal_line_id && (
            <CareForm
              label="مطابقة السطر بالقيد"
              submit={(f) =>
                send(`/lines/${l.id}/match`, { journalLineId: f.get('line') })
              }
            >
              <label>
                قيد الحساب المصرفي
                <select name="line" required>
                  {data.journalLines.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.description} · مدين {j.debit} / دائن {j.credit}
                    </option>
                  ))}
                </select>
              </label>
            </CareForm>
          )}
        </div>
      ))}
      <CareAction action={refresh}>تحديث المطابقة</CareAction>
    </section>
  );
}
