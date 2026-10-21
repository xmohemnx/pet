import { redirect } from 'next/navigation';
import { loadIdentity, privateApi } from '../../lib/server-identity';
import { DoctorWorkspace } from '../../components/doctor-workspace';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مساحة الطبيب',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  if (!me.workspaces.some((w) => w.persona === 'doctor')) redirect('/app');
  const [clinics, appointments] = await Promise.all([
    privateApi('doctor/clinics'),
    privateApi('doctor/appointments'),
  ]);
  if (!clinics.ok || !appointments.ok)
    throw new Error('تعذر تحميل مساحة الطبيب');
  return (
    <DoctorWorkspace
      me={me}
      clinics={await clinics.json()}
      appointments={await appointments.json()}
    />
  );
}
