import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import type { CareResource, ClinicInfo } from '@petra/contracts';
import {
  ClinicCalendar,
  type ClinicCalendarData,
} from '../../../../components/clinic-calendar';
export const metadata = {
  title: 'تقويم العيادة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const clinic = await loadApi<ClinicInfo>(`clinics/${id}`);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
  }).format(new Date());
  const [initial, resources] = await Promise.all([
    loadApi<ClinicCalendarData>(`clinics/${id}/calendar?date=${today}`),
    loadApi<CareResource[]>(`clinics/${id}/resources`),
  ]);
  return (
    <ClinicCalendar
      me={me}
      clinic={clinic}
      initial={initial}
      initialResources={resources}
      today={today}
    />
  );
}
