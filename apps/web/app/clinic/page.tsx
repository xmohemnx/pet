import { redirect } from 'next/navigation';
import { loadIdentity } from '../../lib/server-identity';
import { accountDestination } from '../../lib/account-destination';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const me = await loadIdentity();
  redirect(accountDestination(me));
}
