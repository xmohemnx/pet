import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { SocialFeed } from '../../../components/social/social-feed';
import type {
  SocialProfile,
  SocialTimeline,
  SocialPerson,
} from '@petra/contracts';
export const metadata = {
  title: 'اكتشف المجتمع',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [profile, initial, people] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialTimeline>('social/timeline'),
    loadApi<SocialPerson[]>('social/people'),
  ]);
  return (
    <SocialFeed
      me={me}
      profile={profile}
      initial={initial}
      stories={[]}
      people={people}
      explore
    />
  );
}
