import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { SocialPostDetail } from '../../../../components/social-post-detail';
import type {
  SocialPost,
  SocialComment,
  SocialProfile,
} from '@petra/contracts';
export const metadata = {
  title: 'منشور مشترك',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const [profile, initial] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<{
      post: SocialPost;
      comments: SocialComment[];
    }>(`social/posts/${encodeURIComponent(id)}`),
  ]);
  return <SocialPostDetail me={me} initial={initial} profile={profile} />;
}
