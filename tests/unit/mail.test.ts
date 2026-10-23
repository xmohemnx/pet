import { afterEach, expect, it, vi } from 'vitest';
import { createMailer } from '../../apps/api/src/identity/mail.js';

const env = {
  APP_ENV: 'production',
  MAIL_MODE: 'resend',
  RESEND_API_KEY: 'private-test-credential',
  MAIL_FROM: 'Petra <sender@example.org>',
};
afterEach(() => vi.restoreAllMocks());

it('يرسل البريد العربي عبر HTTPS بمفتاح ثابت للرسالة دون إعادة محاولة', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () =>
      Response.json({ id: 'provider-message-id' }),
    );
  const send = createMailer(env, request);
  const message = [
    'owner@example.org',
    'تأكيد البريد',
    'رابط تأكيد خاص',
  ] as const;
  await send(...message);
  await send(...message);
  await send(message[0], message[1], 'رابط استعادة مختلف');
  const [url, options] = request.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options).toMatchObject({
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options?.body as string)).toEqual({
    from: env.MAIL_FROM,
    to: [message[0]],
    subject: message[1],
    text: message[2],
  });
  const keys = request.mock.calls.map(([, o]) =>
    new Headers(o?.headers).get('Idempotency-Key'),
  );
  expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[0]);
  expect(request).toHaveBeenCalledTimes(3);
});

it.each([403, 429, 500])(
  'يرفض خطأ المزود %i دون كشف بيانات أو التحول إلى SMTP',
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private-token recipient@example.org', { status }),
      );
    const smtp = vi.fn();
    await expect(
      createMailer(env, request, smtp)('owner@example.org', 'subject', 'token'),
    ).rejects.toThrow(/^Transactional email delivery failed$/);
    expect(request).toHaveBeenCalledTimes(1);
    expect(smtp).not.toHaveBeenCalled();
  },
);

it('يرفض مهلة الشبكة أو استجابة نجاح بلا معرّف دون كشف السبب الخاص', async () => {
  for (const request of [
    vi.fn<typeof fetch>().mockRejectedValue(new Error('private-token')),
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({})),
  ]) {
    await expect(
      createMailer(env, request)('owner@example.org', 'subject', 'token'),
    ).rejects.toThrow(/^Transactional email delivery failed$/);
  }
});

it('يرفض الإعداد الناقص أو المزود المجهول دون إرسال أو بريد محلي بديل', () => {
  const smtp = vi.fn();
  for (const invalid of [
    { APP_ENV: 'production' },
    { APP_ENV: 'production', MAIL_MODE: 'local' },
    { ...env, MAIL_MODE: 'unknown' },
    { ...env, RESEND_API_KEY: '' },
    { ...env, MAIL_FROM: '' },
    { ...env, MAIL_FROM: 'sender@example.org\r\nBcc: other@example.org' },
  ])
    expect(() => createMailer(invalid, globalThis.fetch, smtp)).toThrow();
  expect(smtp).not.toHaveBeenCalled();
});

it('يبقي بريد Mailpit المحلي متاحاً للتطوير فقط', async () => {
  const sendMail = vi.fn().mockResolvedValue({});
  const smtp = vi.fn().mockReturnValue({ sendMail });
  const request = vi.fn<typeof fetch>();
  const send = createMailer(
    { APP_ENV: 'local', MAIL_MODE: 'local' },
    request,
    smtp,
  );
  expect(smtp).toHaveBeenCalledWith(
    expect.objectContaining({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      requireTLS: false,
    }),
  );
  await send('owner@example.org', 'تأكيد', 'رابط');
  expect(sendMail).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});

it('يبقي SMTP مشفراً خارج التطوير مع إعداد المصادقة والمهل', async () => {
  const sendMail = vi.fn().mockResolvedValue({});
  const smtp = vi.fn().mockReturnValue({ sendMail });
  const send = createMailer(
    {
      APP_ENV: 'production',
      MAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.org',
      SMTP_USER: 'sender',
      SMTP_PASSWORD: 'private-test-credential',
      SMTP_FROM: 'Petra <sender@example.org>',
      SMTP_PORT: '587',
    },
    globalThis.fetch,
    smtp,
  );
  expect(smtp).toHaveBeenCalledWith(
    expect.objectContaining({
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'sender', pass: 'private-test-credential' },
      socketTimeout: 10000,
    }),
  );
  await send('owner@example.org', 'تأكيد', 'رابط');
  expect(sendMail).toHaveBeenCalledOnce();
});
