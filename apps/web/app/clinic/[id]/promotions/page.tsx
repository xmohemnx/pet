import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicPricing } from '../../../../components/clinic-pricing';
import type { ClinicInfo, CommercePricing } from '@petra/contracts';
export const metadata = {
  title: 'العروض وتسعير التجارة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params,
    base = `clinics/${encodeURIComponent(id)}`;
  const [clinic, initial] = await Promise.all([
    loadApi<ClinicInfo>(base),
    loadApi<CommercePricing>(`${base}/pricing`),
  ]);
  return <ClinicPricing me={me} clinic={clinic} initial={initial} />;
}
