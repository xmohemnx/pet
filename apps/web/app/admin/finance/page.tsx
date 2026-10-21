import { loadIdentity, privateApi } from '../../../lib/server-identity';
import {
  PlatformFinance,
  type PlatformFinanceData,
} from '../../../components/platform-finance';
import { IdentityShell } from '../../../components/identity-shell';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const me = await loadIdentity();
  const r = await privateApi('admin/finance');
  if (r.status === 403)
    return (
      <IdentityShell me={me}>
        <h1>التفويض المالي مطلوب</h1>
        <p>
          الإدارة العامة لا تمنح إعداد الصرف أو اعتماده. يلزم تفويض مالي مستقل
          ومنحتان لحسابين مختلفين.
        </p>
      </IdentityShell>
    );
  if (!r.ok) throw new Error('تعذر تحميل مالية المنصة');
  return (
    <PlatformFinance
      me={me}
      initial={(await r.json()) as PlatformFinanceData}
    />
  );
}
