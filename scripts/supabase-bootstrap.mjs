import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Emits SQL only: no connection, credentials, account creation, or seed data.
// Apply once to an empty project inside one transaction (e.g. apply_migration).
const root = new URL('../infra/database/migrations/', import.meta.url);
const files = (await readdir(root))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
if (!files.length) throw new Error('No application migrations found');
const statements = [
  '-- Petra private Supabase bootstrap; requires one enclosing transaction.',
  'SELECT pg_advisory_xact_lock(823701);',
  'CREATE SCHEMA IF NOT EXISTS extensions;',
  'CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;',
  'CREATE ROLE petra_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;',
  'CREATE ROLE petra_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;',
  'GRANT petra_migrator TO CURRENT_USER;',
  'GRANT petra_runtime TO CURRENT_USER WITH INHERIT FALSE;',
  'CREATE SCHEMA petra AUTHORIZATION petra_migrator;',
  'REVOKE ALL ON SCHEMA petra FROM PUBLIC, anon, authenticated;',
  'GRANT USAGE ON SCHEMA extensions TO petra_migrator, petra_runtime;',
  'ALTER ROLE petra_migrator SET search_path = petra, extensions;',
  'ALTER ROLE petra_runtime SET search_path = petra, extensions;',
  'SET LOCAL ROLE petra_migrator;',
  'SET LOCAL search_path = petra, extensions;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA petra REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;',
  'CREATE TABLE schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());',
];
for (const name of files) {
  const sql = await readFile(new URL(name, root), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  statements.push(
    `-- Original migration: ${name}`,
    sql,
    `INSERT INTO schema_migrations(name,checksum) VALUES ('${name}','${checksum}');`,
  );
}
statements.push(
  await readFile(
    new URL('../infra/database/supabase/hardening.sql', import.meta.url),
    'utf8',
  ),
  'RESET ROLE;',
);
process.stdout.write(statements.join('\n') + '\n');
