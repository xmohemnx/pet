import { loadIdentity, privateApi } from '../../lib/server-identity';
import { CareHome } from '../../components/care-home';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مركز الرعاية',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [pets, slots] = await Promise.all([
    privateApi('pets'),
    privateApi('care/slots'),
  ]);
  if (!pets.ok || !slots.ok) throw new Error('تعذر تحميل مركز الرعاية');
  return (
    <CareHome me={me} pets={await pets.json()} slots={await slots.json()} />
  );
}
