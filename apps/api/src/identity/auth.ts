import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import nodemailer from 'nodemailer';
import { database } from '../database.js';
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3000';
const originUrl = new URL(origin);
if (originUrl.origin !== origin)
  throw new Error('APP_ORIGIN يجب أن يكون origin دون مسار');
if (
  originUrl.protocol !== 'https:' &&
  !['localhost', '127.0.0.1'].includes(originUrl.hostname)
)
  throw new Error('HTTPS required outside loopback development');
if (
  !process.env.BETTER_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET.length < 32
)
  throw new Error(
    'BETTER_AUTH_SECRET مطلوبة؛ نفذ node scripts/prepare-env.mjs محليًا',
  );
if (!['local', 'production'].includes(process.env.APP_ENV || ''))
  throw new Error('APP_ENV must explicitly be local or production');
const local = process.env.APP_ENV === 'local';
if (local && !['localhost', '127.0.0.1'].includes(originUrl.hostname))
  throw new Error('Local sandbox requires a loopback APP_ORIGIN');
if (!local && originUrl.protocol !== 'https:')
  throw new Error('Production identity requires HTTPS');
if (!local) {
  if (process.env.PETRA_DEMO_MODE === 'true')
    throw new Error('Demo mode is forbidden in production');
  if (
    process.env.BETTER_AUTH_SECRET.length < 48 ||
    /^(test|change|secret|example)/i.test(process.env.BETTER_AUTH_SECRET)
  )
    throw new Error('Production requires a strong generated signing secret');
  const pg = new URL(process.env.DATABASE_URL ?? 'invalid:');
  const redis = new URL(process.env.REDIS_URL ?? 'invalid:');
  if (
    pg.protocol !== 'postgresql:' ||
    pg.searchParams.get('sslmode') !== 'verify-full' ||
    redis.protocol !== 'rediss:' ||
    !redis.password ||
    pg.password === 'petra_local_only'
  )
    throw new Error(
      'Production databases require verified PostgreSQL TLS, authenticated Redis TLS, and private credentials',
    );
}
if (
  !local &&
  (process.env.MAIL_MODE !== 'smtp' ||
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD)
)
  throw new Error('Production SMTP is not configured');
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === 'true',
  requireTLS: !local && process.env.SMTP_SECURE !== 'true',
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});
export async function sendMail(to: string, subject: string, text: string) {
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'Petra <hello@petra.test>',
    to,
    subject,
    text,
  });
}
export const auth = betterAuth({
  appName: 'Petra',
  baseURL: origin,
  basePath: '/api/v1/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database,
  trustedOrigins: [origin],
  user: { modelName: 'auth_users' },
  session: {
    modelName: 'auth_sessions',
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  account: { modelName: 'auth_accounts' },
  verification: { modelName: 'auth_verifications' },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendMail(
        user.email,
        'Petra — استعادة كلمة المرور',
        `لاستعادة كلمة المرور افتح الرابط التالي:\n${url}\nإذا لم تطلب الاستعادة تجاهل الرسالة.`,
      ),
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(
        user.email,
        'Petra — تأكيد البريد الإلكتروني',
        `مرحبًا،\nلتأكيد بريدك في Petra افتح الرابط التالي:\n${url}\nإذا لم تنشئ الحساب تجاهل الرسالة.`,
      ),
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ['x-petra-client-ip'] },
    database: { generateId: 'uuid' },
    useSecureCookies: originUrl.protocol === 'https:',
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    modelName: 'auth_rate_limits',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 5 },
    },
  },
  plugins: [
    twoFactor({
      issuer: 'Petra',
      trustDeviceMaxAge: 0,
      accountLockout: {
        enabled: true,
        maxFailedAttempts: 5,
        durationSeconds: 900,
      },
      schema: { twoFactor: { modelName: 'auth_two_factors' } },
    }),
  ],
});
export { origin };
