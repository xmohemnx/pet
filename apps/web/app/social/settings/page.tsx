import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { SocialCenter } from '../../../components/social-center';
import type {
  SocialProfile,
  SocialPost,
  SocialPerson,
  MediaAsset,
} from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مجتمع Petra',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [profile, posts, people, assets] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialPost[]>('social/feed'),
    loadApi<SocialPerson[]>('social/people'),
    loadApi<MediaAsset[]>('media'),
  ]);
  const [requests, followers, blocks] = await Promise.all([
    loadApi<{ follower_id: string; display_name: string }[]>(
      'social/follow-requests',
    ),
    loadApi<{ follower_id: string; display_name: string }[]>(
      'social/followers',
    ),
    loadApi<{ blocked_id: string; display_name: string | null }[]>(
      'social/blocks',
    ),
  ]);
  return (
    <SocialCenter
      me={me}
      initialProfile={profile}
      initialPosts={posts}
      initialPeople={people}
      initialAssets={assets}
      initialRelationships={{ requests, followers, blocks }}
    />
  );
}
