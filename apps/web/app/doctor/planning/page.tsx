import { redirect } from 'next/navigation';
import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import type {
  DoctorClinic,
  DoctorPlanningData,
  DoctorPublicProfile,
} from '@petra/contracts';
import { DoctorPlanning } from '../../../components/doctor-planning';
export const metadata = {
  title: 'الدوام والتوفر',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  if (me.user.accountType !== 'doctor') redirect('/app');
  if (!me.workspaces.some((w) => w.id === 'doctor')) redirect('/account');
  const clinics = await loadApi<DoctorClinic[]>('doctor/clinics');
  const [profile, initial] = await Promise.all([
    loadApi<DoctorPublicProfile | null>('doctor/public-profile'),
    clinics[0]
      ? loadApi<DoctorPlanningData>(`doctor/clinics/${clinics[0].id}/planning`)
      : null,
  ]);
  return (
    <DoctorPlanning
      me={me}
      clinics={clinics}
      initial={initial}
      profile={profile}
    />
  );
}
