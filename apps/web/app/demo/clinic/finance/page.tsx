import { ClinicFinance } from '../../../../components/dashboard';
import { getFinanceDemo } from '../../data';
export default async function Page() {
  return <ClinicFinance data={await getFinanceDemo()} />;
}
