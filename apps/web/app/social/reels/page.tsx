import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { SocialReels } from '../../../components/social/social-viewers';
import type { SocialProfile, SocialTimeline } from '@petra/contracts';
export const metadata = {
  title: 'ريلز',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ author?: string }>;
}) {
  const me = await loadIdentity(),
    { author } = await searchParams;
  const [profile, initial] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialTimeline>(
      `social/timeline?kind=reel${author ? `&author=${encodeURIComponent(author)}` : ''}`,
    ),
  ]);
  return (
    <SocialReels me={me} profile={profile} initial={initial} author={author} />
  );
}
