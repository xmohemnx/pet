import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { SocialStudio } from '../../../components/social/social-studio';
import type { SocialProfile, MediaAsset } from '@petra/contracts';
export const metadata = {
  title: 'شارك لحظة',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const me = await loadIdentity(),
    query = await searchParams;
  const [profile, assets] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<MediaAsset[]>('media'),
  ]);
  return (
    <SocialStudio
      me={me}
      profile={profile}
      initialAssets={assets}
      initialKind={
        ['post', 'story', 'reel'].includes(query.kind ?? '')
          ? query.kind
          : 'post'
      }
    />
  );
}
