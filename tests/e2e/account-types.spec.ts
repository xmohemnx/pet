import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100',
  stamp = randomUUID().slice(0, 8),
  password = `Local-${randomBytes(18).toString('hex')}!9a`;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const clients: Record<string, APIRequestContext> = {},
  users: Record<string, { id: string; email: string }> = {};
let admin: APIRequestContext, managerId: string, adminPassword: string;
async function post(
  client: APIRequestContext,
  path: string,
  data: unknown = {},
) {
  return client.post(root + path, { data });
}
async function me(role: string) {
  const r = await clients[role]!.get(root + 'me');
  expect(r.status()).toBe(200);
  return r.json();
}
async function cookie(context: BrowserContext, role: string) {
  await context.addCookies((await clients[role]!.storageState()).cookies);
}
test.describe.serial('نوع حساب ثابت وتغيير إداري وحذف الحساب', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-types-${randomUUID()}.json`;
    let fixture;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: { ...process.env, PETRA_FIXTURE_KEEP_PASSWORD: 'true' },
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    managerId = fixture.accounts.manager.id;
    adminPassword = fixture.fixturePassword;
    admin = await factory.newContext({
      extraHTTPHeaders: {
        Origin: origin,
      },
      storageState: {
        origins: [],
        cookies: fixture.accounts.manager.cookie
          .split('; ')
          .map((part: string) => {
            const i = part.indexOf('=');
            return {
              name: part.slice(0, i),
              value: part.slice(i + 1),
              domain: '127.0.0.1',
              path: '/',
              expires: -1,
              httpOnly: true,
              secure: false,
              sameSite: 'Lax' as const,
            };
          }),
      },
    });
    for (const type of ['customer', 'doctor', 'clinic', 'driver']) {
      const client = await factory.newContext({
        extraHTTPHeaders: { Origin: origin },
      });
      clients[type] = client;
      const email = `type-${type}-${stamp}@petra.test`,
        r = await post(client, 'auth/sign-up/email', {
          name: `حساب ${type} · اختبار`,
          email,
          password,
          accountType: type,
        });
      expect(r.status()).toBe(200);
      const id = (await r.json()).user.id;
      users[type] = { id, email };
      await db.query('UPDATE auth_users SET "emailVerified"=true WHERE id=$1', [
        id,
      ]);
      expect(
        (
          await post(client, 'auth/sign-in/email', { email, password })
        ).status(),
      ).toBe(200);
    }
  });
  test.afterAll(async () => {
    await Promise.all([
      ...Object.values(clients).map((c) => c.dispose()),
      admin?.dispose(),
    ]);
    await db.end();
  });
  test('الأنواع الأربعة تحفظ عند التسجيل ولا تمنح اعتماداً أو لوحة مهنية تلقائياً', async () => {
    for (const type of ['customer', 'doctor', 'clinic', 'driver']) {
      const identity = await me(type);
      expect(identity.user.accountType).toBe(type);
      expect(identity.workspaces.map((w: { id: string }) => w.id)).toEqual(
        type === 'customer' ? ['customer'] : [],
      );
      expect(
        (
          await db.query('SELECT account_type FROM auth_users WHERE id=$1', [
            users[type]!.id,
          ])
        ).rows[0].account_type,
      ).toBe(type);
    }
  });
  test('حقول الامتياز وتغيير النوع المباشر وفتح قسم مختلف مرفوضة على الخادم وDB', async () => {
    for (const accountType of [
      'platform_admin',
      'store_owner',
      'clinic_member',
    ])
      expect(
        (
          await post(clients.customer!, 'auth/sign-up/email', {
            name: 'محاولة اختبار',
            email: `bad-${randomUUID()}@petra.test`,
            password,
            accountType,
          })
        ).status(),
      ).toBe(400);
    expect(
      (
        await post(clients.customer!, 'auth/update-user', {
          accountType: 'doctor',
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await clients.customer!.patch(root + 'me', {
          data: { name: 'اختبار', accountType: 'doctor' },
        })
      ).status(),
    ).toBe(400);
    await expect(
      db.query("UPDATE auth_users SET account_type='doctor' WHERE id=$1", [
        users.customer!.id,
      ]),
    ).rejects.toThrow('approved administration request');
    expect(
      (
        await post(clients.customer!, 'me/active-workspace', {
          workspaceId: 'doctor',
        })
      ).status(),
    ).toBe(403);
    expect((await clients.customer!.get(root + 'driver/home')).status()).toBe(
      403,
    );
    expect(
      (await clients.driver!.get(root + 'doctor/appointments')).status(),
    ).toBe(403);
    expect(
      (
        await post(clients.customer!, 'applications', {
          kind: 'driver',
          displayName: 'سائق غير مخول',
          registrationNumber: 'LOCAL-ONLY',
        })
      ).status(),
    ).toBe(403);
  });
  test('طلب التغيير من الواجهة يبقى معلقاً ثم قرار الإدارة يغير النوع ويلغي الجلسة', async ({
    page,
    context,
    browser,
  }) => {
    await cookie(context, 'customer');
    await page.goto('/account');
    await page
      .getByText('طلب تغيير نوع الحساب من الإدارة', { exact: true })
      .click();
    await page
      .getByLabel('النوع المطلوب', { exact: true })
      .selectOption('doctor');
    await page
      .getByLabel('سبب طلب التغيير', { exact: true })
      .fill('أرغب باستخدام حساب طبيب بعد مراجعة الإدارة');
    await page
      .getByRole('button', { name: 'إرسال طلب تغيير النوع', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('أُرسل الطلب');
    expect((await me('customer')).user.accountType).toBe('customer');
    const list = await (
        await clients.customer!.get(root + 'me/account-type-requests')
      ).json(),
      request = list[0];
    expect(request.status).toBe('pending');
    expect(
      (
        await post(clients.customer!, 'me/account-type-requests', {
          targetType: 'driver',
          reason: 'محاولة تكرار طلب معلق',
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await post(
          clients.customer!,
          `admin/account-type-requests/${request.id}/decision`,
          {
            decision: 'approved',
            reason: 'محاولة اعتماد ذاتي غير مخولة',
            version: 1,
          },
        )
      ).status(),
    ).toBe(403);
    const reviewContext = await browser.newContext();
    await reviewContext.addCookies((await admin.storageState()).cookies);
    const review = await reviewContext.newPage();
    await review.goto('/admin/account-types');
    await review
      .getByRole('button', { name: 'مراجعة طلب التغيير', exact: true })
      .click();
    await review.getByLabel('القرار', { exact: true }).selectOption('approved');
    await review
      .getByLabel('سبب القرار الإداري', { exact: true })
      .fill('موافقة fixture محلية؛ لا تمنح اعتماداً طبياً');
    await review
      .getByRole('button', { name: 'حفظ قرار تغيير النوع', exact: true })
      .click();
    await expect(review.getByRole('status')).toContainText('حُفظ قرار الإدارة');
    await reviewContext.close();
    expect((await clients.customer!.get(root + 'me')).status()).toBe(401);
    expect(
      (
        await post(clients.customer!, 'auth/sign-in/email', {
          email: users.customer!.email,
          password,
        })
      ).status(),
    ).toBe(200);
    const changed = await me('customer');
    expect(changed.user.accountType).toBe('doctor');
    expect(changed.workspaces).toEqual([]);
    await context.clearCookies();
    await cookie(context, 'customer');
    await page.goto('/account');
    await page
      .getByLabel('الاسم المهني أو اسم العيادة', { exact: true })
      .fill('طبيب حديث النوع · اختبار');
    await page
      .getByRole('textbox', { name: /رقم الترخيص أو مرجع المستند/ })
      .fill('LOCAL-TEST-ONLY');
    await page
      .getByRole('button', { name: 'إرسال طلب الاعتماد', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'طبيب حديث النوع · اختبار',
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'طبيب حديث النوع · اختبار',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'إرسال طلب الاعتماد', exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await post(
          admin,
          `admin/account-type-requests/${request.id}/decision`,
          {
            decision: 'approved',
            reason: 'طلب متقادم لا يتكرر أثره',
            version: 1,
          },
        )
      ).status(),
    ).toBe(409);
  });
  test('الإدارة لا تراجع طلبها والتوثيق المهني مستقل عن اختيار النوع', async () => {
    const own = await post(admin, 'me/account-type-requests', {
      targetType: 'doctor',
      reason: 'طلب اختبار منع المراجعة الذاتية',
    });
    expect(own.status()).toBe(201);
    const r = await own.json();
    expect(
      (
        await post(admin, `admin/account-type-requests/${r.id}/decision`, {
          decision: 'approved',
          reason: 'لا يمكن للمراجع اعتماد نفسه',
          version: 1,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await clients.doctor!.get(root + 'admin/account-type-requests')
      ).status(),
    ).toBe(403);
    const application = await post(clients.driver!, 'applications', {
      kind: 'driver',
      displayName: 'سائق · اختبار ثابت النوع',
      registrationNumber: 'LOCAL-TEST-ONLY',
      notes: 'ليس اعتماداً حقيقياً',
    });
    expect(application.status()).toBe(201);
    const id = (await application.json()).id;
    expect(
      (
        await post(admin, `admin/applications/${id}/decision`, {
          decision: 'approved',
          reason: 'مراجعة fixture محلية فقط لا رخصة حقيقية',
          version: 1,
        })
      ).status(),
    ).toBe(201);
    expect(
      (await me('driver')).workspaces.map(
        (w: { persona: string }) => w.persona,
      ),
    ).toEqual(['driver']);
    expect((await clients.driver!.get(root + 'driver/home')).status()).toBe(
      200,
    );
  });
  test('الفصل بين الأقسام وواجهات الهوية تعمل في RTL وعلى الهاتف والحاسوب', async ({
    page,
    context,
  }) => {
    await cookie(context, 'driver');
    await page.goto('/app');
    await expect(page).toHaveURL(/\/driver$/);
    await page.goto('/doctor');
    await expect(page).toHaveURL(/\/driver$/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/register', '/login', '/account', '/security']) {
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page.goto('/register');
    await expect(page.getByRole('radio')).toHaveCount(4);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto('/security');
    await page.getByText('متابعة حذف حسابي', { exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test('الحذف يحتاج كلمة المرور ويخفي المنشور ويلغي الجلسات دون حذف سجل التدقيق', async () => {
    const actor = clients.customer!,
      id = users.customer!.id;
    const profile = await post(actor, 'social/profile', {
      displayName: 'حساب سيغلق · اختبار',
      bio: 'بيانات اختبار محلية لإثبات إغلاق الحساب',
      privacy: 'public',
    });
    expect(profile.status()).toBe(201);
    const formerHandle = (await profile.json()).handle;
    const created = await post(actor, 'social/posts', {
      body: 'منشور قبل إغلاق الحساب · اختبار',
      kind: 'post',
      visibility: 'public',
    });
    expect(created.status()).toBe(201);
    const postId = (await created.json()).id;
    expect(
      (
        await post(actor, 'me/close-account', {
          password: 'incorrect',
          confirmation: 'حذف حسابي',
        })
      ).status(),
    ).toBe(403);
    expect((await me('customer')).user.id).toBe(id);
    expect(
      (
        await post(actor, 'me/close-account', {
          password,
          confirmation: 'حذف حسابي',
          userId: users.doctor!.id,
        })
      ).status(),
    ).toBe(400);
    const closed = await post(actor, 'me/close-account', {
      password,
      confirmation: 'حذف حسابي',
    });
    expect(closed.status(), await closed.text()).toBe(201);
    expect((await actor.get(root + 'me')).status()).toBe(401);
    expect(
      (
        await post(actor, 'auth/sign-in/email', {
          email: users.customer!.email,
          password,
        })
      ).ok(),
    ).toBe(false);
    expect(
      (await clients.doctor!.get(root + `social/posts/${postId}`)).status(),
    ).toBe(404);
    expect(
      (
        await clients.doctor!.get(root + `social/profiles/${formerHandle}`)
      ).status(),
    ).toBe(404);
    const stored = (
      await db.query(
        'SELECT u.name,u.closed_at,(SELECT count(*) FROM auth_sessions WHERE "userId"=u.id)::int sessions,(SELECT count(*) FROM audit_events WHERE actor_id=u.id AND action=$2)::int audit FROM auth_users u WHERE u.id=$1',
        [id, 'identity.account_closed'],
      )
    ).rows[0];
    expect(stored.name).toBe('حساب محذوف');
    expect(stored.closed_at).toBeTruthy();
    expect(stored.sessions).toBe(0);
    expect(stored.audit).toBe(1);
    await expect(
      db.query(
        'INSERT INTO auth_sessions(id,token,"userId","expiresAt","updatedAt") VALUES(gen_random_uuid(),$1,$2,now()+interval \'1 hour\',now())',
        [randomUUID(), id],
      ),
    ).rejects.toThrow('Closed account');
    expect((await me('doctor')).user.id).toBe(users.doctor!.id);
  });
  test('مدير العيادة الوحيد لا يغلق الحساب قبل معالجة مسؤولية العيادة', async () => {
    const r = await post(clients.clinic!, 'applications', {
      kind: 'clinic',
      displayName: 'عيادة اختبار إغلاق الحساب',
      registrationNumber: 'LOCAL-ONLY',
      notes: 'fixture محلية',
    });
    expect(r.status()).toBe(201);
    const id = (await r.json()).id;
    expect(
      (
        await post(admin, `admin/applications/${id}/decision`, {
          decision: 'approved',
          reason: 'اعتماد fixture لإثبات منع فقدان مدير العيادة',
          version: 1,
        })
      ).status(),
    ).toBe(201);
    const blocked = await post(clients.clinic!, 'me/close-account', {
      password,
      confirmation: 'حذف حسابي',
    });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).message).toContain('مديراً آخر');
    expect((await clients.clinic!.get(root + 'me')).status()).toBe(200);
    expect(
      (
        await post(admin, `admin/applications/${id}/decision`, {
          decision: 'suspended',
          reason: 'إيقاف منشأة الاختبار قبل إغلاق حسابها الاختباري',
          version: 2,
        })
      ).status(),
    ).toBe(201);
  });
  test('واجهة حذف الحساب تؤكد الإغلاق وتمنع حذف حساب الإدارة ذاتياً', async ({
    page,
    context,
  }) => {
    expect(
      (
        await post(admin, 'me/close-account', {
          password: adminPassword,
          confirmation: 'حذف حسابي',
        })
      ).ok(),
    ).toBe(false);
    expect(
      (
        await post(admin, 'me/close-account', {
          password: adminPassword,
          confirmation: 'حذف حسابي',
        })
      ).status(),
    ).toBe(409);
    await cookie(context, 'clinic');
    await page.goto('/security');
    await page.getByText('متابعة حذف حسابي', { exact: true }).click();
    await page
      .getByLabel('كلمة المرور لتأكيد الحذف', { exact: true })
      .fill(password);
    await page
      .getByLabel('اكتب «حذف حسابي» للتأكيد', { exact: true })
      .fill('حذف حسابي');
    await page.getByRole('checkbox').last().check();
    await page
      .getByRole('button', { name: 'حذف الحساب وإغلاق الدخول', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login\?closed=1/);
    await expect(page.getByRole('status')).toContainText('حُذف حسابك');
    expect((await clients.clinic!.get(root + 'me')).status()).toBe(401);
  });
  test('صور الواجهات الجديدة من commit مثبت', async ({ browser }) => {
    test.skip(
      process.env.PETRA_CAPTURE_ACCOUNT_PROOF !== 'true',
      'Opt-in committed-source evidence',
    );
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      dir = `docs/evidence/account-types/${commit.slice(0, 8)}`;
    expect(
      execFileSync(
        'git',
        [
          'status',
          '--porcelain',
          '--',
          'apps',
          'packages',
          'scripts',
          'tests',
          'infra',
        ],
        { encoding: 'utf8' },
      ).trim(),
    ).toBe('');
    mkdirSync(dir, { recursive: true });
    const visitor = await browser.newContext(),
      driver = await browser.newContext();
    await cookie(driver, 'driver');
    const screens = [];
    for (const [name, route, ctx] of [
      ['register', '/register', visitor],
      ['login', '/login', visitor],
      ['account', '/account', driver],
      ['security', '/security', driver],
    ] as const) {
      for (const width of [390, 1440]) {
        const page = await ctx.newPage();
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        if (name === 'account') {
          await expect(
            page.getByRole('heading', {
              name: 'سائق · اختبار ثابت النوع',
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole('button', {
              name: 'إرسال طلب الاعتماد',
              exact: true,
            }),
          ).toHaveCount(0);
          await page
            .getByText('طلب تغيير نوع الحساب من الإدارة', { exact: true })
            .click();
          await expect(
            page.getByRole('combobox', { name: 'النوع المطلوب', exact: true }),
          ).toBeEnabled();
        }
        if (name === 'security')
          await page.getByText('متابعة حذف حسابي', { exact: true }).click();
        const file = `${name}-${width}.png`;
        await page.screenshot({
          path: `${dir}/${file}`,
          fullPage: true,
          animations: 'disabled',
        });
        await page.screenshot({
          path: `${dir}/${name}-${width}-viewport.png`,
          fullPage: false,
          animations: 'disabled',
        });
        screens.push({
          file,
          route,
          width,
          capturedAt: new Date().toISOString(),
        });
        await page.close();
      }
    }
    const reviewer = await browser.newContext();
    await reviewer.addCookies((await admin.storageState()).cookies);
    const page = await reviewer.newPage();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/admin/account-types');
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: `${dir}/admin-1440.png`, fullPage: true });
    screens.push({
      file: 'admin-1440.png',
      route: '/admin/account-types',
      width: 1440,
      capturedAt: new Date().toISOString(),
    });
    writeFileSync(
      `${dir}/manifest.json`,
      JSON.stringify(
        {
          commit,
          branch: execFileSync('git', ['branch', '--show-current'], {
            encoding: 'utf8',
          }).trim(),
          timezone: 'Asia/Baghdad',
          environment:
            'isolated local E2E database; explicitly synthetic accounts',
          screens,
        },
        null,
        2,
      ) + '\n',
    );
    await Promise.all([visitor.close(), driver.close(), reviewer.close()]);
    expect(managerId).toBeTruthy();
  });
});
