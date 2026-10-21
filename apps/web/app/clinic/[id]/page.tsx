import { notFound } from 'next/navigation';
import { loadIdentity, privateApi } from '../../../lib/server-identity';
import { ClinicWorkspace } from '../../../components/clinic-workspace';
import type { ClinicInfo } from '@petra/contracts';
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
  return <ClinicWorkspace me={me} clinic={(await r.json()) as ClinicInfo} />;
}
