import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { TaxiCenter } from '../../components/taxi-center';
import type { Ride, DriverHome } from '@petra/contracts';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مساحة السائق',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  if (me.user.accountType !== 'driver') redirect('/app');
  if (!me.workspaces.some((w) => w.id === 'driver')) redirect('/account');
  const [rides, home] = await Promise.all([
    loadApi<Ride[]>('me/rides'),
    loadApi<DriverHome>('driver/home'),
  ]);
  return <TaxiCenter me={me} pets={[]} initial={rides} driverData={home} />;
}
