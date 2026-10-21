import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicFinance } from '../../../../components/clinic-finance';
import type { ClinicInfo, FinanceReport } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'finance',
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
  const initial = await loadApi<FinanceReport>(
    `clinics/${encodeURIComponent(id)}/finance`,
  );
  return <ClinicFinance me={me} clinic={clinic} initial={initial} />;
}
