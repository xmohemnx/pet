import Link from 'next/link';
import { loadIdentity, privateApi } from '../../lib/server-identity';
import { AdminDashboard } from '../../components/admin-dashboard';
import type { AdminDashboardData } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'لوحة إدارة Petra',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const r = await privateApi('admin/dashboard');
  if (!r.ok)
    return (
      <main id="main" className="error-page">
        <h1>الوصول الإداري غير متاح</h1>
        <p>تحتاج منحة إدارية وتحققاً بخطوتين وجلسة دخول جديدة.</p>
        <Link className="button primary" href="/security">
          إعداد أمان الحساب
        </Link>
      </main>
    );
  return (
    <AdminDashboard me={me} data={(await r.json()) as AdminDashboardData} />
  );
}
