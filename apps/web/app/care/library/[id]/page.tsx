import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { CareLibraryReader } from '../../../../components/care-library';
import type { CareArticle, ContentCorrection } from '@petra/contracts';
export const metadata = {
  title: 'مقال رعاية مراجع',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params,
    [article, initialCorrections] = await Promise.all([
      loadApi<CareArticle>(`care/library/${encodeURIComponent(id)}`),
      loadApi<ContentCorrection[]>('me/content-corrections'),
    ]);
  return (
    <CareLibraryReader
      me={me}
      initial={[]}
      article={article}
      initialCorrections={initialCorrections}
    />
  );
}
