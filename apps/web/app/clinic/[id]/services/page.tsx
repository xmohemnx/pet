import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ClinicExtendedServices } from '../../../../components/clinic-extended-services';
import type {
  ClinicInfo,
  Plan,
  BoardingUnit,
  RescueCase,
} from '@petra/contracts';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity();
  const { id } = await params;
  const base = `clinics/${encodeURIComponent(id)}`;
  const [clinic, initial, services, cases] = await Promise.all([
    loadApi<ClinicInfo>(base),
    loadApi<{
      branches: { id: string; name: string }[];
      sales: {
        id: string;
        name: string;
        subscriptions: number;
        sold_minor: string;
        recognized_minor: string;
      }[];
      plans: Plan[];
      units: BoardingUnit[];
      boarding: {
        id: string;
        pet_name: string;
        unit_name: string;
        starts_on: string;
        ends_on: string;
        status: string;
      }[];
    }>(`${base}/services/management`),
    loadApi<{ id: string; name: string }[]>(`${base}/services`),
    loadApi<RescueCase[]>(`${base}/rescue`),
  ]);
  return (
    <ClinicExtendedServices
      me={me}
      clinic={clinic}
      initial={initial}
      services={services}
      initialCases={cases}
    />
  );
}
