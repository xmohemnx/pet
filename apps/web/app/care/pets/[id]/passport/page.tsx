import { loadIdentity } from '../../../../../lib/server-identity';
import { loadApi } from '../../../../../lib/platform-server';
import type { PetPassport as Passport } from '@petra/contracts';
import { PetPassport } from '../../../../../components/pet-passport';
export const metadata = {
  title: 'جواز الرعاية الخاص',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const data = await loadApi<Passport>(
    `pets/${encodeURIComponent(id)}/passport`,
  );
  return <PetPassport me={me} data={data} />;
}
