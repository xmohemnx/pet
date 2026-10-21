import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { HomeVisits } from '../../components/home-visits';
import type { Pet, HomeVisitCatalog, HomeVisitBooking } from '@petra/contracts';
export const metadata = {
  title: 'الزيارات المنزلية',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [pets, catalog, bookings] = await Promise.all([
    loadApi<Pet[]>('pets'),
    loadApi<HomeVisitCatalog>('home-visits/catalog'),
    loadApi<HomeVisitBooking[]>('me/home-visits'),
  ]);
  return (
    <HomeVisits
      me={me}
      pets={pets}
      initialCatalog={catalog}
      initialBookings={bookings}
    />
  );
}
