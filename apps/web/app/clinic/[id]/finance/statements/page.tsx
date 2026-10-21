import { loadIdentity } from '../../../../../lib/server-identity';
import { loadApi } from '../../../../../lib/platform-server';
import { FinancialStatements } from '../../../../../components/financial-statements';
import type {
  ClinicInfo,
  FinancialStatements as Report,
} from '@petra/contracts';
export const metadata = {
  title: 'التقارير المالية',
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
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [clinic, initial] = await Promise.all([
    loadApi<ClinicInfo>(base),
    loadApi<Report>(`${base}/finance/statements?asOf=${day}`),
  ]);
  return <FinancialStatements me={me} clinic={clinic} initial={initial} />;
}
