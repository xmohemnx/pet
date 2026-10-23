import { loadIdentity } from '../../lib/server-identity';
import { AccountHome } from '../../components/account-home';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'إعدادات الحساب ونوعه',
  robots: { index: false, follow: false },
};
export default async function Page() {
  return <AccountHome me={await loadIdentity()} />;
}
