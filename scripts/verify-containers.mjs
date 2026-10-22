// Local image verification only: temporary database, no seed, no public listener.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const { fetch, AbortSignal } = globalThis;

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tag = process.env.PETRA_IMAGE_TAG || 'local-verify';
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(tag))
  throw new Error('Invalid image tag');
const prefix = `petra-image-check-${randomUUID().slice(0, 8)}`;
const dockerEnv = { ...process.env };
for (const name of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnv[name];
const docker = (args) => {
  try {
    return execFileSync(
      'docker',
      ['--host=unix:///var/run/docker.sock', ...args],
      {
        env: dockerEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      },
    ).trim();
  } catch {
    throw new Error(
      'Local image verification command failed; credentials withheld',
    );
  }
};
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function until(check) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* A starting process may refuse connections. */
    }
    await pause(500);
  }
  throw new Error('Container readiness timed out');
}

const checks = [],
  containers = [];
let network = false;
mkdirSync(join(root, '.data'), { recursive: true, mode: 0o700 });
const directory = mkdtempSync(join(root, '.data', 'image-check-'));
const password = randomBytes(32).toString('hex');
const dbName = 'petra_image_test';
const webPort = await freePort(),
  apiPort = await freePort();
const envPath = join(directory, 'runtime.env');
const pgEnvPath = join(directory, 'postgres.env');
writeFileSync(
  pgEnvPath,
  `POSTGRES_USER=petra\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${dbName}\n`,
  { mode: 0o600 },
);
writeFileSync(
  envPath,
  [
    'APP_ENV=local',
    'PETRA_DEMO_MODE=false',
    `APP_ORIGIN=http://127.0.0.1:${webPort}`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
    `DATABASE_URL=postgresql://petra:${password}@postgres:5432/${dbName}`,
    'REDIS_URL=redis://redis:6379',
    'MAIL_MODE=local',
    'API_HOST=0.0.0.0',
    'API_PORT=4000',
    'WORKER_HEALTH_PORT=4002',
    'PETRA_MEDIA_ROOT=/tmp/petra-media',
    'API_BASE_URL=http://api:4000',
    'NO_PROXY=localhost,127.0.0.1,api,postgres,redis',
  ].join('\n') + '\n',
  { mode: 0o600 },
);

