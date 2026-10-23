import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { AdminAccountTypes } from '../../../components/admin-account-types';
import type { AccountTypeRequest } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'طلبات تغيير نوع الحساب',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  return (
    <AdminAccountTypes
      me={me}
      initial={await loadApi<AccountTypeRequest[]>(
        'admin/account-type-requests',
      )}
    />
  );
}
