import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicGrooming } from '../../../../components/clinic-grooming';
import type { ClinicInfo, GroomingManagement } from '@petra/contracts';
export const metadata = {
  title: 'إدارة العناية والتجميل',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params,
    base = `clinics/${encodeURIComponent(id)}`,
    [clinic, initial] = await Promise.all([
      loadApi<ClinicInfo>(base),
      loadApi<GroomingManagement>(`${base}/grooming`),
    ]);
  return <ClinicGrooming me={me} clinic={clinic} initial={initial} />;
}
