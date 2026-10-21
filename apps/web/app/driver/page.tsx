import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { TaxiCenter } from '../../components/taxi-center';
import type { Ride, DriverHome } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مساحة السائق',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [rides, home] = await Promise.all([
    loadApi<Ride[]>('me/rides'),
    loadApi<DriverHome>('driver/home'),
  ]);
  return <TaxiCenter me={me} pets={[]} initial={rides} driverData={home} />;
}
