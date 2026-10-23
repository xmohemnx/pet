import { spawn } from 'node:child_process';
const { fetch, AbortSignal } = globalThis;

const secretNames = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'REDIS_URL',
  'BETTER_AUTH_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SMTP_PASSWORD',
  'PETRA_S3_SECRET_ACCESS_KEY',
  'PETRA_MEDIA_ENCRYPTION_KEY',
];
if (
  process.env.PETRA_WEB_PREVIEW !== 'true' ||
  process.env.PETRA_DEMO_MODE === 'true' ||
  process.env.API_BASE_URL ||
  secretNames.some((name) => process.env[name])
)
  throw new Error(
    'Preview requires its isolation flag and no backend credentials',
  );

const child = spawn(process.execPath, ['apps/web/server.js'], {
  stdio: 'inherit',
  env: process.env,
});
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
  });
child.on('error', () => {
  stopping = true;
  console.error('Preview web process could not start');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  const expectedShutdown = stopping;
  stopping = true;
  process.exitCode = process.exitCode || code || (expectedShutdown ? 0 : 1);
});

// Verify the actual deployed artifact over loopback without logging page data.
const base = `http://127.0.0.1:${Number(process.env.PORT || 10000)}`;
let ready = false;
for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
    if (
      response.status === 200 &&
      response.headers.get('x-robots-tag')?.includes('noindex') &&
      (await response.text()).includes('معاينة واجهة Petra')
    ) {
      ready = true;
      break;
    }
  } catch {
    // The server may still be binding its port.
  }
  await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
}
try {
  if (!ready) throw new Error('Preview did not become ready');
  for (const method of ['GET', 'POST']) {
    const response = await fetch(base + '/api/v1/auth/get-session', {
      method,
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 503) throw new Error('Preview API guard failed');
  }
  const login = await fetch(base + '/login', {
    signal: AbortSignal.timeout(5000),
  });
  const loginHtml = await login.text();
  if (
    login.status !== 200 ||
    !loginHtml.includes('الإرسال غير مفعّل') ||
    !loginHtml.includes('disabled')
  )
    throw new Error('Preview login guard failed');
  console.log(
    'Petra preview verified: homepage=200, login=200 with disabled forms, API GET/POST=503, noindex enabled.',
  );
} catch {
  console.error('Preview verification failed; no backend operations enabled');
  process.exitCode = 1;
  child.kill('SIGTERM');
}
