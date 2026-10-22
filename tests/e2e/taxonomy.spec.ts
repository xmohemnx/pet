import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let f: {
    clinicId: string;
    clinicB: string;
    accounts: Record<string, { id: string; cookie: string }>;
  },
  manager: APIRequestContext,
  other: APIRequestContext,
  owner: APIRequestContext;
let product: string, foreignCategory: string;
const levels: string[] = [];
async function create(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
const base = () => `clinics/${f.clinicId}`;
async function version() {
  return (await db.query('SELECT version FROM products WHERE id=$1', [product]))
    .rows[0].version as number;
}
test.describe.serial('تصنيفات هرمية ووسوم وعزل وفلترة خادم', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-tax-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [manager, other, owner] = await Promise.all(
      ['manager', 'other', 'owner'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    product = (
      await create(manager, `${base()}/products`, {
        name: 'منتج تصنيف اختباري',
        sku: randomUUID(),
        priceMinor: '1000000',
        costMinor: '500000',
      })
    ).id;
    foreignCategory = (
      await create(other, `clinics/${f.clinicB}/categories`, {
        name: 'تصنيف عيادة أخرى',
        parentId: null,
        idempotencyKey: randomUUID(),
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([manager?.dispose(), other?.dispose(), owner?.dispose()]);
    await db.end();
  });
  test('التصنيفات للتجارة فقط ولا يمكن تغيير العيادة بالمعرف', async () => {
    for (const c of [other, owner]) {
      expect((await c.get(root + `${base()}/categories`)).status()).toBe(403);
      expect(
        (
          await c.post(root + `${base()}/categories`, {
            data: {
              name: 'ممنوع',
              parentId: null,
              idempotencyKey: randomUUID(),
            },
          })
        ).status(),
      ).toBe(403);
    }
    expect(
      (
        await manager.post(root + `${base()}/categories`, {
          data: {
            name: 'ابن مزور',
            parentId: foreignCategory,
            idempotencyKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(409);
  });
  test('أربعة مستويات ثابتة مع إعادة طلب ومنع اسم أخ مكرر أو مستوى خامس', async () => {
    for (let n = 0; n < 4; n++)
      levels.push(
        (
          await create(manager, `${base()}/categories`, {
            name: ['مستلزمات', 'قطط', 'لعب', 'كرات'][n],
            parentId: n ? levels[n - 1] : null,
            idempotencyKey: randomUUID(),
          })
        ).id,
      );
    const payload = {
        name: 'تصنيف مكرر الطلب',
        parentId: null,
        idempotencyKey: randomUUID(),
      },
      first = await create(manager, `${base()}/categories`, payload);
    expect((await create(manager, `${base()}/categories`, payload)).id).toBe(
      first.id,
    );
    expect(
      (
        await manager.post(root + `${base()}/categories`, {
          data: { ...payload, name: 'اسم مختلف' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + `${base()}/categories`, {
          data: { ...payload, idempotencyKey: randomUUID() },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + `${base()}/categories`, {
          data: {
            name: 'خامس',
            parentId: levels[3],
            idempotencyKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(409);
  });
  test('ربط بإصدار ووسوم مطبعة يحفظ السعر والمخزون ولا يقبل تصنيف عيادة أخرى', async () => {
    const before = (
      await db.query(
        'SELECT price_minor::text,on_hand,reserved,category FROM products WHERE id=$1',
        [product],
      )
    ).rows[0];
    const input = {
      version: await version(),
      categoryId: levels[3],
      tags: [' ناعم ', 'PET'],
    };
    expect(
      (
        await owner.post(
          root + `${base()}/products/${product}/classification`,
          { data: input },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await manager.post(
          root + `${base()}/products/${product}/classification`,
          { data: { ...input, categoryId: foreignCategory } },
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await manager.post(
          root + `${base()}/products/${product}/classification`,
          { data: { ...input, tags: ['PET', 'ＰＥＴ'] } },
        )
      ).status(),
    ).toBe(400);
    const classified = await create(
      manager,
      `${base()}/products/${product}/classification`,
      input,
    );
    expect(classified.tags).toEqual(['ناعم', 'PET']);
    expect(
      (
        await manager.post(
          root + `${base()}/products/${product}/classification`,
          { data: input },
        )
      ).status(),
    ).toBe(409);
    expect(
      (
        await db.query(
          'SELECT price_minor::text,on_hand,reserved,category FROM products WHERE id=$1',
          [product],
        )
      ).rows[0],
    ).toEqual(before);
    const p = (await (await owner.get(root + `products/${product}`)).json())
      .product;
    expect(p.classification.path).toEqual(['مستلزمات', 'قطط', 'لعب', 'كرات']);
    expect(p).not.toHaveProperty('cost_minor');
  });
  test('فلاتر الخادم تشمل فرع التصنيف وتحجب التصنيفات غير المنشورة أو ذات أصل مخفي', async () => {
    const result = await (
      await owner.get(
        root + `marketplace/search?categoryId=${levels[0]}&tag=pet`,
      )
    ).json();
    expect(result.map((p: { id: string }) => p.id)).toEqual([product]);
    expect(
      await (
        await owner.get(
          root + `marketplace/search?categoryId=${foreignCategory}`,
        )
      ).json(),
    ).toEqual([]);
    const options = await (
      await owner.get(root + 'marketplace/categories')
    ).json();
    expect(options.map((c: { id: string }) => c.id).sort()).toEqual(
      [...levels].sort(),
    );
    const category = (
      await db.query('SELECT version FROM catalog_categories WHERE id=$1', [
        levels[0],
      ])
    ).rows[0];
    expect(
      (
        await manager.patch(root + `${base()}/categories/${levels[0]}`, {
          data: { version: category.version, active: false },
        })
      ).status(),
    ).toBe(200);
    expect(
      await (await owner.get(root + 'marketplace/categories')).json(),
    ).toEqual([]);
    expect(
      await (
        await owner.get(root + `marketplace/search?categoryId=${levels[0]}`)
      ).json(),
    ).toEqual([]);
    const current = await (
      await owner.get(root + `products/${product}`)
    ).json();
    expect(current.product.classification).toBeNull();
    expect(
      (
        await manager.patch(root + `${base()}/categories/${levels[0]}`, {
          data: { version: category.version + 1, active: true },
        })
      ).status(),
    ).toBe(200);
  });
  test('قاعدة البيانات تمنع الدورات ونقل العيادة والوسم المكرر حتى لكاتب آخر', async () => {
    for (const [sql, values] of [
      [
        'UPDATE catalog_categories SET parent_id=$2,version=version+1 WHERE id=$1',
        [levels[0], levels[3]],
      ],
      ['DELETE FROM catalog_categories WHERE id=$1', [levels[3]]],
      [
        'UPDATE products SET category_id=$2 WHERE id=$1',
        [product, foreignCategory],
      ],
      ['UPDATE products SET tags=$2 WHERE id=$1', [product, ['x', 'X']]],
    ] as [string, unknown[]][])
      await expect(db.query(sql, values)).rejects.toMatchObject({
        code: '23514',
      });
  });
  test('الفريق ينشئ ويربط من الهاتف مع الوصول ودون تجاوز', async ({
    page,
    context,
  }) => {
    await context.addCookies(
      f.accounts.manager!.cookie.split('; ').map((c) => {
        const i = c.indexOf('=');
        return {
          name: c.slice(0, i),
          value: c.slice(i + 1),
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax' as const,
        };
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${f.clinicId}/catalog`);
    await page.getByLabel('اسم التصنيف', { exact: true }).fill('تصنيف الهاتف');
    await page
      .getByLabel('التصنيف الأب', { exact: true })
      .selectOption(levels[0]!);
    await page
      .getByRole('button', { name: 'حفظ التصنيف', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT count(*)::int n FROM catalog_categories WHERE clinic_id=$1 AND name='تصنيف الهاتف'",
              [f.clinicId],
            )
          ).rows[0].n,
      )
      .toBe(1);
    const added = (
      await db.query(
        "SELECT id FROM catalog_categories WHERE clinic_id=$1 AND name='تصنيف الهاتف'",
        [f.clinicId],
      )
    ).rows[0].id;
    await page.getByLabel('اختر المنتج للتصنيف').selectOption(product);
    await page.getByLabel('التصنيف المتسلسل للمنتج').selectOption(added);
    await page.getByLabel('الوسوم مفصولة بفاصلة').fill('ناعم، ألعاب');
    await page
      .getByRole('button', { name: 'حفظ تصنيف المنتج', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT category_id FROM products WHERE id=$1', [
              product,
            ])
          ).rows[0].category_id,
      )
      .toBe(added);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/evidence/catalog-taxonomy-390.png',
      fullPage: true,
    });
  });
  test('البحث المصنف لا يسقط منتجاً مختاراً من السلة عند تغير النتائج', async ({
    page,
    context,
  }) => {
    const vendor = await create(manager, `${base()}/vendors`, {
        name: 'مورد تصنيف اختبار',
        contact: '',
      }),
      po = await create(manager, `${base()}/purchases`, {
        productId: product,
        vendorId: vendor.id,
        quantity: 2,
        unitCost: '500000',
      });
    await create(manager, `${base()}/purchases/${po.id}/receive`);
    await context.addCookies(
      f.accounts.owner!.cookie.split('; ').map((c) => {
        const i = c.indexOf('=');
        return {
          name: c.slice(0, i),
          value: c.slice(i + 1),
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax' as const,
        };
      }),
    );
    await page.goto('/marketplace');
    await page.getByLabel('كمية منتج تصنيف اختباري', { exact: true }).fill('1');
    await page.getByText('البحث بالتصنيفات والوسوم', { exact: true }).click();
    await page.getByLabel('وسم البحث', { exact: true }).fill('غير موجود');
    await page
      .getByRole('button', { name: 'بحث مصنف من الخادم', exact: true })
      .click();
    await expect(page.locator('.market-card')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'معاينة السعر النهائي', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'السعر النهائي', exact: true }),
    ).toBeVisible();
  });
});
