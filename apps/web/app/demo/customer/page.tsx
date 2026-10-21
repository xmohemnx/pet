import { CustomerDashboard } from '../../../components/dashboard';
import { getCustomerDemo } from '../data';
export default async function Page() {
  return <CustomerDashboard data={await getCustomerDemo()} />;
}
