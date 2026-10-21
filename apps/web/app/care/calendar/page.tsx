import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import type { CareCalendar as Calendar } from '@petra/contracts';
import { CareCalendar } from '../../../components/care-calendar';
export const metadata = {
  title: 'تقويم الرعاية',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .replace('/', '-');
  const current = /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })
        .format(new Date())
        .slice(0, 7);
  return (
    <CareCalendar
      me={me}
      month={current}
      initial={await loadApi<Calendar>(`me/care-calendar?month=${current}`)}
    />
  );
}
