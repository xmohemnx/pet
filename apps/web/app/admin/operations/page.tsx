import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import { AdminOperations } from '../../../components/admin-operations';
import type { AdoptionListing, RescueCase } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const me = await loadIdentity();
  const [jobs, reports, queue, content] = await Promise.all([
    loadApi<{
      pending: number;
      failed: {
        event_id: string;
        event_type: string;
        attempts: number;
        last_error: string;
      }[];
      media: {
        id: string;
        kind: string;
        status: string;
        failure: string | null;
      }[];
    }>('admin/jobs'),
    loadApi<{ id: string; body: string; reason: string }[]>('admin/moderation'),
    loadApi<{ listings: AdoptionListing[]; cases: RescueCase[] }>(
      'admin/rescue',
    ),
    loadApi<
      {
        slug: string;
        title: string;
        body: string;
        published: boolean;
        version: number;
      }[]
    >('admin/content'),
  ]);
  return (
    <AdminOperations
      me={me}
      initialJobs={jobs}
      initialModeration={reports}
      initialQueue={queue}
      initialContent={content}
    />
  );
}
