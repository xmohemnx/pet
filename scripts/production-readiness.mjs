import { createPublicKey, verify } from 'node:crypto';

// These are implementation facts, not environment switches an operator can enable.
export const capabilities = Object.freeze({
  realtime: true,
  taxonomy: true,
  roadRouting: true,
  automaticDispatch: true,
  transportDisputes: true,
  privateObjectStorage: true,
  antivirus: true,
  voiceAttachments: true,
  adaptiveVideo: true,
  externalLicenseVerification: false,
  realPayment: false,
  legalInvoices: false,
  shippingProvider: false,
  retentionWorkflow: false,
});
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function approvedReview(envelope, publicKey, commit, now = Date.now()) {
  try {
    const p = envelope.payload;
    if (
      !p ||
      p.status !== 'approved' ||
      p.releaseCommit !== commit ||
      !/^([a-f0-9]{40})$/.test(commit) ||
      typeof p.reviewer !== 'string' ||
      p.reviewer.trim().length < 3
    )
      return false;
    if (
      !Array.isArray(p.scopes) ||
      ![
        'identity',
        'medical',
        'money',
        'media',
        'realtime',
        'deployment',
      ].every((s) => p.scopes.includes(s))
    )
      return false;
    const issued = Date.parse(p.issuedAt),
      expiry = Date.parse(p.expiresAt);
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expiry) ||
      issued > now ||
      expiry <= now ||
      expiry - issued > 90 * 86400000 ||
      expiry <= issued
    )
      return false;
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== 'ed25519') return false;
    return verify(
      null,
      Buffer.from(canonical(p)),
      key,
      Buffer.from(envelope.signature, 'base64'),
    );
  } catch {
    return false;
  }
}
export function configurationGates(
  env,
  commit,
  evidence = {},
  implemented = capabilities,
) {
  const checks = [];
  const check = (code, ok) =>
    checks.push({ code, status: ok ? 'passed' : 'blocked' });
  const url = (value) => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };
  const remote = (value) =>
    !!value &&
    !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(value.hostname) &&
    !value.hostname.endsWith('.test') &&
    !value.hostname.endsWith('.invalid');
  const origin = url(env.APP_ORIGIN),
    pg = url(env.DATABASE_URL),
    redis = url(env.REDIS_URL);
  check(
    'PRODUCTION_MODE',
    env.APP_ENV === 'production' && env.PETRA_DEMO_MODE !== 'true',
  );
  check(
    'PUBLIC_HTTPS_ORIGIN',
    remote(origin) &&
      origin.protocol === 'https:' &&
      origin.origin === env.APP_ORIGIN &&
      !origin.username &&
      !origin.password,
  );
  check(
    'AUTH_SECRET',
    typeof env.BETTER_AUTH_SECRET === 'string' &&
      env.BETTER_AUTH_SECRET.length >= 48 &&
      !/^(test|change|secret|example)/i.test(env.BETTER_AUTH_SECRET),
  );
  check(
    'DATABASE_VERIFIED_TLS',
    !!pg &&
      pg.protocol === 'postgresql:' &&
      pg.searchParams.get('sslmode') === 'verify-full' &&
      pg.password.length >= 20,
  );
  check(
    'REDIS_VERIFIED_TLS',
    !!redis && redis.protocol === 'rediss:' && redis.password.length >= 20,
  );
  check(
    'TLS_NOT_BYPASSED',
    env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' &&
      (!env.PGSSLMODE || env.PGSSLMODE === 'verify-full'),
  );
  check(
    'SMTP_CONFIGURED',
    env.MAIL_MODE === 'smtp' &&
      !!env.SMTP_HOST &&
      !['localhost', '127.0.0.1'].includes(env.SMTP_HOST) &&
      !!env.SMTP_USER &&
      !!env.SMTP_PASSWORD &&
      !!env.SMTP_FROM &&
      !/\.(?:test|invalid)>?$/.test(env.SMTP_FROM),
  );
  const storage = url(env.PETRA_S3_ENDPOINT);
  check(
    'PRIVATE_MEDIA_CONFIGURATION',
    !!storage &&
      storage.protocol === 'https:' &&
      !storage.username &&
      !storage.password &&
      !!env.PETRA_S3_BUCKET &&
      env.PETRA_S3_ACCESS_KEY_ID?.length >= 20 &&
      env.PETRA_S3_SECRET_ACCESS_KEY?.length >= 32 &&
      /^[A-Za-z0-9+/]{43}=$/.test(env.PETRA_MEDIA_ENCRYPTION_KEY ?? '') &&
      env.PETRA_CLAMAV_SOCKET?.startsWith('/'),
  );
  check('RELEASE_COMMIT', /^[a-f0-9]{40}$/.test(commit));
  for (const [feature, complete] of Object.entries(implemented))
    check('IMPLEMENTED_' + feature, complete === true);
  check(
    'INDEPENDENT_SECURITY_REVIEW',
    approvedReview(evidence.report, evidence.publicKey, commit),
  );
  check(
    'APPROVED_RETENTION_POLICY',
    evidence.retention?.status === 'approved' &&
      evidence.retention?.releaseCommit === commit &&
      Array.isArray(evidence.retention?.classes) &&
      ['medical', 'finance', 'chat', 'location', 'media', 'backup'].every(
        (name) =>
          evidence.retention.classes.some(
            (c) =>
              c &&
              c.name === name &&
              Number.isSafeInteger(c.days) &&
              c.days >= 1 &&
              c.days <= 36500 &&
              typeof c.legalBasis === 'string' &&
              c.legalBasis.trim(),
          ),
      ),
  );
  return {
    configurationReady: checks.every((c) => c.status === 'passed'),
    checks,
  };
}
