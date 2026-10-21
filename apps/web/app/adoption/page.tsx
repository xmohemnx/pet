import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { RescueCenter } from '../../components/rescue-center';
import type {
  Pet,
  AdoptionListing,
  RescueCase,
  Campaign,
  MyRescue,
} from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'التبني والإنقاذ',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [pets, listings, cases, campaigns, mine] = await Promise.all([
    loadApi<Pet[]>('pets'),
    loadApi<AdoptionListing[]>('adoptions'),
    loadApi<RescueCase[]>('rescue/cases'),
    loadApi<Campaign[]>('donations/campaigns'),
    loadApi<MyRescue>('me/rescue'),
  ]);
  return (
    <RescueCenter
      me={me}
      pets={pets}
      initialListings={listings}
      initialCases={cases}
      initialCampaigns={campaigns}
      initialMine={mine}
    />
  );
}
