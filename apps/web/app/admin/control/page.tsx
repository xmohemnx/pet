import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { AdminControl } from '../../../components/admin-dashboard';
import type { AdminDashboardData } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'تحكم المدير والمحتوى',
  robots: { index: false, follow: false },
};
export default async function Page() {
  return (
    <AdminControl
      me={await loadIdentity()}
      initial={await loadApi<AdminDashboardData>('admin/dashboard')}
    />
  );
}
