import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { BoardingDetail } from '../../../components/boarding-detail';
import type { BoardingDetailData } from '@petra/contracts';
export const metadata = {
  title: 'متابعة الإقامة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params,
    initial = await loadApi<BoardingDetailData>(
      `boarding/${encodeURIComponent(id)}`,
    );
  return <BoardingDetail me={me} initial={initial} />;
}
