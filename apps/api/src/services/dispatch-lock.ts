import type { PoolClient } from 'pg';
export async function dispatchLock(db: PoolClient) {
  await db.query('SELECT pg_advisory_xact_lock(823703)');
}
