import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
if (
  args.some(
    (arg) => arg !== '--apply' && arg !== '--dry-run' && arg !== limitArg,
  ) ||
  (args.includes('--apply') && args.includes('--dry-run'))
)
  throw new Error(
    'Usage: pnpm media:backfill-hls [--dry-run|--apply] [--limit=1..100]',
  );
try {
  loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  // Container operators inject the private environment without a source .env.
  if (error.code !== 'ENOENT') throw error;
}
const monorepo = new URL('../apps/api/dist/apps/api/src/', import.meta.url);
const compiled = existsSync(monorepo)
  ? monorepo
  : new URL('../dist/apps/api/src/', import.meta.url);
const { backfillHls } = await import(new URL('media/backfill.js', compiled));
const { database } = await import(new URL('database.js', compiled));
try {
  const result = await backfillHls(
    limitArg ? Number(limitArg.slice(8)) : 10,
    args.includes('--apply'),
  );
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally {
  await database.end();
}
