import { loadIdentity } from '../../lib/server-identity';
import { AccountHome } from '../../components/account-home';
import { redirect } from 'next/navigation';
import { accountDestination } from '../../lib/account-destination';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مساحتي',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity(),
    destination = accountDestination(me);
  if (destination !== '/app') redirect(destination);
  return <AccountHome me={me} />;
}
