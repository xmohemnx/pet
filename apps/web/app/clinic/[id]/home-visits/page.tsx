import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicHomeVisits } from '../../../../components/clinic-home-visits';
import type { ClinicInfo, HomeVisitManagement } from '@petra/contracts';
export const metadata = {
  title: 'إدارة الزيارات المنزلية',
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
    loadApi<HomeVisitManagement>(`${base}/home-visits`),
  ]);
  return <ClinicHomeVisits me={me} clinic={clinic} initial={initial} />;
}
