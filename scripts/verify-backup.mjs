import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import pg from 'pg';
loadEnvFile(new URL('../.env', import.meta.url));
const source = new URL(process.env.DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(source.hostname) ||
  !/^\/petra_[a-z0-9_]+$/.test(source.pathname)
)
  throw new Error('Backup verification is local petra databases only');
const name = `petra_restorecheck_${process.pid}`,
  sourceName = source.pathname.slice(1),
  directory = resolve(
    process.env.PETRA_BACKUP_ROOT ?? '.data/backups',
    `verify-${process.pid}`,
  );
const owner = new pg.Client({ connectionString: source.toString() });
await owner.connect();
let created = false,
  clone;
function command(args, input) {
  const r = spawnSync(
    'docker',
    ['exec', ...(input ? ['-i'] : []), 'petra-postgres-1', ...args],
    { input, maxBuffer: 128 * 1024 * 1024 },
  );
  if (r.status !== 0)
    throw new Error('Local PostgreSQL backup/restore command failed');
  return r.stdout;
}
try {
  await owner.query(`CREATE DATABASE "${name}"`);
  created = true;
  await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await owner.query('SELECT pg_export_snapshot() id')).rows[0]
    .id;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dump = command([
    'pg_dump',
    '-U',
    'petra',
    '-d',
    sourceName,
    '-Fc',
    `--snapshot=${snapshot}`,
  ]);
  writeFileSync(join(directory, 'database.dump'), dump, { mode: 0o600 });
  const tables = (
    await owner.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  const before = {};
  for (const table of tables) {
    if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Unexpected table');
    before[table] = (
      await owner.query(
        `SELECT count(*)::text count,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) hash FROM "${table}" t`,
      )
    ).rows[0];
  }
  await owner.query('COMMIT');
  command(['pg_restore', '-U', 'petra', '-d', name, '--exit-on-error'], dump);
  const target = new URL(source);
  target.pathname = `/${name}`;
  clone = new pg.Client({ connectionString: target.toString() });
  await clone.connect();
  for (const table of tables) {
    const actual = (
      await clone.query(
        `SELECT count(*)::text count,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) hash FROM "${table}" t`,
      )
    ).rows[0];
    if (JSON.stringify(before[table]) !== JSON.stringify(actual))
      throw new Error(`Restore mismatch: ${table}`);
  }
  const mediaRoot = resolve(process.env.PETRA_MEDIA_ROOT ?? '.data/media');
  const files = (
    await clone.query(
      "SELECT storage_key FROM media_assets WHERE status='ready'",
    )
  ).rows;
  mkdirSync(join(directory, 'media'), { mode: 0o700 });
  for (const f of files) {
    if (!/^[a-f0-9-]{36}\.(webp|mp4)$/.test(f.storage_key))
      throw new Error('Unsafe asset key');
    const p = join(mediaRoot, f.storage_key);
    if (!existsSync(p))
      throw new Error('Ready media asset missing during backup');
    const dest = join(directory, 'media', f.storage_key);
    copyFileSync(p, dest);
    const hash = (b) => createHash('sha256').update(b).digest('hex');
    if (hash(readFileSync(p)) !== hash(readFileSync(dest)))
      throw new Error('Media backup mismatch');
  }
  const expectedTriggers = [
    'journal_immutable',
    'journal_line_immutable',
    'journal_balance',
    'encounter_immutable',
    'audit_append_only',
    'checkout_snapshot_immutable',
    'clinic_order_snapshot_immutable',
    'order_line_snapshot_immutable',
    'checkout_price_balance',
    'clinic_order_price_balance',
    'line_price_balance',
    'coupon_terms_immutable',
    'appointment_shared_capacity',
    'grooming_shared_capacity',
    'grooming_snapshot_immutable',
    'grooming_photo_private',
    'social_grooming_photo_guard',
    'catalog_grooming_photo_guard',
    'storefront_grooming_photo_guard',
    'grooming_photos_immutable',
    'grooming_reviews_immutable',
    'care_article_revision_immutable',
    'care_article_review_immutable',
    'care_correction_immutable',
    'care_plan_terms_immutable',
    'care_plan_entitlements_immutable',
    'care_subscription_snapshot_immutable',
    'care_subscription_entitlements_immutable',
    'care_subscription_events_immutable',
    'care_plan_entitlements_balance',
    'care_plan_terms_balance',
    'care_subscription_usage_balance',
    'care_usage_balance',
    'care_subscription_terms_balance',
  ];
  const triggerCount = (
    await clone.query(
      "SELECT count(*)::int count FROM pg_trigger WHERE tgname=ANY($1::text[]) AND tgenabled<>'D'",
      [expectedTriggers],
    )
  ).rows[0].count;
  if (triggerCount !== expectedTriggers.length)
    throw new Error('Restore missed database protection triggers');
  const capacity = (
    await clone.query(
      "SELECT count(*)::int n FROM pg_constraint WHERE conrelid='clinic_booking_occupancy'::regclass AND contype='x'",
    )
  ).rows[0].n;
  const generated = (
    await clone.query(
      "SELECT attgenerated FROM pg_attribute WHERE attrelid='order_lines'::regclass AND attname='total_minor'",
    )
  ).rows[0]?.attgenerated;
  if (capacity !== 3 || generated !== 's')
    throw new Error('Restore missed capacity or generated pricing protections');
  const result = {
    status: 'verified',
    tables: tables.length,
    readyMedia: files.length,
    protectionTriggers: triggerCount,
  };
  writeFileSync(
    join(directory, 'verification.json'),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
} finally {
  await clone?.end();
  if (created) await owner.query(`DROP DATABASE "${name}" WITH(FORCE)`);
  await owner.end();
  if (process.env.PETRA_KEEP_VERIFIED_BACKUP !== 'true')
    rmSync(directory, { recursive: true, force: true });
}
