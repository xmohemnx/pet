import { it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
// Operator tools share no application imports and never expose environment values.
// @ts-expect-error plain JavaScript operator module
import {
  approvedReview,
  canonical,
  configurationGates,
  capabilities,
} from '../../scripts/production-readiness.mjs';
it('يفشل مغلقاً للإعداد المحلي ولا يطبع الأسرار في التقرير', () => {
  const secret = 'private-fixture-value-that-must-never-be-reported';
  const result = configurationGates(
    {
      APP_ENV: 'local',
      BETTER_AUTH_SECRET: secret,
      DATABASE_URL: `postgresql://person:${secret}@localhost/db`,
    },
    'a'.repeat(40),
  );
  expect(result.configurationReady).toBe(false);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(
    result.checks.find(
      (c: { code: string }) => c.code === 'INDEPENDENT_SECURITY_REVIEW',
    )?.status,
  ).toBe('blocked');
  expect(Object.values(capabilities).some((v) => v === false)).toBe(true);
});
it('لا يقبل مرسل Resend التجريبي كتهيئة بريد إطلاق عام', () => {
  const mailStatus = (from: string) =>
    configurationGates(
      {
        MAIL_MODE: 'resend',
        RESEND_API_KEY: 'private-test-credential',
        MAIL_FROM: from,
      },
      'a'.repeat(40),
    ).checks.find(
      (c: { code: string }) => c.code === 'MAIL_PROVIDER_CONFIGURED',
    )?.status;
  expect(mailStatus('Petra <onboarding@resend.dev>')).toBe('blocked');
  expect(mailStatus('Petra <sender@petra.test>')).toBe('blocked');
  expect(mailStatus('Petra <sender@example.org>')).toBe('passed');
});
it('يربط تقرير التدقيق بتوقيع المراجع والنسخة والصلاحية والمجالات المطلوبة', () => {
  const keys = generateKeyPairSync('ed25519'),
    commit = 'a'.repeat(40),
    now = Date.now();
  const payload = {
    reviewer: 'مراجع اختبار مستقل وهمي',
    status: 'approved',
    releaseCommit: commit,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 86400000).toISOString(),
    scopes: ['identity', 'medical', 'money', 'media', 'realtime', 'deployment'],
  };
  const report = {
    payload,
    signature: sign(
      null,
      Buffer.from(canonical(payload)),
      keys.privateKey,
    ).toString('base64'),
  };
  const key = keys.publicKey.export({ type: 'spki', format: 'pem' });
  expect(approvedReview(report, key, commit, now)).toBe(true);
  expect(approvedReview(report, key, 'b'.repeat(40), now)).toBe(false);
  expect(approvedReview(report, key, commit, now + 2 * 86400000)).toBe(false);
  expect(
    approvedReview(
      { ...report, payload: { ...payload, reviewer: 'شخص آخر' } },
      key,
      commit,
      now,
    ),
  ).toBe(false);
  expect(
    approvedReview(
      report,
      generateKeyPairSync('ed25519').publicKey.export({
        type: 'spki',
        format: 'pem',
      }),
      commit,
      now,
    ),
  ).toBe(false);
});
