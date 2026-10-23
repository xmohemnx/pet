import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const { fetch, AbortSignal } = globalThis;

const root = resolve('apps/web/.next/standalone');
mkdirSync(resolve(root, 'apps/web/.next'), { recursive: true });
cpSync('apps/web/.next/static', resolve(root, 'apps/web/.next/static'), {
  recursive: true,
});
cpSync('apps/web/public', resolve(root, 'apps/web/public'), {
  recursive: true,
});

let backendRequests = 0;
const backend = createServer((_request, response) => {
  backendRequests++;
  response.writeHead(500).end();
});
await new Promise((done) => backend.listen(0, '127.0.0.1', done));
const reserve = createServer();
await new Promise((done) => reserve.listen(0, '127.0.0.1', done));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const origin = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ENV: 'production',
  PETRA_WEB_PREVIEW: 'true',
  PETRA_DEMO_MODE: 'false',
  APP_ORIGIN: origin,
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  API_BASE_URL: `http://127.0.0.1:${backend.address().port}`,
};
for (const key of [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'REDIS_URL',
  'BETTER_AUTH_SECRET',
  'SMTP_PASSWORD',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PETRA_S3_SECRET_ACCESS_KEY',
  'PETRA_MEDIA_ENCRYPTION_KEY',
])
  delete environment[key];

const web = spawn(process.execPath, ['apps/web/server.js'], {
  cwd: root,
  env: environment,
  stdio: 'ignore',
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) {
        ready = true;
        break;
      }
    } catch {
      // Wait for the standalone server, not a development process.
    }
    await new Promise((done) => globalThis.setTimeout(done, 250));
  }
  assert.ok(ready, 'Standalone preview failed to start');
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(origin + '/api/v1/auth/sign-up/email', {
      method,
      headers: { Origin: origin },
    });
    assert.equal(response.status, 503);
  }
  for (const path of [
    '/.env',
    '/.git/config',
    '/demo/customer',
    '/safety/test',
  ])
    assert.equal((await fetch(origin + path)).status, 404);
  for (const path of ['/app', '/care', '/social', '/marketplace']) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get('location'), origin).pathname,
      '/preview',
    );
  }
  assert.equal(
    (await fetch(origin + '/login', { method: 'POST' })).status,
    405,
  );
  assert.match(
    await (await fetch(origin + '/robots.txt')).text(),
    /Disallow: \//,
  );
  assert.doesNotMatch(
    await (await fetch(origin + '/sitemap.xml')).text(),
    /<loc>/,
  );
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(origin);
    assert.match(await page.locator('.preview-banner').innerText(), /معاينة/);
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    assert.deepEqual(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
      [],
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/login', '/register', '/recover', '/reset-password']) {
    await page.goto(origin + path);
    assert.equal(await page.locator('form input:not([disabled])').count(), 0);
    assert.equal(await page.locator('form button:not([disabled])').count(), 0);
    assert.deepEqual(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
      [],
    );
  }
  await page.goto(origin + '/preview');
  assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
  await page.goto(origin);
  if (process.env.PREVIEW_SCREENSHOT)
    await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT });
  assert.equal(backendRequests, 0, 'Preview contacted a backend');
  console.log(
    'Preview verified: standalone, API isolation, disabled identity forms, redirects, private paths, noindex, 320/390/1440px, axe, zero backend requests.',
  );
} finally {
  await browser?.close();
  if (web.exitCode === null) {
    const exited = new Promise((done) => web.once('exit', done));
    web.kill('SIGTERM');
    const timer = globalThis.setTimeout(() => web.kill('SIGKILL'), 3000);
    await exited;
    globalThis.clearTimeout(timer);
  }
  await new Promise((done) => backend.close(done));
}

delete environment.API_BASE_URL;
const entrypoint = spawn(
  process.execPath,
  [resolve('scripts/start-web-preview.mjs')],
  {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let startupOutput = '';
entrypoint.stdout.on('data', (bytes) => {
  startupOutput = (startupOutput + bytes.toString()).slice(-16000);
});
entrypoint.stderr.on('data', (bytes) => {
  startupOutput = (startupOutput + bytes.toString()).slice(-16000);
});
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupOutput.includes('Petra preview verified:')) break;
    if (entrypoint.exitCode !== null) break;
    await new Promise((done) => globalThis.setTimeout(done, 250));
  }
  assert.ok(startupOutput.includes('Petra preview verified:'), startupOutput);
  console.log('Preview container entrypoint self-check passed.');
} finally {
  if (entrypoint.exitCode === null) {
    const exited = new Promise((done) => entrypoint.once('exit', done));
    entrypoint.kill('SIGTERM');
    const timer = globalThis.setTimeout(() => entrypoint.kill('SIGKILL'), 3000);
    await exited;
    globalThis.clearTimeout(timer);
  }
}
