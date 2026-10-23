import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { SocialProfilePage } from '../../../../components/social/social-profile';
import type {
  SocialProfile,
  SocialProfileView,
  SocialTimeline,
  MediaAsset,
} from '@petra/contracts';
export const metadata = {
  title: 'ملف من مجتمع Petra',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const me = await loadIdentity(),
    { handle } = await params;
  const [ownProfile, view] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialProfileView>(`social/profiles/${encodeURIComponent(handle)}`),
  ]);
  const [timeline, assets] = await Promise.all([
    view.canView
      ? loadApi<SocialTimeline>(
          `social/timeline?author=${view.profile.user_id}`,
        )
      : Promise.resolve({ items: [], nextCursor: null }),
    view.profile.user_id === me.user.id
      ? loadApi<MediaAsset[]>('media')
      : Promise.resolve([]),
  ]);
  return (
    <SocialProfilePage
      me={me}
      ownProfile={ownProfile}
      initial={view}
      timeline={timeline}
      assets={assets}
    />
  );
}
