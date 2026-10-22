import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { IdentityShell } from '../../../components/identity-shell';
import { PlatformHeading } from '../../../components/platform-shared';
import {
  RideDisputeCard,
  type DisputeQueue,
} from '../../../components/ride-disputes';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'نزاعات النقل',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity(),
    rows = await loadApi<DisputeQueue>('admin/transport/disputes');
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="مراجعة مفوضة مستقلة"
        title="نزاعات النقل وتسويتها"
      >
        التعويضات اختبارية وتحتاج معداً ومعتمداً مختلفين. لا يمنح الوصول الطبي
        أو الموقع الخاص تلقائياً.
      </PlatformHeading>
      <section className="panel care-section">
        <h2>قائمة النزاعات</h2>
        {!rows.length && <p>لا نزاعات مسجلة.</p>}
        {rows.map((r) => (
          <article key={r.id} className="ride-card">
            <h3>نزاع {r.id.slice(0, 8)}</h3>
            <RideDisputeCard rideId={r.ride_id} review />
          </article>
        ))}
      </section>
    </IdentityShell>
  );
}
