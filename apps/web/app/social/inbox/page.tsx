import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import {
  SocialInbox,
  type SocialThread,
} from '../../../components/social/social-inbox';
import type { SocialProfile } from '@petra/contracts';
export const metadata = {
  title: 'الرسائل',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [profile, threads] = await Promise.all([
    loadApi<SocialProfile | null>('social/profile'),
    loadApi<SocialThread[]>('social/inbox'),
  ]);
  return <SocialInbox me={me} profile={profile} threads={threads} />;
}
