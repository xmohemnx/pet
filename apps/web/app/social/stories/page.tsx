import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { SocialStories } from '../../../components/social/social-viewers';
import type { SocialProfile, SocialPost } from '@petra/contracts';
export const metadata = {
  title: 'قصص اليوم',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const me = await loadIdentity(),
    query = await searchParams;
  const [profile, stories] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialPost[]>('social/feed?kind=story'),
  ]);
  return (
    <SocialStories
      me={me}
      profile={profile}
      stories={stories}
      startId={query.start}
    />
  );
}
