import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { GroomingCenter } from '../../components/grooming-center';
import type { Pet, GroomingCatalog, GroomingBooking } from '@petra/contracts';
export const metadata = {
  title: 'العناية والتجميل',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity(),
    [pets, catalog, bookings] = await Promise.all([
      loadApi<Pet[]>('pets'),
      loadApi<GroomingCatalog>('grooming/catalog'),
      loadApi<GroomingBooking[]>('me/grooming'),
    ]);
  return (
    <GroomingCenter
      me={me}
      pets={pets}
      initialCatalog={catalog}
      initialBookings={bookings}
    />
  );
}
