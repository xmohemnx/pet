import Link from 'next/link';
import { loadIdentity, privateApi } from '../../lib/server-identity';
import { AdminReview } from '../../components/admin-review';
import type { ProfessionalApplication } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مراجعة الاعتماد',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const r = await privateApi('admin/applications');
  if (!r.ok)
    return (
      <main id="main" className="error-page">
        <h1>الوصول الإداري غير متاح</h1>
        <p>
          تحتاج هذه المساحة منحة مراجعة من الخادم وتحققًا بخطوتين وجلسة دخول
          جديدة.
        </p>
        <Link href="/security" className="button primary">
          إعداد أمان الحساب
        </Link>
        <Link href="/app">العودة لحسابي</Link>
      </main>
    );
  return (
    <AdminReview
      me={me}
      initial={(await r.json()) as ProfessionalApplication[]}
    />
  );
}
