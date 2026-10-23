import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
const routes = ['/', '/demo/customer', '/demo/clinic/finance'];
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`RTL دون تجاوز أفقي بعرض ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mkdir('docs/evidence', { recursive: true });
    for (const route of routes) {
      await page.goto(route);
      const title =
        route === '/'
          ? /كلّ يوم،\s*أقرب إليهم\./
          : route.includes('customer')
            ? 'أهلًا بك في عالمهم'
            : 'صورة أوضح، لكل التفاصيل.';
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().map((a) => a.finished));
      });
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440) {
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
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `docs/evidence/${route === '/' ? 'home' : route.includes('customer') ? 'customer' : 'finance'}-${width}.png`,
          fullPage: true,
        });
      }
    }
  });
}
test('العميل يبدل الحيوان وتظهر مواعيده ثم حالة الملف الصحي', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'ابدأ رحلة الرعاية' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/demo/customer');
  await expect(
    page.getByRole('heading', { name: 'مع لونا، كل يوم حكاية.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ميلو', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'مع ميلو، كل يوم حكاية.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'جلسة عناية بالفراء · ميلو' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'زيارة متابعة · لونا' }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'الملف الصحي' }).click();
  await expect(
    page.getByRole('heading', { name: 'خصوصيتهم، من أول خطوة.' }),
  ).toBeVisible();
});
test('تصفية الفواتير وتفاصيلها باللوحة وإغلاقها بلوحة المفاتيح', async ({
  page,
}) => {
  await page.goto('/demo/clinic/finance');
  await page.getByRole('searchbox').fill('سارة');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'تفاصيل DEMO-001' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'إغلاق تفاصيل الفاتورة' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByLabel('حالة الفاتورة').selectOption('pending');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('DEMO-002');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير النتائج التجريبية' }).click();
  expect((await download).suggestedFilename()).toBe(
    'petra-design-demo-invoices.csv',
  );
  await page.getByRole('searchbox').fill('غير موجود');
  await expect(page.getByRole('status')).toContainText('لا توجد نتائج مطابقة');
});
test('مساحات خمس فقط والوظائف غير المنفذة موسومة', async ({ page }) => {
  await page.goto('/demo/doctor');
  await expect(
    page
      .getByRole('navigation', { name: 'مساحات العمل التجريبية' })
      .getByRole('link'),
  ).toHaveCount(5);
  await expect(
    page.getByText('لم يبدأ تنفيذ وظائف هذه المساحة بعد.', { exact: false }),
  ).toBeVisible();
  const r = await page.goto('/demo/seller');
  expect(r?.status()).toBe(404);
});
test('عقود API وجاهزية الخدمات وأخطاء المسارات', async ({ request }) => {
  const ready = await request.get('http://127.0.0.1:4100/api/v1/ready');
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({
    status: 'ready',
    postgres: 'ok',
    redis: 'ok',
    realtime: 'ok',
  });
  const data = await request.get('http://127.0.0.1:4100/api/v1/demo/customer');
  expect((await data.json()).mode).toBe('design-demo');
  const denied = await request.get(
    'http://127.0.0.1:4100/api/v1/demo/clinics/other-clinic/finance',
  );
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toHaveProperty('requestId');
  const spec = await request.get('http://127.0.0.1:4100/api/docs-json');
  expect((await spec.json()).paths['/api/v1/demo/customer']).toBeDefined();
});
test('تقليل الحركة يبقي الصفحة كاملة دون حركة غير ضرورية', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(
    await page
      .locator('.petra-intro h1')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({
    path: 'docs/evidence/home-reduced-motion.png',
    fullPage: true,
  });
});
for (const route of routes)
  test(`إمكانية الوصول الآلية ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(document.getAnimations().map((a) => a.finished));
    });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });

test('إغلاق العرض التجريبي في الويب وAPI دون flag صريح', async ({
  request,
}) => {
  const health = await request.get('http://127.0.0.1:3200/api/v1/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    status: 'ok',
    demoEnabled: false,
  });
  const api = await request.get('http://127.0.0.1:4101/api/v1/demo/customer');
  expect(api.status()).toBe(404);
  expect(await api.text()).not.toContain('لونا');
  const web = await request.get('http://127.0.0.1:3200/demo/customer');
  expect(web.status()).toBe(404);
  expect(await web.text()).not.toContain('رفيقك الصغير');
});
test('اختيار مساحة من الهاتف وتمرير جدول المالية داخل حاويته', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/customer');
  await page.getByRole('button', { name: 'المساحات' }).click();
  await page
    .getByRole('navigation', { name: 'اختيار مساحة العمل' })
    .getByRole('link', { name: 'العيادة', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'الفواتير التجريبية' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'تفاصيل DEMO-001' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'العودة للفواتير' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