const start = (name, args) => {
  const full = `${prefix}-${name}`;
  containers.push(full);
  docker([
    'run',
    '-d',
    '--name',
    full,
    '--label',
    `petra.image-check=${prefix}`,
    '--network',
    prefix,
    ...args,
  ]);
  return full;
};
try {
  docker(['info', '--format', '{{.ServerVersion}}']);
  for (const target of ['api', 'worker', 'web'])
    docker([
      'image',
      'inspect',
      `petra-${target}:${tag}`,
      '--format',
      '{{.Id}}',
    ]);
  docker(['network', 'create', prefix]);
  network = true;
  const postgres = start('postgres', [
    '--network-alias',
    'postgres',
    '--env-file',
    pgEnvPath,
    '-p',
    '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  start('redis', ['--network-alias', 'redis', 'redis:7-alpine']);
  const pgPort = Number(
    docker(['port', postgres, '5432/tcp']).split(':').at(-1),
  );
  const migrationUrl = `postgresql://petra:${password}@127.0.0.1:${pgPort}/${dbName}`;
  await until(async () => {
    // The initdb Unix-socket server can accept pg_isready before TCP is ready.
    const client = new pg.Client({
      connectionString: migrationUrl,
      connectionTimeoutMillis: 1000,
      query_timeout: 1000,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.query('SELECT 1');
      return true;
    } finally {
      await client.end().catch(() => {});
    }
  });
  // Host migration tooling only; this is not a production migration/role/TLS test.
  try {
    execFileSync(process.execPath, ['scripts/database.mjs', 'migrate'], {
      cwd: root,
      env: {
        ...process.env,
        APP_ENV: 'local',
        DATABASE_URL: migrationUrl,
      },
      stdio: 'pipe',
      timeout: 60000,
    });
  } catch {
    throw new Error('Isolated schema migration failed; credentials withheld');
  }
  checks.push('isolated-schema-without-seed');
  const shared = [
    '--read-only',
    '--user',
    '1000:1000',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=256m,uid=1000,gid=1000',
  ];
  const api = start('api', [
    '--network-alias',
    'api',
    ...shared,
    '--env-file',
    envPath,
    '-p',
    `127.0.0.1:${apiPort}:4000`,
    `petra-api:${tag}`,
  ]);
  const worker = start('worker', [
    ...shared,
    '--env-file',
    envPath,
    `petra-worker:${tag}`,
  ]);
  const web = start('web', [
    ...shared,
    '-e',
    'API_BASE_URL=http://api:4000',
    '-e',
    'APP_ENV=local',
    '-e',
    `APP_ORIGIN=http://127.0.0.1:${webPort}`,
    '--tmpfs',
    '/app/apps/web/.next/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000',
    '-p',
    `127.0.0.1:${webPort}:3000`,
    `petra-web:${tag}`,
  ]);
  const origin = `http://127.0.0.1:${webPort}`,
    apiOrigin = `http://127.0.0.1:${apiPort}`;
  await until(
    async () =>
      (
        await fetch(apiOrigin + '/api/v1/ready', {
          signal: AbortSignal.timeout(2000),
        })
      ).ok,
  );
  await until(
    async () =>
      (await fetch(origin + '/login', { signal: AbortSignal.timeout(2000) }))
        .ok,
  );
  await until(
    () =>
      docker([
        'exec',
        worker,
        'node',
        '-e',
        "fetch('http://127.0.0.1:4002/health').then(async r=>{if(!r.ok||(await r.json()).status!=='ready')process.exit(1)})",
      ]) === '',
  );
  checks.push(
    'api-postgres-redis-realtime-ready',
    'worker-health-ready',
    'web-standalone-login',
  );
  const html = await (await fetch(origin)).text();
  const asset = html.match(
    /(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/,
  )?.[1];
  assert.ok(asset);
  assert.equal(
    (await fetch(new URL(asset.replaceAll('&amp;', '&'), origin))).status,
    200,
  );
  assert.equal((await fetch(origin + '/pet-garden.svg')).status, 200);
  checks.push('standalone-static-assets');
  for (const base of [origin, apiOrigin])
    for (const path of ['/.env', '/.git/config'])
      assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(apiOrigin + '/api/v1/me')).status, 401);
  assert.equal((await fetch(apiOrigin + '/api/v1/demo/customer')).status, 404);
  checks.push(
    'private-paths-hidden',
    'anonymous-identity-denied',
    'demo-disabled',
  );
  for (const container of [api, worker, web]) {
    docker([
      'exec',
      container,
      'node',
      '-e',
      "const fs=require('node:fs');if(process.getuid()!==1000||fs.existsSync('/app/.env')||fs.existsSync('/run/secrets/proxy_ca'))process.exit(1);try{fs.writeFileSync('/app/forbidden-write','x');process.exit(1)}catch(e){if(e.code!=='EROFS'&&e.code!=='EACCES')process.exit(1)}",
    ]);
    assert.equal(
      docker([
        'inspect',
        container,
        '--format',
        '{{.HostConfig.ReadonlyRootfs}}',
      ]),
      'true',
    );
  }
  checks.push('non-root-read-only-images-without-env-or-build-ca');
  docker([
    'exec',
    web,
    'node',
    '-e',
    'if(process.env.DATABASE_URL||process.env.BETTER_AUTH_SECRET||process.env.REDIS_URL)process.exit(1)',
  ]);
  checks.push('web-does-not-receive-api-secrets');
  const maintenance = JSON.parse(
    docker([
      'exec',
      api,
      'node',
      'scripts/backfill-hls.mjs',
      '--dry-run',
      '--limit=10',
    ]),
  );
  assert.equal(maintenance.dryRun, true);
  assert.equal(maintenance.candidates, 0);
  checks.push('maintenance-with-injected-env-and-no-source-env-file');
  const gated = docker([
    'exec',
    api,
    'node',
    '-e',
    "const{spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['scripts/production-check.mjs'],{encoding:'utf8'});if(r.status!==1||JSON.parse(r.stdout).status!=='blocked')process.exit(1)",
  ]);
  assert.equal(gated, '');
  checks.push('production-gate-remains-blocked');
  console.log(
    JSON.stringify({
      status: 'verified-local-images',
      checks,
      notice:
        'Local container smoke test only; no production TLS, provider approval, deployment, or production load claim.',
    }),
  );
} finally {
  for (const container of containers.reverse()) {
    try {
      docker(['rm', '-f', '-v', container]);
    } catch {
      /* Limit cleanup to this run's own names. */
    }
  }
  if (network) {
    try {
      docker(['network', 'rm', prefix]);
    } catch {
      /* No shared resources are removed. */
    }
  }
  rmSync(directory, { recursive: true, force: true });
}
