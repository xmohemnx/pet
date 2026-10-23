import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const { fetch } = globalThis;

const root = resolve('work/render-static/apps/web/out');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const path = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    );
    let file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + '/')) throw new Error();
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
    });
    response.end(request.method === 'HEAD' ? undefined : readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await fetch(origin + '/api/v1/me')).status, 404);
  assert.equal(
    (await fetch(origin + '/login/', { method: 'POST' })).status,
    405,
  );
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const apiCalls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      apiCalls.push(request.url());
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(origin);
    assert.equal(await page.locator('.preview-banner').count(), 1);
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
  for (const path of ['login', 'register', 'recover', 'reset-password']) {
    await page.goto(`${origin}/${path}/`);
    assert.equal(await page.locator('form input:not([disabled])').count(), 0);
    assert.equal(await page.locator('form button:not([disabled])').count(), 0);
    assert.deepEqual(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
      [],
    );
  }
  await page.goto(origin);
  await page
    .getByRole('link', { name: 'تسجيل الدخول', exact: true })
    .first()
    .click();
  await page.waitForURL('**/login/');
  assert.equal(await page.locator('form input:not([disabled])').count(), 0);
  await page.goto(origin + '/care/');
  assert.match(
    await page.getByRole('heading', { level: 1 }).innerText(),
    /معاينة الواجهة/,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(apiCalls, []);
  console.log(
    'Static preview verified: 320/390/1440px, axe, disabled identity forms, client navigation, unavailable-service notice, no API calls or JavaScript errors.',
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
