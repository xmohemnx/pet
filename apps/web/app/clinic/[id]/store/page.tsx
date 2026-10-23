import { notFound } from 'next/navigation';
import type { ClinicInfo, InventoryData, CommerceData } from '@petra/contracts';
import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicStore } from '../../../../components/clinic-store';
import type { Category } from '../../../../components/catalog-taxonomy';
export const metadata = {
  title: 'إدارة متجر العيادة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  if (
    !me.workspaces.some(
      (w) =>
        w.persona === 'clinic_member' &&
        w.clinicId === id &&
        w.capabilities.includes('clinic_admin'),
    )
  )
    notFound();
  const base = `clinics/${encodeURIComponent(id)}`;
  const [clinic, inventory, commerce, categories] = await Promise.all([
    loadApi<ClinicInfo>(base),
    loadApi<InventoryData>(`${base}/inventory`),
    loadApi<CommerceData>(`${base}/commerce`),
    loadApi<Category[]>(`${base}/categories`),
  ]);
  return (
    <ClinicStore
      me={me}
      clinic={clinic}
      inventory={inventory}
      commerce={commerce}
      categories={categories}
    />
  );
}
