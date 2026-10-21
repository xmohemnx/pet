import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

test('إعداد الإنتاج يرفض الوضع التجريبي والمفاتيح الضعيفة واتصالات البيانات غير المشفرة', () => {
  const secret = randomBytes(48).toString('base64url');
  const env = {
    ...process.env,
    APP_ENV: 'production',
    APP_ORIGIN: 'https://petra.example',
    BETTER_AUTH_SECRET: secret,
    PETRA_DEMO_MODE: 'false',
    MAIL_MODE: 'smtp',
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'fixture-only',
    SMTP_PASSWORD: secret,
    DATABASE_URL: `postgresql://fixture:${secret}@127.0.0.1/petra?sslmode=verify-full`,
    REDIS_URL: `rediss://fixture:${secret}@127.0.0.1:6379`,
  };
  for (const [overrides, message] of [
    [{ PETRA_DEMO_MODE: 'true' }, 'Demo mode is forbidden'],
    [{ BETTER_AUTH_SECRET: 'x'.repeat(32) }, 'strong generated signing secret'],
    [{ REDIS_URL: 'redis://127.0.0.1:6379' }, 'Production databases require'],
    [
      { DATABASE_URL: process.env.DATABASE_URL! },
      'Production databases require',
    ],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./apps/api/dist/apps/api/src/identity/auth.js')",
      ],
      { env: { ...env, ...overrides }, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stderr + result.stdout).not.toContain(secret);
  }
});

test('ملفات البيئة وGit والنسخ لا يمكن تنزيلها من الويب أو API', async ({
  request,
}) => {
  for (const host of ['http://127.0.0.1:3100', 'http://127.0.0.1:4100'])
    for (const path of [
      '/.env',
      '/.env.local',
      '/%252eenv',
      '/.git/config',
      '/apps/web/.env',
      '/backup.dump',
      '/node_modules/package.json',
    ]) {
      const response = await request.get(host + path);
      expect(response.status(), host + path).toBe(404);
      expect(await response.text()).not.toContain('BETTER_AUTH_SECRET=');
      expect(response.headers()['cache-control']).toContain('no-store');
    }
});

test('الطلب غير الموثوق يرفض قبل JSON، والرفع المجهول قبل فك الملف', async ({
  request,
}) => {
  for (const host of ['http://127.0.0.1:3100', 'http://127.0.0.1:4100']) {
    const attack = await request.post(host + '/api/v1/media', {
      headers: {
        Origin: 'https://attacker.invalid',
        'content-type': 'application/json',
      },
      data: '{',
    });
    expect(attack.status()).toBe(403);
    const huge = await request.post(host + '/api/v1/auth/sign-in/email', {
      headers: {
        Origin: 'http://127.0.0.1:3100',
        'content-type': 'application/json',
      },
      data: 'x'.repeat(40000),
    });
    expect(huge.status()).toBe(413);
    const compressed = await request.post(host + '/api/v1/auth/sign-in/email', {
      headers: {
        Origin: 'http://127.0.0.1:3100',
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      },
      data: gzipSync(Buffer.from('{}')),
    });
    expect(compressed.status()).toBe(415);
    const upload = await request.post(host + '/api/v1/media', {
      headers: {
        Origin: 'http://127.0.0.1:3100',
        'content-type': 'application/json',
      },
      data: '{',
    });
    expect(upload.status()).toBe(401);
  }
});

test('CSP برمز متغير يمنع سكربتًا محقونًا ويحافظ على تسجيل الدخول', async ({
  page,
  request,
}) => {
  const response = await page.goto('/login');
  const policy = response!.headers()['content-security-policy']!;
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  const nonce = policy.match(/'nonce-([^']+)'/)![1]!;
  const second = await request.get('/login');
  expect(second.headers()['content-security-policy']).not.toContain(nonce);
  expect(response!.headers()['x-content-type-options']).toBe('nosniff');
  expect(
    await page
      .locator('script[src]')
      .evaluateAll((scripts) =>
        scripts.every((s) => Boolean((s as HTMLScriptElement).nonce)),
      ),
  ).toBe(true);
  // Parser-inserted hostile HTML must be blocked; evaluating a dynamic script
  // from the automation context does not model a stored HTML injection.
  await page.route('**/login', async (route) => {
    const upstream = await route.fetch();
    const html = (await upstream.text()).replace(
      '</head>',
      '<script>window.petraInjected=true</script></head>',
    );
    await route.fulfill({ response: upstream, body: html });
  });
  await page.goto('/login');
  expect(await page.evaluate(() => 'petraInjected' in window)).toBe(false);
  await expect(
    page.getByRole('button', { name: 'تسجيل الدخول', exact: true }),
  ).toBeVisible();
});
