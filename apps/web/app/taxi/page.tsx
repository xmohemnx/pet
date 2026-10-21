import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { TaxiCenter } from '../../components/taxi-center';
import type { Pet, Ride } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'نقل الحيوانات',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [pets, rides] = await Promise.all([
    loadApi<Pet[]>('pets'),
    loadApi<Ride[]>('me/rides'),
  ]);
  return <TaxiCenter me={me} pets={pets} initial={rides} />;
}
