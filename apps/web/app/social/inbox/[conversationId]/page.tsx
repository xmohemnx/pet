import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import {
  SocialInbox,
  type SocialThread,
} from '../../../../components/social/social-inbox';
import type {
  SocialProfile,
  SocialPerson,
  SocialMessage,
} from '@petra/contracts';
export const metadata = {
  title: 'محادثة خاصة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const me = await loadIdentity(),
    { conversationId } = await params,
    id = encodeURIComponent(conversationId);
  const [profile, peer, messages] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialPerson>(`social/users/${id}/profile`),
    loadApi<SocialMessage[]>(`social/messages/${id}`),
  ]);
  // Reading the messages marks them as read; fetch counts after that write.
  const threads = await loadApi<SocialThread[]>('social/inbox');
  return (
    <SocialInbox
      key={conversationId}
      me={me}
      profile={profile}
      peer={peer}
      initialMessages={messages}
      threads={threads}
    />
  );
}
