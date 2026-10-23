import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { redirect } from 'next/navigation';
import type { ProfessionalCaseReport, CareAppointment } from '@petra/contracts';
import { PortfolioEditor } from '../../../components/professional-portfolio';
export const metadata = {
  title: 'نتائج أعمالي المهنية',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  if (me.user.accountType !== 'doctor') redirect('/app');
  const [initial, appointments] = await Promise.all([
    loadApi<ProfessionalCaseReport[]>('doctor/portfolio-reports'),
    loadApi<CareAppointment[]>('doctor/appointments'),
  ]);
  return (
    <PortfolioEditor me={me} initial={initial} appointments={appointments} />
  );
}
