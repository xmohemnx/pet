import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('نماذج الهوية العربية على الهاتف والحاسوب دون تجاوز أفقي', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/login', '/register', '/recover']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `docs/evidence/${route.slice(1)}-${width}-phase01.png`,
          fullPage: true,
        });
    }
  }
});
test('نماذج التسجيل والدخول والاستعادة تجتاز فحص الوصول الآلي', async ({
  page,
}) => {
  for (const route of ['/login', '/register', '/recover']) {
    await page.goto(route);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
