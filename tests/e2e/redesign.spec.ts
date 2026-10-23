import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IdentityMe } from '@petra/contracts';

test('اختيار الحاجة يفتح الخدمة الصحيحة والأسئلة تعمل بلوحة المفاتيح', async ({
  page,
}) => {
  await page.goto('/');
  const destinations = ['/care/directory', '/marketplace', '/taxi', '/social'];
  for (const [index, href] of destinations.entries()) {
    await page
      .getByLabel('ماذا يحتاج رفيقك اليوم؟')
      .selectOption(String(index));
    await expect(
      page.getByRole('link', { name: 'استكشف الخدمة', exact: true }),
    ).toHaveAttribute('href', href);
  }
  const summary = page.locator('.petra-faq summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  await expect(summary.locator('..').locator('p')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(summary.locator('..')).not.toHaveAttribute('open', '');
});

test('الصور المحلية وتقليل الحركة وإتاحة الصفحة الجديدة', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const external: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1')
      external.push(new URL(request.url()).hostname);
  });
  await page.goto('/');
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(external).toEqual([]);
  await page.evaluate(() => scrollTo(0, 0));
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('الهوية الجديدة تخدم الشخصيات الخمس والتنقل على الهاتف دون تسريب الصلاحيات', async ({
  page,
  context,
}) => {
  const file = `/tmp/petra-design-${randomUUID()}.json`;
  let fixture: {
    accounts: Record<string, { cookie: string }>;
    clinicId: string;
  };
  try {
    execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
      env: process.env,
      stdio: 'pipe',
    });
    fixture = JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(file, { force: true });
  }
  const personas = [
    { role: 'owner', persona: 'customer', href: '/care', name: 'customer' },
    { role: 'doctor', persona: 'doctor', href: '/doctor', name: 'doctor' },
    {
      role: 'manager',
      persona: 'clinic_member',
      href: `/clinic/${fixture.clinicId}`,
      name: 'clinic',
    },
    { role: 'driver', persona: 'driver', href: '/driver', name: 'driver' },
    {
      role: 'manager',
      persona: 'platform_admin',
      href: '/admin',
      name: 'admin',
    },
  ];
  for (const item of personas) {
    await context.clearCookies();
    await context.addCookies(
      fixture.accounts[item.role]!.cookie.split('; ').map((cookie) => {
        const index = cookie.indexOf('=');
        return {
          name: cookie.slice(0, index),
          value: cookie.slice(index + 1),
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax' as const,
        };
      }),
    );
    const response = await context.request.get(
      'http://127.0.0.1:4100/api/v1/me',
    );
    expect(response.status()).toBe(200);
    const me: IdentityMe = await response.json();
    const workspace = me.workspaces.find(
      (workspace) =>
        workspace.persona === item.persona &&
        (item.persona !== 'clinic_member' ||
          workspace.clinicId === fixture.clinicId),
    );
    expect(workspace).toBeTruthy();
    const change = await context.request.post(
      'http://127.0.0.1:4100/api/v1/me/active-workspace',
      {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: { workspaceId: workspace!.id },
      },
    );
    expect(change.status()).toBe(201);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(item.href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#petra-workspace-navigation')).toBeVisible();
    if (item.persona === 'customer')
      await expect(
        page.getByRole('link', { name: 'مراجعات الاعتماد', exact: true }),
      ).toHaveCount(0);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${item.name} at ${width}`,
      ).toBe(true);
      if (width === 1440 || width === 390) {
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: `docs/evidence/redesign-${item.name}-${width}.png`,
          fullPage: true,
        });
      }
    }
    const toggle = page.getByRole('button', {
      name: 'فتح قائمة التنقل',
      exact: true,
    });
    await toggle.click();
    await expect(
      page.getByRole('navigation', { name: 'أقسام Petra' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#petra-workspace-navigation')).toBeHidden();
    await expect(toggle).toBeFocused();
  }
});

test('التمرير والحركة يحترمان الروابط ولوحة المفاتيح والتفضيل الحي والتنقل', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.petra-public')).toHaveClass(
    /petra-motion-active/,
  );
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.mouse.wheel(0, 450);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await page.keyboard.press('Control+Home');
  await page.getByRole('link', { name: 'عالم Petra', exact: true }).click();
  await expect(page).toHaveURL(/#services$/);
  await expect
    .poll(() =>
      page
        .locator('#services')
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(30);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.petra-public')).not.toHaveClass(
    /petra-motion-active/,
  );
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
    'transform',
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.getByRole('link', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await expect(
    page.getByLabel('البريد الإلكتروني', { exact: true }),
  ).toBeVisible();
});

test('اللمس يبقى بتمرير أصلي والصفحة العامة قابلة للقراءة دون JavaScript', async ({
  browser,
}) => {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });
  const page = await mobile.newPage();
  await page.goto('http://127.0.0.1:3100');
  await expect(page.locator('.petra-public')).toHaveClass(
    /petra-motion-active/,
  );
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await mobile.close();
  const plain = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await plain.newPage();
  await staticPage.goto('http://127.0.0.1:3100');
  await expect(staticPage.getByRole('heading', { level: 1 })).toBeVisible();
  await staticPage.locator('.petra-faq summary').first().click();
  await expect(
    staticPage.locator('.petra-faq details').first(),
  ).toHaveAttribute('open', '');
  await expect(
    staticPage.getByRole('link', { name: 'ابدأ رحلة الرعاية' }),
  ).toHaveAttribute('href', '/care');
  await plain.close();
});
