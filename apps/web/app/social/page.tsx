import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { SocialFeed } from '../../components/social/social-feed';
import type {
  SocialProfile,
  SocialTimeline,
  SocialPost,
  SocialPerson,
} from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مجتمع Petra',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [profile, initial, stories, people] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialTimeline>('social/timeline'),
    loadApi<SocialPost[]>('social/feed?kind=story'),
    loadApi<SocialPerson[]>('social/people'),
  ]);
  return (
    <SocialFeed
      me={me}
      profile={profile}
      initial={initial}
      stories={stories}
      people={people}
    />
  );
}
