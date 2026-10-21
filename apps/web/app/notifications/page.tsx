import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { Notifications } from '../../components/notifications';
import type { AppNotification } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'الإشعارات',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [items, prefs] = await Promise.all([
    loadApi<AppNotification[]>('me/notifications'),
    loadApi<{
      in_app: boolean;
      quiet_start: number | null;
      quiet_end: number | null;
    }>('me/notification-preferences'),
  ]);
  return <Notifications me={me} initial={items} prefs={prefs} />;
}
