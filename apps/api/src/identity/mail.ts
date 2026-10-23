import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

export function createMailer(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = globalThis.fetch,
  smtpTransport: typeof nodemailer.createTransport = nodemailer.createTransport,
) {
  const local = env.APP_ENV === 'local';
  const mode = env.MAIL_MODE ?? (local ? 'smtp' : '');
  if (mode === 'resend') {
    const key = env.RESEND_API_KEY;
    const from = env.MAIL_FROM;
    if (!key || !from || /[\r\n]/.test(key + from))
      throw new Error('Resend requires RESEND_API_KEY and MAIL_FROM');
    return async (to: string, subject: string, text: string) => {
      try {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': createHash('sha256')
              .update(JSON.stringify([from, to, subject, text]))
              .digest('hex'),
          },
          body: JSON.stringify({ from, to: [to], subject, text }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Provider rejected email');
        }
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== 'object' ||
          !('id' in result) ||
          typeof result.id !== 'string' ||
          !result.id
        )
          throw new Error('Provider did not acknowledge email');
      } catch {
        // Provider errors can contain recipient addresses, tokens or credentials.
        throw new Error('Transactional email delivery failed');
      }
    };
  }
  if (
    (mode !== 'smtp' && !(local && mode === 'local')) ||
    (!local &&
      (!env.SMTP_HOST ||
        !env.SMTP_USER ||
        !env.SMTP_PASSWORD ||
        !env.SMTP_FROM))
  )
    throw new Error('Transactional email provider is not configured');
  const transport = smtpTransport({
    host: env.SMTP_HOST || '127.0.0.1',
    port: Number(env.SMTP_PORT || 1025),
    secure: env.SMTP_SECURE === 'true',
    requireTLS: !local && env.SMTP_SECURE !== 'true',
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return async (to: string, subject: string, text: string) => {
    try {
      await transport.sendMail({
        from: env.SMTP_FROM || 'Petra <hello@petra.test>',
        to,
        subject,
        text,
      });
    } catch {
      throw new Error('Transactional email delivery failed');
    }
  };
}
