import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { CareLibraryReader } from '../../../components/care-library';
import type { CareArticle, ContentCorrection } from '@petra/contracts';
export const metadata = {
  title: 'مكتبة الرعاية',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity(),
    [initial, initialCorrections] = await Promise.all([
      loadApi<CareArticle[]>('care/library'),
      loadApi<ContentCorrection[]>('me/content-corrections'),
    ]);
  return (
    <CareLibraryReader
      me={me}
      initial={initial}
      initialCorrections={initialCorrections}
    />
  );
}
