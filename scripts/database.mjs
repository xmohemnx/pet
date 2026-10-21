import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL مطلوبة؛ انسخ .env.example للتطوير المحلي');
const url = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
  !url.pathname.startsWith('/petra_')
)
  throw new Error('هذه الأداة مخصصة لقاعدة Petra المحلية فقط');
const client = new pg.Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  const action = process.argv[2];
  if (action === 'migrate') {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(823701)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir('infra/database/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(`infra/database/migrations/${name}`, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name=$1',
        [name],
      );
      if (existing.rowCount) {
        assert.equal(
          existing.rows[0].checksum,
          checksum,
          'لا تعدل migration مطبقة',
        );
        continue;
      }
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
        [name, checksum],
      );
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
    console.log('Migrations ready');
  } else if (action === 'seed') {
    await client.query('BEGIN');
    await client.query(
      "INSERT INTO users(id,display_name) VALUES ('00000000-0000-4000-8000-000000000001','مستخدم عرض محلي') ON CONFLICT DO NOTHING",
    );
    await client.query(
      "INSERT INTO clinics(id,name) VALUES ('00000000-0000-4000-8000-000000000002','عيادة توضيحية غير حقيقية') ON CONFLICT DO NOTHING",
    );
    await client.query(
      "INSERT INTO clinic_storefronts(id,clinic_id,slug) VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','local-demo') ON CONFLICT DO NOTHING",
    );
    await client.query('COMMIT');
    console.log(
      'Local deterministic seed ready (no login accounts or privileges)',
    );
  } else if (action === 'test') {
    const roles = await client.query(
      "SELECT enumlabel FROM pg_enum WHERE enumtypid='workspace_persona'::regtype",
    );
    assert.equal(roles.rowCount, 5);
    assert.deepEqual(
      roles.rows.map((r) => r.enumlabel),
      ['customer', 'doctor', 'clinic_member', 'driver', 'platform_admin'],
    );
    await client.query('BEGIN');
    await client.query('SAVEPOINT missing_clinic');
    await assert.rejects(
      client.query(
        "INSERT INTO clinic_storefronts(id,clinic_id,slug) VALUES ('00000000-0000-4000-8000-000000000004',NULL,'invalid')",
      ),
      { code: '23502' },
    );
    await client.query('ROLLBACK TO SAVEPOINT missing_clinic');
    await assert.rejects(
      client.query(
        "INSERT INTO clinic_storefronts(id,clinic_id,slug) VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000099','invalid')",
      ),
      { code: '23503' },
    );
    await client.query('ROLLBACK');
    console.log(
      'PASS: exactly five personas; storefront requires clinic; unknown clinic rejected (3 checks)',
    );
  } else throw new Error('Expected migrate, seed, or test');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
