import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { InventoryDashboard } from '../../../../components/inventory-dashboard';
import type { ClinicInfo, InventoryData } from '@petra/contracts';
export const metadata = {
  title: 'المستودعات والدفعات',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const base = `clinics/${encodeURIComponent(id)}`;
  const [clinic, initial] = await Promise.all([
    loadApi<ClinicInfo>(base),
    loadApi<InventoryData>(`${base}/inventory`),
  ]);
  return <InventoryDashboard me={me} clinic={clinic} initial={initial} />;
}
