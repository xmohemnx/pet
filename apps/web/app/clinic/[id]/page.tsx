import { notFound } from 'next/navigation';
import { loadIdentity, privateApi } from '../../../lib/server-identity';
import { ClinicWorkspace } from '../../../components/clinic-workspace';
import type { ClinicInfo } from '@petra/contracts';
import { baghdadDay } from '../../../components/workspace-overview';
import type { ClinicCalendarData } from '../../../components/clinic-calendar';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'مساحة العيادة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity();
  const { id } = await params;
  const r = await privateApi(`clinics/${encodeURIComponent(id)}`);
  if (!r.ok) notFound();
  const clinic = (await r.json()) as ClinicInfo;
  const canReadCalendar = clinic.capabilities.some((c) =>
    ['clinic_admin', 'receptionist'].includes(c),
  );
  let calendar: ClinicCalendarData | undefined;
  let calendarError = false;
  if (canReadCalendar) {
    const result = await privateApi(
      `clinics/${encodeURIComponent(id)}/calendar?date=${baghdadDay()}`,
    );
    if (result.ok) calendar = await result.json();
    else calendarError = true;
  }
  return (
    <ClinicWorkspace
      me={me}
      clinic={clinic}
      calendar={calendar}
      calendarError={calendarError}
    />
  );
}
