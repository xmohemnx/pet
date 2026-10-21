import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { ServiceCenter } from '../../components/service-center';
import type { Pet, ServicesCatalog, MyServices } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'الباقات والإقامة',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [pets, catalog, mine] = await Promise.all([
    loadApi<Pet[]>('pets'),
    loadApi<ServicesCatalog>('services/catalog'),
    loadApi<MyServices>('me/services'),
  ]);
  return <ServiceCenter me={me} pets={pets} catalog={catalog} initial={mine} />;
}
