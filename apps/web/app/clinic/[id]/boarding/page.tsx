import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { BoardingManagement } from '../../../../components/boarding-management';
import type { BoardingManagementData, ClinicInfo } from '@petra/contracts';
export const metadata = {
  title: 'الفندق ومراجعات القبول',
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
    loadApi<BoardingManagementData>(`${base}/boarding`),
  ]);
  return <BoardingManagement me={me} clinic={clinic} initial={initial} />;
}
