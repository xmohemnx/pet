import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import type { DoctorDirectoryEntry, Pet } from '@petra/contracts';
import { CareDirectory } from '../../../components/care-directory';
export const metadata = {
  title: 'دليل الأطباء',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [doctors, pets] = await Promise.all([
    loadApi<DoctorDirectoryEntry[]>('care/directory'),
    loadApi<Pet[]>('pets'),
  ]);
  return <CareDirectory me={me} initial={doctors} pets={pets} />;
}
