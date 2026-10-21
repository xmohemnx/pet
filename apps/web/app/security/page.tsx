import { loadIdentity } from '../../lib/server-identity';
import { SecurityPanel } from '../../components/security-panel';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'أمان الحساب',
  robots: { index: false, follow: false },
};
export default async function Page() {
  return <SecurityPanel me={await loadIdentity()} />;
}
