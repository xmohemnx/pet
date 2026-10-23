import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { SocialReels } from '../../../../components/social/social-viewers';
import type { SocialProfile, SocialPost } from '@petra/contracts';
import { notFound } from 'next/navigation';
export const metadata = {
  title: 'ريل من المجتمع',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const [profile, result] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<{ post: SocialPost }>(`social/posts/${encodeURIComponent(id)}`),
  ]);
  if (result.post.kind !== 'reel') notFound();
  return (
    <SocialReels
      me={me}
      profile={profile}
      initial={{ items: [result.post], nextCursor: null }}
      startId={id}
    />
  );
}
