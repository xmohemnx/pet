'use client';
import { useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import type { IdentityMe, VerificationRequest } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { WorkspaceHeading } from './workspace-overview';
import { CareForm } from './care-shared';
import { api } from '../lib/auth-client';
const statuses = {
  pending: 'قيد المراجعة',
  verified: 'هوية موثقة',
  rejected: 'طلب غير معتمد',
  revoked: 'توثيق مسحوب',
};
export function AccountVerification({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: VerificationRequest[];
}) {
  const [requests, setRequests] = useState(initial);
  const active = requests.find((r) =>
    ['pending', 'verified'].includes(r.status),
  );
  return (
    <IdentityShell me={me}>
      <div className="role-desk verification-desk">
        <WorkspaceHeading
          title="توثيق حسابك"
          description="توثيق الهوية يضيف شارة للحساب بعد مراجعة الإدارة، ولا يحل محل اعتماد المهنة."
        />
        <div className="desk-body">
          <section className="desk-panel">
            <h2>
              <BadgeCheck size={24} aria-hidden="true" /> طلب توثيق الهوية
            </h2>
            {active ? (
              <p role="status" className="verification-state">
                {statuses[active.status]}
              </p>
            ) : (
              <CareForm
                label="إرسال طلب التوثيق"
                submit={async (f) => {
                  await api('me/verifications', {
                    method: 'POST',
                    body: JSON.stringify({ reference: f.get('reference') }),
                  });
                  setRequests(
                    await api<VerificationRequest[]>('me/verifications'),
                  );
                }}
              >
                <label>
                  مرجع التحقق والمعلومات المساعدة
                  <textarea
                    name="reference"
                    minLength={10}
                    maxLength={1000}
                    required
                    rows={4}
                  />
                  <small>
                    اذكر مرجعاً يمكن للإدارة التحقق منه. لا تضع أرقام هوية كاملة
                    أو وثائق حساسة هنا.
                  </small>
                </label>
              </CareForm>
            )}
            {requests.map((r) => (
              <article className="care-list-row" key={r.id}>
                <div>
                  <h3>{statuses[r.status]}</h3>
                  {r.review_reason && <p>{r.review_reason}</p>}
                </div>
              </article>
            ))}
          </section>
          <aside className="desk-note">
            <ShieldCheck size={28} aria-hidden="true" />
            <h2>مراجعة مستقلة</h2>
            <p>
              الإدارة وحدها تعتمد الطلب أو ترفضه بسبب موثق، ويمكنها سحب التوثيق
              عند الحاجة. اعتماد الطبيب والعيادة والسائق يبقى مساراً مهنياً
              منفصلاً.
            </p>
          </aside>
        </div>
      </div>
    </IdentityShell>
  );
}
