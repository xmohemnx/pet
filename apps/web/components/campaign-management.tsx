'use client';
import { useEffect, useState } from 'react';
import type { Campaign } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { CareForm } from './care-shared';
import { api } from '../lib/auth-client';
import { mutate, Status } from './platform-shared';
export function CampaignManagement({ refreshKey }: { refreshKey: number }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [error, setError] = useState('');
  async function refresh() {
    setCampaigns(await api<Campaign[]>('donations/campaigns'));
  }
  useEffect(() => {
    refresh().catch(() => setError('تعذر تحميل الحملات'));
  }, [refreshKey]);
  return (
    <section className="panel care-section">
      <h2>إدارة الحملات الحالية</h2>
      <p>
        يمكن تعديل الشروط قبل أي تبرع. إيقاف استقبال التبرعات لا يصرف المال ولا
        يمنع رد تبرع محفوظ.
      </p>
      {error && <p role="alert">{error}</p>}
      {campaigns.map((c) => (
        <details key={c.id}>
          <summary>
            {c.name} · {formatIqd(c.collected_minor)}
          </summary>
          <Status value={c.status} />
          {c.status === 'active' && (
            <>
              {!c.donation_count && (
                <CareForm
                  label="حفظ تعديل الحملة"
                  submit={async (f) => {
                    await api(`admin/sandbox/campaigns/${c.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        version: c.version,
                        name: f.get('name'),
                        purpose: f.get('purpose'),
                        beneficiary: f.get('beneficiary'),
                        goalMinor: f.get('goal'),
                        reason: f.get('reason'),
                      }),
                    });
                    await refresh();
                  }}
                >
                  <label>
                    اسم الحملة المعدل
                    <input
                      name="name"
                      defaultValue={c.name}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    غرض الحملة المعدل
                    <textarea
                      name="purpose"
                      defaultValue={c.purpose}
                      minLength={5}
                      maxLength={3000}
                      required
                    />
                  </label>
                  <label>
                    المستفيد المعدل
                    <textarea
                      name="beneficiary"
                      defaultValue={c.beneficiary}
                      minLength={5}
                      maxLength={3000}
                      required
                    />
                  </label>
                  <label>
                    الهدف المعدل بوحدات IQD الصغرى
                    <input
                      name="goal"
                      defaultValue={c.goal_minor}
                      pattern="[1-9][0-9]{0,11}"
                      required
                    />
                  </label>
                  <label>
                    سبب تعديل الحملة
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={3000}
                      required
                    />
                  </label>
                </CareForm>
              )}
              <CareForm
                label="إيقاف استقبال التبرعات"
                submit={async (f) => {
                  await mutate(`admin/sandbox/campaigns/${c.id}/close`, {
                    version: c.version,
                    reason: f.get('reason'),
                  });
                  await refresh();
                }}
              >
                <label>
                  سبب إيقاف الحملة
                  <textarea
                    name="reason"
                    minLength={10}
                    maxLength={3000}
                    required
                  />
                </label>
                <label className="check-label">
                  <input type="checkbox" required />
                  أؤكد إيقاف استقبال التبرعات الجديدة لهذه الحملة.
                </label>
              </CareForm>
            </>
          )}
        </details>
      ))}
    </section>
  );
}
