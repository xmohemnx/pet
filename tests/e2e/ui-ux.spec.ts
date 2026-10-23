import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IdentityMe } from '@petra/contracts';
const origin = 'http://127.0.0.1:3100';
let fixture: { accounts: Record<string, { cookie: string }>; clinicId: string };
async function login(
  context: BrowserContext,
  role = 'owner',
  persona = 'customer',
) {
  await context.clearCookies();
  await context.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((part) => {
      const i = part.indexOf('=');
      return {
        name: part.slice(0, i),
        value: part.slice(i + 1),
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax' as const,
      };
    }),
  );
  const me: IdentityMe = await (
    await context.request.get(origin + '/api/v1/me')
  ).json();
  const workspace = me.workspaces.find(
    (w) =>
      w.persona === persona &&
      (persona !== 'clinic_member' || w.clinicId === fixture.clinicId),
  );
  expect(workspace).toBeTruthy();
  expect(
    (
      await context.request.post(origin + '/api/v1/me/active-workspace', {
        headers: { Origin: origin },
        data: { workspaceId: workspace!.id },
      })
    ).status(),
  ).toBe(201);
}
async function accessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
}
test.beforeAll(() => {
  const file = `/tmp/petra-uiux-${randomUUID()}.json`;
  try {
    execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
      env: process.env,
      stdio: 'pipe',
    });
    fixture = JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(file, { force: true });
  }
});
test('إظهار كلمة المرور يحفظ قيمتها ولا يرسل النموذج، وفشل إعادة التأكيد لا يعرض نجاحاً', async ({
  page,
}) => {
  for (const route of [
    '/login',
    '/register',
    '/reset-password?token=invalid-local-test',
  ]) {
    await page.goto(route);
    const field = page.getByLabel(
      route.startsWith('/reset') ? 'كلمة المرور الجديدة' : 'كلمة المرور',
      { exact: true },
    );
    await field.fill('local-visibility-test-only');
    const before = page.url();
    await page
      .getByRole('button', {
        name: route.startsWith('/reset')
          ? 'إظهار كلمة المرور الجديدة'
          : 'إظهار كلمة المرور',
        exact: true,
      })
      .click();
    await expect(field).toHaveAttribute('type', 'text');
    await expect(field).toHaveValue('local-visibility-test-only');
    expect(page.url()).toBe(before);
    await page
      .getByRole('button', {
        name: route.startsWith('/reset')
          ? 'إخفاء كلمة المرور الجديدة'
          : 'إخفاء كلمة المرور',
        exact: true,
      })
      .click();
    await expect(field).toHaveAttribute('type', 'password');
  }
  await page.goto('/login');
  await page
    .getByLabel('البريد الإلكتروني', { exact: true })
    .fill('uiux-test@petra.test');
  await page.route('**/api/v1/auth/send-verification-email', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'TOO_MANY_REQUESTS',
        message: 'Try again later',
      }),
    }),
  );
  await page
    .getByRole('button', { name: 'إعادة إرسال تأكيد البريد', exact: true })
    .click();
  await expect(page.locator('.form-error[role=alert]')).toBeVisible();
  await expect(page.locator('.form-success')).toHaveCount(0);
});
test('قائمة الهاتف تحمي التركيز والتمرير والبحث وتغلق بـEscape أو خارجها ثم تتكيف مع الحاسوب', async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account');
  const toggle = page.getByRole('button', {
    name: 'فتح قائمة التنقل',
    exact: true,
  });
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'قائمة التنقل في Petra' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.closest('dialog') !== null),
    )
    .toBe(true);
  await dialog.getByLabel('ابحث في أقسام الموقع').fill('الرعاية');
  await expect(
    dialog.getByRole('link', { name: 'مركز الرعاية', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'المتجر', exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel('ابحث في أقسام الموقع').fill('قسم غير موجود');
  await expect(dialog.getByRole('status')).toContainText('لا توجد أقسام');
  await dialog.getByRole('button', { name: 'عرض جميع الأقسام' }).click();
  const last = dialog.getByRole('link', {
    name: 'الصفحة الرئيسية',
    exact: true,
  });
  await last.focus();
  await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.closest('dialog') !== null),
    )
    .toBe(true);
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(toggle).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await toggle.click();
  await page.mouse.click(5, 420);
  await expect(dialog).not.toBeVisible();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#petra-workspace-navigation')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
test('مساحات الشخصيات الخمس تحتفظ بالصلاحيات وتظهر مسارات العمل والوصول السريع الصحيح', async ({
  page,
  context,
}) => {
  for (const [role, persona, route, label] of [
    ['owner', 'customer', '/care', 'مركز الرعاية'],
    ['doctor', 'doctor', '/doctor', 'مساحة الطبيب'],
    ['manager', 'clinic_member', `/clinic/${fixture.clinicId}`, 'نظرة عامة'],
    ['driver', 'driver', '/driver', 'مساحة السائق'],
    ['manager', 'platform_admin', '/admin', 'مراجعات الاعتماد'],
  ]) {
    await login(context, role, persona);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route!);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${role} ${width}`,
      ).toBe(true);
      if (width === 390 || width === 1440) await accessible(page);
      if (width === 390) {
        const nav = page.getByRole('navigation', {
          name: 'الوصول السريع على الهاتف',
        });
        await expect(nav).toBeVisible();
        await expect(
          nav.getByRole('link', { name: 'حسابي', exact: true }),
        ).toHaveAttribute('href', '/account');
        await page
          .getByRole('button', { name: 'فتح قائمة التنقل', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await expect(
          dialog.getByRole('link', { name: label!, exact: true }),
        ).toBeVisible();
        if (persona !== 'platform_admin')
          await expect(
            dialog.getByRole('link', { name: 'مراجعات الاعتماد', exact: true }),
          ).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
    }
  }
});
test('الاتصال المفقود واضح في الحساب والمجتمع ويختفي عند العودة، وتكبير النص لا يخفي الحقول', async ({
  page,
  context,
}) => {
  await login(context);
  for (const route of ['/account', '/social']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await expect(
      page.getByRole('status').filter({ hasText: 'أنت غير متصل' }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(
      page.getByRole('status').filter({ hasText: 'أنت غير متصل' }),
    ).toHaveCount(0);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/security');
  await page.addStyleTag({ content: 'body { font-size: 200%; }' });
  await page.getByText('متابعة حذف حسابي', { exact: true }).click();
  await expect(
    page.getByLabel('كلمة المرور لتأكيد الحذف', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('التنقل باللمس والتمرير داخل القائمة يحافظان على الصفحة بالخلف', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await login(context);
    const page = await context.newPage();
    await page.goto('/care');
    await page
      .getByRole('button', { name: 'فتح قائمة التنقل', exact: true })
      .tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const client = await context.newCDPSession(page);
    await client.send('Input.synthesizeScrollGesture', {
      x: 240,
      y: 650,
      yDistance: -460,
      gestureSourceType: 'touch',
    });
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await client.detach();
    await page.touchscreen.tap(5, 420);
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('navigation', { name: 'الوصول السريع على الهاتف' })
      .getByRole('link', { name: 'حسابي', exact: true })
      .tap();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator('#account-type-title')).toContainText('عميل');
  } finally {
    await context.close();
  }
});
test('صور حقيقية لمسارات التصفح المشتركة والهاتف والحاسوب', async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const proof = process.env.PETRA_CAPTURE_UIUX_PROOF === 'true';
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (proof)
    expect(
      execFileSync(
        'git',
        ['status', '--porcelain', '--', 'apps', 'packages', 'tests', 'scripts'],
        { encoding: 'utf8' },
      ).trim(),
    ).toBe('');
  const dir = proof
    ? `docs/evidence/ui-ux/${source.slice(0, 8)}`
    : '/workspace/work/uiux-first';
  mkdirSync(dir, { recursive: true });
  const screens = [];
  for (const [name, route, role, persona] of [
    ['home', '/', '', ''],
    ['register', '/register', '', ''],
    ['login', '/login', '', ''],
    ['recovery', '/recover', '', ''],
    ['account', '/account', 'owner', 'customer'],
    ['security', '/security', 'owner', 'customer'],
    ['care', '/care', 'owner', 'customer'],
    ['market', '/marketplace', 'owner', 'customer'],
    ['services', '/services', 'owner', 'customer'],
    ['taxi', '/taxi', 'owner', 'customer'],
    ['social', '/social', 'owner', 'customer'],
    ['doctor', '/doctor', 'doctor', 'doctor'],
    ['clinic', `/clinic/${fixture.clinicId}`, 'manager', 'clinic_member'],
    ['driver', '/driver', 'driver', 'driver'],
    ['admin', '/admin', 'manager', 'platform_admin'],
    ['not-found', '/uiux-missing-test-page', '', ''],
  ]) {
    if (role) await login(context, role, persona);
    else await context.clearCookies();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(route!);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (name === 'security')
        await page.getByText('متابعة حذف حسابي', { exact: true }).click();
      await page.evaluate(() => scrollTo(0, 0));
      const file = `${name}-${width}.png`;
      await page.screenshot({
        path: `${dir}/${file}`,
        fullPage: false,
        animations: 'disabled',
      });
      screens.push({
        file,
        route,
        width,
        capturedAt: new Date().toISOString(),
      });
      if (['register', 'account', 'security'].includes(name!)) {
        await page.screenshot({
          path: `${dir}/${name}-${width}-full.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
      if (name === 'security' && width === 390) {
        await page
          .getByLabel('كلمة المرور لتأكيد الحذف', { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${dir}/delete-confirmation-390.png`,
          animations: 'disabled',
        });
      }
      if (name === 'account' && width === 390) {
        await page
          .getByRole('button', { name: 'فتح قائمة التنقل', exact: true })
          .click();
        await page.screenshot({
          path: `${dir}/navigation-390.png`,
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
      }
    }
  }
  writeFileSync(
    `${dir}/manifest.json`,
    JSON.stringify(
      {
        source,
        branch: execFileSync('git', ['branch', '--show-current'], {
          encoding: 'utf8',
        }).trim(),
        timezone: 'Asia/Baghdad',
        environment: 'isolated local E2E database; synthetic test accounts',
        screens,
      },
      null,
      2,
    ) + '\n',
  );
});
