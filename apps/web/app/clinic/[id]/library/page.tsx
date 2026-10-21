import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicCareLibrary } from '../../../../components/clinic-care-library';
import type { ClinicInfo, CareLibraryManagement } from '@petra/contracts';
export const metadata = {
  title: 'تحرير مكتبة الرعاية',
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
      loadApi<CareLibraryManagement>(`${base}/library`),
    ]);
  return <ClinicCareLibrary me={me} clinic={clinic} initial={initial} />;
}
