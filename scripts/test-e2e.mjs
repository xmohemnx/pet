import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { rmSync } from 'node:fs';
loadEnvFile(new URL('../.env', import.meta.url));
const base = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('E2E requires local PostgreSQL');
const name = `petra_e2e_${process.pid}`;
const owner = new pg.Client({ connectionString: base.toString() });
await owner.connect();
let created = false;
try {
  await owner.query(`CREATE DATABASE "${name}"`);
  created = true;
  base.pathname = `/${name}`;
  const env = {
    ...process.env,
    DATABASE_URL: base.toString(),
    PETRA_MEDIA_ROOT: `/tmp/petra-media-${process.pid}`,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    APP_ORIGIN: 'http://127.0.0.1:3100',
    APP_ENV: 'local',
    MAIL_MODE: 'local',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  for (const action of ['migrate', 'seed']) {
    const r = spawnSync(
      process.execPath,
      ['--env-file-if-exists=.env', 'scripts/database.mjs', action],
      { stdio: 'inherit', env },
    );
    if (r.status !== 0) throw new Error(`E2E ${action} failed`);
  }
  const r = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    { stdio: 'inherit', env },
  );
  process.exitCode = r.status ?? 1;
} finally {
  if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  rmSync(`/tmp/petra-media-${process.pid}`, { recursive: true, force: true });
  await owner.end();
}
