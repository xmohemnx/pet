import { loadIdentity } from '../../lib/server-identity';
import { CareHome } from '../../components/care-home';
import { loadApi } from '../../lib/platform-server';
import type { Pet, AvailableSlot, SiteBanner } from '@petra/contracts';
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
  const [pets, slots, banners] = await Promise.all([
    loadApi<Pet[]>('pets'),
    loadApi<AvailableSlot[]>('care/slots'),
    loadApi<SiteBanner[]>('site/banners'),
  ]);
  return <CareHome me={me} pets={pets} slots={slots} banners={banners} />;
}
