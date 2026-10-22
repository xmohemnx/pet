import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
let client;
try {
  const runtime = new URL(process.env.DATABASE_URL ?? 'invalid:');
  const migration = new URL(process.env.MIGRATION_DATABASE_URL ?? 'invalid:');
  if (
    process.env.APP_ENV !== 'production' ||
    runtime.protocol !== 'postgresql:' ||
    migration.protocol !== 'postgresql:' ||
    migration.searchParams.get('sslmode') !== 'verify-full' ||
    runtime.searchParams.get('sslmode') !== 'verify-full' ||
    runtime.host !== migration.host ||
    runtime.pathname !== migration.pathname ||
    runtime.username === migration.username
  )
    throw new Error('Invalid production migration configuration');
  client = new pg.Client({
    connectionString: migration.toString(),
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(823701)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const root = new URL('../infra/database/migrations/', import.meta.url);
  const applied = (
    await client.query('SELECT name,checksum FROM schema_migrations')
  ).rows;
  const files = (await readdir(root))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  if (applied.some((r) => !files.includes(r.name)))
    throw new Error('Database contains a migration absent from this release');
  for (const name of files) {
    const sql = await readFile(new URL(name, root), 'utf8'),
      checksum = createHash('sha256').update(sql).digest('hex'),
      old = applied.find((r) => r.name === name);
    if (old) {
      if (old.checksum !== checksum)
        throw new Error('Applied migration checksum differs from release');
      continue;
    }
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, checksum],
    );
    console.log('Applied migration:', name);
  }
  await client.query('COMMIT');
  console.log(
    'Production migrations ready; no seed or privileged accounts created.',
  );
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    'Production migration failed; transaction rolled back. Details and credentials withheld.',
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
