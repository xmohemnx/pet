import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as OTPAuth from 'otpauth';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const backend = 'http://127.0.0.1:4100/api/v1/';
const suffix = randomBytes(6).toString('hex');
const password = `Local-${randomBytes(18).toString('base64url')}9a!`;
const emails = {
  a: `owner-a-${suffix}@petra.test`,
  b: `owner-b-${suffix}@petra.test`,
  admin: `reviewer-${suffix}@petra.test`,
  pending: `pending-${suffix}@petra.test`,
  ui: `ui-${suffix}@petra.test`,
};
let a: APIRequestContext,
  b: APIRequestContext,
  admin: APIRequestContext,
  pending: APIRequestContext;
let userB: string;
let appA: string, appB: string;
let clinicA: string, clinicB: string;
let totp: OTPAuth.TOTP;
let backupCodes: string[];
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function mailLink(email: string, subject: string) {
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch(
            `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        const message = (list.messages || []).find((m: { Subject: string }) =>
          m.Subject.includes(subject),
        );
        if (!message) return false;
        const body = await (
          await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)
        ).json();
        found = String(body.Text).match(/https?:\/\/[^\s<>]+/)?.[0];
        return !!found;
      },
      {
        timeout: 10000,
        message: 'Expected local verification/reset email to arrive',
      },
    )
    .toBe(true);
  return found!;
}
async function register(
  context: APIRequestContext,
  email: string,
  name: string,
  verify = true,
  accountType = 'customer',
) {
  const r = await context.post(`${backend}auth/sign-up/email`, {
    data: {
      name,
      email,
      password,
      accountType,
      callbackURL: '/login?verified=1',
    },
  });
  expect(r.status()).toBe(200);
  if (verify) {
    const link = await mailLink(email, 'تأكيد');
    const verified = await context.get(
      link.replace(origin, 'http://127.0.0.1:4100'),
      { maxRedirects: 0 },
    );
    expect([200, 302]).toContain(verified.status());
  }
}
async function signIn(context: APIRequestContext, email: string) {
  return context.post(`${backend}auth/sign-in/email`, {
    data: { email, password },
  });
}
async function submit(context: APIRequestContext, kind: string, name: string) {
  const current = await (await context.get(`${backend}me`)).json();
  if (current.user.accountType !== kind) {
    const request = await context.post(`${backend}me/account-type-requests`, {
      data: {
        targetType: kind,
        reason: 'تغيير إداري لنوع حساب fixture لا جمع صلاحيات',
      },
    });
    expect(request.status()).toBe(201);
    const id = (await request.json()).id;
    expect(
      (
        await admin.post(
          `${backend}admin/account-type-requests/${id}/decision`,
          {
            data: {
              decision: 'approved',
              reason: 'موافقة اختبار محلية مع إلغاء الصلاحيات السابقة',
              version: 1,
            },
          },
        )
      ).status(),
    ).toBe(201);
    expect((await signIn(context, current.user.email)).status()).toBe(200);
  }
  const r = await context.post(`${backend}applications`, {
    data: {
      kind,
      displayName: name,
      registrationNumber: `LOCAL-${suffix}`,
      notes: 'بيانات اختبار محلي فقط، لا ترخيص فعلي',
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).id as string;
}
async function approve(id: string) {
  const r = await admin.post(`${backend}admin/applications/${id}/decision`, {
    data: {
      decision: 'approved',
      reason: 'مراجعة fixture محلية للاختبار؛ لا اعتماد مهني حقيقي',
      version: 1,
    },
  });
  expect(r.status()).toBe(201);
  return await r.json();
}

test.describe.serial('هوية حقيقية وعضويات معزولة', () => {
  test.beforeAll(async () => {
    if (!/^\/petra_e2e_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname))
      throw new Error('Isolated test DB required');
    await db.query('DELETE FROM auth_rate_limits');
    const options = { extraHTTPHeaders: { Origin: origin } };
    [a, b, admin, pending] = await Promise.all([
      playwrightRequest.newContext(options),
      playwrightRequest.newContext(options),
      playwrightRequest.newContext(options),
      playwrightRequest.newContext(options),
    ]);
    await register(a, emails.a, 'سارة الاختبار', true, 'clinic');
    await register(b, emails.b, 'علي الاختبار', true, 'clinic');
    await register(admin, emails.admin, 'مراجع محلي', true, 'doctor');
    await register(pending, emails.pending, 'بانتظار التحقق', false);
    expect((await signIn(a, emails.a)).status()).toBe(200);
    expect((await signIn(b, emails.b)).status()).toBe(200);
    expect((await signIn(admin, emails.admin)).status()).toBe(200);
    userB = (await (await b.get(`${backend}me`)).json()).user.id;
  });
  test.afterAll(async () => {
    await Promise.all([
      a?.dispose(),
      b?.dispose(),
      admin?.dispose(),
      pending?.dispose(),
    ]);
    await db.end();
  });
  test('اختيار النوع لا يمنح اعتماداً، والبريد غير الموثق وحقول الامتياز مرفوضة', async () => {
    const me = await (await a.get(`${backend}me`)).json();
    expect(me.user.accountType).toBe('clinic');
    expect(me.workspaces).toEqual([]);
    const denied = await a.post(`${backend}auth/sign-up/email`, {
      data: {
        name: 'حساب امتياز',
        email: `evil-${suffix}@petra.test`,
        password,
        role: 'platform_admin',
      },
    });
    expect(denied.status()).toBe(400);
    expect((await signIn(pending, emails.pending)).status()).toBe(403);
    expect((await pending.get(`${backend}me`)).status()).toBe(401);
    expect((await a.get(`${backend}admin/applications`)).status()).toBe(403);
    const originAttack = await a.post(`${backend}me/active-workspace`, {
      headers: { Origin: 'https://attacker.invalid' },
      data: { workspaceId: 'customer' },
    });
    expect(originAttack.status()).toBe(403);
  });
  test('TOTP إلزامي للمراجع والجلسات السابقة تُلغى عند منحه', async () => {
    const enable = await admin.post(`${backend}auth/two-factor/enable`, {
      data: { password, method: 'totp' },
    });
    expect(enable.status()).toBe(200);
    const setup = await enable.json();
    totp = OTPAuth.URI.parse(setup.totpURI) as OTPAuth.TOTP;
    backupCodes = setup.backupCodes;
    const verified = await admin.post(`${backend}auth/two-factor/verify-totp`, {
      data: { code: totp.generate(), trustDevice: false },
    });
    expect(verified.status()).toBe(200);
    execFileSync(
      process.execPath,
      ['--env-file=.env', 'scripts/bootstrap-admin.mjs', emails.admin],
      {
        env: { ...process.env, PETRA_ALLOW_LOCAL_ADMIN_BOOTSTRAP: 'true' },
        stdio: 'pipe',
      },
    );
    expect((await admin.get(`${backend}me`)).status()).toBe(401);
    const login = await signIn(admin, emails.admin);
    expect((await login.json()).twoFactorRedirect).toBe(true);
    expect((await admin.get(`${backend}admin/applications`)).status()).toBe(
      401,
    );
    expect(
      (
        await admin.post(`${backend}auth/two-factor/verify-totp`, {
          data: { code: totp.generate(), trustDevice: false },
        })
      ).status(),
    ).toBe(200);
    expect((await admin.get(`${backend}admin/applications`)).status()).toBe(
      200,
    );
    expect(
      (
        await admin.post(`${backend}auth/two-factor/disable`, {
          data: { password },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.post(`${backend}auth/two-factor/verify-totp`, {
          data: { code: totp.generate(), trustDevice: true },
        })
      ).status(),
    ).toBe(400);
  });
  test('اعتماد العيادات يُنشئ عضويات الخادم ويمنع المراجع من اعتماد نفسه والتكرار', async () => {
    appA = await submit(a, 'clinic', 'عيادة الاختبار أ');
    appB = await submit(b, 'clinic', 'عيادة الاختبار ب');
    const self = await submit(admin, 'doctor', 'المراجع كطبيب تجريبي');
    expect(
      (
        await admin.post(`${backend}admin/applications/${self}/decision`, {
          data: {
            decision: 'approved',
            reason: 'محاولة اعتماد ذاتي للاختبار فقط',
            version: 1,
          },
        })
      ).status(),
    ).toBe(403);
    const ca = await approve(appA);
    const cb = await approve(appB);
    clinicA = ca.clinic_id;
    clinicB = cb.clinic_id;
    expect(
      (
        await admin.post(`${backend}admin/applications/${appA}/decision`, {
          data: {
            decision: 'approved',
            reason: 'إعادة القرار لاختبار منع التكرار',
            version: 1,
          },
        })
      ).status(),
    ).toBe(409);
    const member = await (
      await a.get(`${backend}clinics/${clinicA}/members`)
    ).json();
    expect(member).toHaveLength(1);
    expect(member[0].capabilities).toEqual(['clinic_admin']);
    const branch = await a.post(`${backend}clinics/${clinicA}/branches`, {
      data: { name: 'الفرع الأول', city: 'بغداد' },
    });
    expect(branch.status()).toBe(201);
    expect((await b.get(`${backend}clinics/${clinicA}`)).status()).toBe(403);
    expect((await a.get(`${backend}clinics/${clinicB}/members`)).status()).toBe(
      403,
    );
    expect(
      (
        await a.post(`${backend}me/active-workspace`, {
          data: { workspaceId: `clinic:${clinicB}` },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.post(`${backend}me/active-workspace`, {
          data: { workspaceId: `clinic:${clinicA}` },
        })
      ).status(),
    ).toBe(201);
    expect(
      (await (await a.get(`${backend}me`)).json()).activeWorkspace.clinicId,
    ).toBe(clinicA);
  });
  test('الدعوة لبريد بعينه وتُقبل مرة واحدة، والسحب يوقف الوصول فورًا', async () => {
    const invited = await a.post(`${backend}clinics/${clinicA}/invitations`, {
      data: { email: emails.b, capabilities: ['receptionist'] },
    });
    expect(invited.status()).toBe(201);
    const id = (await invited.json()).id;
    expect(
      (
        await admin.post(`${backend}invitations/${id}/accept`, { data: {} })
      ).status(),
    ).toBe(404);
    const both = await Promise.all([
      b.post(`${backend}invitations/${id}/accept`, { data: {} }),
      b.post(`${backend}invitations/${id}/accept`, { data: {} }),
    ]);
    expect(both.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect((await b.get(`${backend}clinics/${clinicA}`)).status()).toBe(200);
    expect((await b.get(`${backend}clinics/${clinicA}/members`)).status()).toBe(
      403,
    );
    expect(
      (
        await b.post(`${backend}clinics/${clinicA}/branches`, {
          data: { name: 'محاولة', city: 'بغداد' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await b.post(`${backend}clinics/${clinicA}/invitations`, {
          data: { email: emails.admin, capabilities: ['clinic_admin'] },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.patch(`${backend}clinics/${clinicA}/members/${userB}`, {
          data: { capabilities: ['commerce_manager'], revoke: false },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await a.patch(`${backend}clinics/${clinicA}/members/${userB}`, {
          data: { capabilities: ['commerce_manager'], revoke: true },
        })
      ).status(),
    ).toBe(200);
    expect((await b.get(`${backend}clinics/${clinicA}`)).status()).toBe(403);
    const count = await db.query(
      'SELECT count(*) FROM clinic_memberships WHERE user_id=$1 AND clinic_id=$2',
      [userB, clinicA],
    );
    expect(count.rows[0].count).toBe('1');
    const effects = await db.query(
      "SELECT count(*) FROM outbox_messages WHERE aggregate_id=$1 AND event_type='ClinicInvitationAccepted'",
      [id],
    );
    expect(effects.rows[0].count).toBe('1');
    const expired = await a.post(`${backend}clinics/${clinicA}/invitations`, {
      data: { email: emails.b, capabilities: ['receptionist'] },
    });
    const expiredId = (await expired.json()).id;
    await db.query(
      "UPDATE clinic_invitations SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [expiredId],
    );
    expect(
      (
        await b.post(`${backend}invitations/${expiredId}/accept`, { data: {} })
      ).status(),
    ).toBe(409);
  });
  test('انتساب طبيب لعيادة لا يعيد صلاحيات ملغاة، وتعليق الاعتماد يوقفه', async () => {
    // Transfer the clinic before the account leaves its sole administrator role.
    const transfer = await b.post(`${backend}clinics/${clinicB}/invitations`, {
      data: { email: emails.a, capabilities: ['clinic_admin'] },
    });
    expect(transfer.status()).toBe(201);
    expect(
      (
        await a.post(
          `${backend}invitations/${(await transfer.json()).id}/accept`,
          { data: {} },
        )
      ).status(),
    ).toBe(201);
    const doctor = await submit(b, 'doctor', 'طبيب الاختبار');
    await approve(doctor);
    const r = await b.post(`${backend}me/affiliations`, {
      data: { clinicId: clinicA },
    });
    expect(r.status()).toBe(201);
    const id = (await r.json()).id;
    expect(
      (
        await a.post(
          `${backend}clinics/${clinicA}/affiliations/${id}/decision`,
          { data: { decision: 'approved' } },
        )
      ).status(),
    ).toBe(201);
    const membership = (
      await db.query(
        'SELECT capabilities FROM clinic_memberships WHERE user_id=$1 AND clinic_id=$2',
        [userB, clinicA],
      )
    ).rows[0];
    expect(membership.capabilities).toEqual(['doctor_member']);
    expect((await b.get(`${backend}clinics/${clinicA}`)).status()).toBe(200);
    expect(
      (
        await admin.post(`${backend}admin/applications/${doctor}/decision`, {
          data: {
            decision: 'suspended',
            reason: 'تعليق اعتماد fixture للتحقق من سحب الوصول',
            version: 2,
          },
        })
      ).status(),
    ).toBe(201);
    expect((await b.get(`${backend}clinics/${clinicA}`)).status()).toBe(403);
    expect(
      (await (await b.get(`${backend}me`)).json()).workspaces.some(
        (w: { persona: string }) => w.persona === 'doctor',
      ),
    ).toBe(false);
    const driver = await submit(b, 'driver', 'سائق اختبار محلي');
    await approve(driver);
    expect(
      (await (await b.get(`${backend}me`)).json()).workspaces.some(
        (w: { persona: string }) => w.persona === 'driver',
      ),
    ).toBe(true);
    expect(
      (
        await admin.post(`${backend}admin/applications/${driver}/decision`, {
          data: {
            decision: 'suspended',
            reason: 'تعليق اعتماد السائق في اختبار محلي',
            version: 2,
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (await (await b.get(`${backend}me`)).json()).workspaces.some(
        (w: { persona: string }) => w.persona === 'driver',
      ),
    ).toBe(false);
  });
  test('تسجيل واجهة حقيقي ثم تأكيد البريد والدخول وحفظ الاسم والإلغاء', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByRole('radio', { name: 'عميل', exact: true }).check();
    await page.getByLabel('الاسم الكامل').fill('مستخدم الواجهة');
    await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(emails.ui);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'إنشاء حساب' }).click();
    await expect(page.getByRole('status')).toContainText('أُنشئ طلب حسابك');
    const link = await mailLink(emails.ui, 'تأكيد');
    await page.goto(link);
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(emails.ui);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'تسجيل الدخول', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'أهلًا، مستخدم الواجهة.' }),
    ).toBeVisible();
    await page.getByLabel('الاسم الظاهر').fill('اسم محفوظ');
    await page.getByRole('button', { name: 'حفظ الاسم' }).click();
    await expect(
      page.getByRole('heading', { name: 'أهلًا، اسم محفوظ.' }),
    ).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: 'docs/evidence/account-phase01.png',
      fullPage: true,
    });
    await page.getByRole('link', { name: 'أمان الحساب', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'أمان حسابك، بيدك.' }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole('button', { name: 'تسجيل الخروج', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
  });
  test('واجهة العيادة والمراجعة تعرض بيانات محفوظة وتحترم الهاتف وإمكانية الوصول', async ({
    browser,
  }) => {
    const browserA = await browser.newContext();
    await browserA.addCookies((await a.storageState()).cookies);
    const page = await browserA.newPage();
    await page.goto(`/clinic/${clinicA}`);
    await expect(
      page.getByRole('heading', { name: 'عيادة الاختبار أ', exact: true }),
    ).toBeVisible();
    await page.getByLabel('اسم الفرع', { exact: true }).fill('فرع الواجهة');
    await page.getByLabel('المدينة', { exact: true }).fill('بغداد');
    await page.getByRole('button', { name: 'إضافة فرع' }).click();
    await expect(page.getByText('فرع الواجهة', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('فرع الواجهة', { exact: true })).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: 'docs/evidence/clinic-identity-phase01.png',
      fullPage: true,
    });
    await browserA.close();
    // Independent registration fixture; keep the production signup quota unchanged.
    await db.query('DELETE FROM auth_rate_limits');
    const reviewDriver = await playwrightRequest.newContext({
      extraHTTPHeaders: { Origin: origin },
    });
    const reviewEmail = `review-driver-${suffix}@petra.test`;
    await register(
      reviewDriver,
      reviewEmail,
      'سائق مراجعة الواجهة',
      true,
      'driver',
    );
    expect((await signIn(reviewDriver, reviewEmail)).status()).toBe(200);
    const reviewApplication = await submit(
      reviewDriver,
      'driver',
      'سائق مراجعة الواجهة',
    );
    await reviewDriver.dispose();
    const browserAdmin = await browser.newContext();
    const review = await browserAdmin.newPage();
    await review.goto('/login');
    await review
      .getByLabel('البريد الإلكتروني', { exact: true })
      .fill(emails.admin);
    await review.getByLabel('كلمة المرور', { exact: true }).fill(password);
    await review
      .getByRole('button', { name: 'تسجيل الدخول', exact: true })
      .click();
    await expect(
      review.getByRole('heading', { name: 'تحقق من هويتك.' }),
    ).toBeVisible();
    await review
      .getByLabel('رمز تطبيق المصادقة', { exact: true })
      .fill(totp.generate());
    await review
      .getByRole('button', { name: 'تأكيد الدخول', exact: true })
      .click();
    await expect(
      review.getByRole('heading', { name: 'أهلًا، مراجع محلي.' }),
    ).toBeVisible();
    await review.goto('/admin');
    await expect(
      review.getByRole('heading', { name: 'مراجعة تستحق الثقة.' }),
    ).toBeVisible();
    await review
      .locator('.review-card')
      .filter({ hasText: 'سائق مراجعة الواجهة' })
      .getByRole('button', { name: 'مراجعة الطلب' })
      .click();
    await review
      .getByLabel('سبب القرار ودليل المراجعة')
      .fill('اعتماد fixture محلي من واجهة المراجع لاختبار الحفظ');
    await review
      .getByLabel('راجعت الأدلة والجهة ولا أراجع طلبي الشخصي.')
      .check();
    await review
      .getByRole('button', { name: 'حفظ القرار وسجل التدقيق' })
      .click();
    await expect(review.getByRole('dialog')).toHaveCount(0);
    const granted = (
      await db.query(
        'SELECT status FROM professional_applications WHERE id=$1',
        [reviewApplication],
      )
    ).rows[0];
    expect(granted.status).toBe('approved');
    await review
      .getByRole('combobox', { name: 'حالة طلبات الاعتماد' })
      .selectOption('all');

    expect(
      (
        await new AxeBuilder({ page: review })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const width of [320, 390, 1440]) {
      await review.setViewportSize({ width, height: 900 });
      expect(
        await review.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await review.screenshot({
      path: 'docs/evidence/admin-phase01.png',
      fullPage: true,
    });
    await browserAdmin.close();
  });
  test('الاستعادة لا تكشف وجود البريد وتلغي الجلسات ورابطها يستخدم مرة واحدة', async () => {
    const known = await a.post(`${backend}auth/request-password-reset`, {
      data: { email: emails.a, redirectTo: '/reset-password' },
    });
    const absent = await a.post(`${backend}auth/request-password-reset`, {
      data: {
        email: `absent-${suffix}@petra.test`,
        redirectTo: '/reset-password',
      },
    });
    expect(known.status()).toBe(200);
    expect(absent.status()).toBe(200);
    expect(await known.json()).toEqual(await absent.json());
    const reset = await mailLink(emails.a, 'استعادة');
    const redirect = await a.get(
      reset.replace(origin, 'http://127.0.0.1:4100'),
      { maxRedirects: 0 },
    );
    const target = redirect.headers().location || reset;
    const token = new URL(target, origin).searchParams.get('token');
    expect(!!token).toBe(true);
    const newPassword = `Changed-${randomBytes(18).toString('base64url')}1!`;
    const saved = await a.post(`${backend}auth/reset-password`, {
      data: { token, newPassword },
    });
    expect(saved.status()).toBe(200);
    expect((await a.get(`${backend}me`)).status()).toBe(401);
    expect(
      (
        await a.post(`${backend}auth/reset-password`, {
          data: { token, newPassword },
        })
      ).status(),
    ).toBe(400);
  });
  test('رمز الاسترداد يستخدم مرة واحدة وسجل التدقيق غير قابل للتعديل', async () => {
    await admin.post(`${backend}auth/sign-out`, { data: {} });
    await signIn(admin, emails.admin);
    expect(
      (
        await admin.post(`${backend}auth/two-factor/verify-backup-code`, {
          data: { code: backupCodes[0], trustDevice: false },
        })
      ).status(),
    ).toBe(200);
    await admin.post(`${backend}auth/sign-out`, { data: {} });
    await signIn(admin, emails.admin);
    expect(
      (
        await admin.post(`${backend}auth/two-factor/verify-backup-code`, {
          data: { code: backupCodes[0], trustDevice: false },
        })
      ).status(),
    ).toBe(401);
    const event = (await db.query('SELECT id FROM audit_events LIMIT 1'))
      .rows[0];
    let rejected = false;
    try {
      await db.query("UPDATE audit_events SET action='tampered' WHERE id=$1", [
        event.id,
      ]);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
  test('حد المحاولات مطبق على الخادم', async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await pending.post(`${backend}auth/sign-in/email`, {
        data: {
          email: `unknown-${suffix}@petra.test`,
          password: 'AnIncorrectPassword000!',
        },
      });
      if (r.status() === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
