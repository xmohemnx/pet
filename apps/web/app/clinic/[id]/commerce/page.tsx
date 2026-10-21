import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicCommerce } from '../../../../components/clinic-commerce';
import type { ClinicInfo, CommerceData } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'commerce',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity();
  const { id } = await params;
  const clinic = await loadApi<ClinicInfo>(`clinics/${encodeURIComponent(id)}`);
  const initial = await loadApi<CommerceData>(
    `clinics/${encodeURIComponent(id)}/commerce`,
  );
  return <ClinicCommerce me={me} clinic={clinic} initial={initial} />;
}
