import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import type { HomeVisitBooking } from '@petra/contracts';
import { HomeReceipt } from '../../../../components/home-receipt';
export const metadata = {
  title: 'إيصال زيارة منزلية',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params,
    b = await loadApi<HomeVisitBooking>(
      `home-visits/${encodeURIComponent(id)}`,
    );
  return <HomeReceipt me={me} booking={b} />;
}
