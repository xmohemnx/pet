import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import type { Product } from '@petra/contracts';

const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
  clinicId: string;
  clinicB: string;
  accounts: Record<string, { id: string; cookie: string }>;
};
let manager: APIRequestContext,
  other: APIRequestContext,
  owner: APIRequestContext,
  accountant: APIRequestContext;
let parent: string, children: Product[], uiParent: string;
const dimensions = [
  { name: 'اللون', values: ['أحمر', 'أزرق'] },
  { name: 'المقاس', values: ['صغير', 'كبير'] },
];
const input = () => ({
  version: 1,
  dimensions,
  skuPrefix: `MX-${randomUUID()}`,
  priceMinor: '1200000',
  costMinor: '600000',
  idempotencyKey: randomUUID(),
});
async function create(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function product(name = 'طوق مصفوفة اصطناعي', sku = randomUUID()) {
  return (
    await create(manager, `clinics/${fixture.clinicId}/products`, {
      sku,
      name,
      priceMinor: '1000000',
      costMinor: '500000',
      species: 'cat',
    })
  ).id as string;
}
const path = (id: string, clinic = fixture.clinicId) =>
  `clinics/${clinic}/products/${id}/variant-matrix`;
async function publish(id: string, priceMinor = '1200000', active = true) {
  const p = (await db.query('SELECT * FROM products WHERE id=$1', [id]))
    .rows[0];
  expect(
    (
      await manager.patch(root + `clinics/${fixture.clinicId}/products/${id}`, {
        data: {
          name: p.name,
          description: p.description,
          priceMinor,
          active,
          version: p.version,
        },
      })
    ).status(),
  ).toBe(200);
}
async function stock(id: string, quantity = 3) {
  const vendor = await create(manager, `clinics/${fixture.clinicId}/vendors`, {
    name: 'مورد مصفوفة اختبار',
    contact: '',
  });
  const po = await create(manager, `clinics/${fixture.clinicId}/purchases`, {
    productId: id,
    vendorId: vendor.id,
    quantity,
    unitCost: '600000',
  });
  await create(
    manager,
    `clinics/${fixture.clinicId}/purchases/${po.id}/receive`,
  );
}
async function cookies(context: BrowserContext, role: string) {
  await context.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((c) => {
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
}
test.describe.serial('مصفوفة خيارات متعددة الأبعاد وSKU مستقل', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-matrix-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [manager, other, owner, accountant] = await Promise.all(
      ['manager', 'other', 'owner', 'doctor'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    parent = await product();
  });
  test.afterAll(async () => {
    await Promise.all([
      manager?.dispose(),
      other?.dispose(),
      owner?.dispose(),
      accountant?.dispose(),
    ]);
    await db.end();
  });
  test('يرفض العميل والمحاسب والعيادة الأخرى والحقول المزورة والأبعاد غير الصالحة', async () => {
    for (const c of [owner, accountant, other])
      expect(
        (await c.post(root + path(parent), { data: input() })).status(),
      ).toBe(403);
    expect(
      (
        await other.post(root + path(parent, fixture.clinicB), {
          data: input(),
        })
      ).status(),
    ).toBe(404);
    for (const patch of [
      { dimensions: [{ name: 'لون', values: ['أحمر', ' أحمر '] }] },
      {
        dimensions: [
          { name: 'Size', values: ['S'] },
          { name: 'size', values: ['M'] },
        ],
      },
      { skuPrefix: '../env' },
      { priceMinor: '1.5' },
      { onHand: 99 },
      {
        dimensions: [
          { name: 'أ', values: Array.from({ length: 8 }, (_, i) => String(i)) },
          { name: 'ب', values: Array.from({ length: 8 }, (_, i) => String(i)) },
          { name: 'ج', values: ['1', '2'] },
        ],
      },
    ])
      expect(
        (
          await manager.post(root + path(parent), {
            data: { ...input(), ...patch },
          })
        ).status(),
      ).toBe(400);
  });
  test('التوليد ذري ومخفي بلا مخزون أو قيد، وإعادة الطلب تعيد الهويات نفسها', async () => {
    await stock(parent, 2);
    const before = (
      await db.query('SELECT on_hand,reserved FROM products WHERE id=$1', [
        parent,
      ])
    ).rows[0];
    const journals = (await db.query('SELECT count(*)::int n FROM journals'))
      .rows[0].n;
    expect(
      (await manager.post(root + path(parent), { data: input() })).status(),
    ).toBe(409);
    const payload = {
        ...input(),
        version: (
          await db.query('SELECT version FROM products WHERE id=$1', [parent])
        ).rows[0].version as number,
      },
      first = await create(manager, path(parent), payload);
    children = first.products;
    expect(children).toHaveLength(4);
    expect(children.every((p) => p.active === false)).toBe(true);
    expect(children.map((p) => p.sku)).toEqual(
      [1, 2, 3, 4].map((i) => `${payload.skuPrefix}-0${i}`),
    );
    expect(children[2]!.variant_attributes).toEqual([
      { name: 'اللون', value: 'أزرق' },
      { name: 'المقاس', value: 'صغير' },
    ]);
    expect(
      (await create(manager, path(parent), payload)).products.map(
        (p: Product) => p.id,
      ),
    ).toEqual(children.map((p) => p.id));
    expect(
      (
        await manager.post(root + path(parent), {
          data: { ...payload, priceMinor: '2' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await manager.post(root + path(parent), { data: input() })).status(),
    ).toBe(409);
    expect(
      (
        await db.query('SELECT on_hand,reserved FROM products WHERE id=$1', [
          parent,
        ])
      ).rows[0],
    ).toEqual(before);
    expect(
      (await db.query('SELECT count(*)::int n FROM journals')).rows[0].n,
    ).toBe(journals);
    expect(
      (
        await db.query(
          'SELECT sum(on_hand)::int n FROM products WHERE parent_product_id=$1',
          [parent],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (await owner.get(root + `products/${children[0]!.id}`)).status(),
    ).toBe(404);
    const publicParent = await (
      await owner.get(root + `products/${parent}`)
    ).json();
    expect(publicParent.variants).toHaveLength(1);
    expect(publicParent.product).not.toHaveProperty('matrix_dimensions');
  });
  test('سباق توليد واحد وتعارض SKU يلغي كل الصفوف ويسمح بمحاولة صحيحة', async () => {
    const raced = await product('أصل سباق اختبار'),
      race = input();
    const results = await Promise.all([
      manager.post(root + path(raced), { data: race }),
      manager.post(root + path(raced), {
        data: { ...race, idempotencyKey: randomUUID() },
      }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM products WHERE parent_product_id=$1',
          [raced],
        )
      ).rows[0].n,
    ).toBe(4);
    const failed = await product('أصل تراجع اختبار'),
      collision = input();
    await product('SKU محجوز للاختبار', `${collision.skuPrefix}-02`);
    expect(
      (await manager.post(root + path(failed), { data: collision })).status(),
    ).toBe(409);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM products WHERE parent_product_id=$1',
          [failed],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query(
          'SELECT 1 FROM product_variant_matrices WHERE parent_product_id=$1',
          [failed],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await db.query('SELECT version FROM products WHERE id=$1', [failed]))
        .rows[0].version,
    ).toBe(1);
    expect(
      (
        await create(manager, path(failed), {
          ...collision,
          skuPrefix: `OK-${randomUUID()}`,
        })
      ).products,
    ).toHaveLength(4);
  });
  test('لا تحول عائلة قديمة أو خياراً إلى مصفوفة ولا تضيف ابناً يدوياً لعائلة منظمة', async () => {
    expect(
      (
        await manager.post(root + path(children[0]!.id), { data: input() })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + `clinics/${fixture.clinicId}/products`, {
          data: {
            sku: randomUUID(),
            name: 'ابن غير منظم',
            parentProductId: parent,
            variantLabel: 'غير منظم',
            priceMinor: '1',
            costMinor: '0',
          },
        })
      ).status(),
    ).toBe(400);
    const legacy = await product('عائلة خيارات سابقة');
    await create(manager, `clinics/${fixture.clinicId}/products`, {
      sku: randomUUID(),
      name: 'خيار قديم',
      parentProductId: legacy,
      variantLabel: 'سابق',
      priceMinor: '1',
      costMinor: '0',
    });
    expect(
      (await manager.post(root + path(legacy), { data: input() })).status(),
    ).toBe(409);
  });
  test('قاعدة البيانات ترفض العبث بالهوية أو التعريف أو الاختيار أو حفظ مصفوفة ناقصة', async () => {
    const mutations: [string, unknown[]][] = [
      [
        'UPDATE product_variant_matrices SET sku_prefix=sku_prefix WHERE parent_product_id=$1',
        [parent],
      ],
      [
        'DELETE FROM product_variant_choices WHERE product_id=$1',
        [children[0]!.id],
      ],
      [
        'UPDATE products SET sku=$2 WHERE id=$1',
        [children[0]!.id, randomUUID()],
      ],
      [
        'UPDATE products SET variant_label=$2 WHERE id=$1',
        [children[0]!.id, 'مضلل'],
      ],
      [
        "INSERT INTO products(clinic_id,sku,name,price_minor,cost_minor,parent_product_id,variant_label) VALUES($1,$2,'ابن بلا اختيار',1,0,$3,'غير صالح')",
        [fixture.clinicId, randomUUID(), parent],
      ],
    ];
    for (const [sql, values] of mutations)
      await expect(db.query(sql, values)).rejects.toMatchObject({
        code: '23514',
      });
    for (const indexes of [[1], [3, 1], [1, null], [1, 1]]) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const extra = (
          await client.query(
            "INSERT INTO products(clinic_id,sku,name,price_minor,cost_minor,parent_product_id,variant_label) VALUES($1,$2,'اختبار اختيار مرفوض',1,0,$3,'تسمية لا تطابق الأبعاد') RETURNING id",
            [fixture.clinicId, randomUUID(), parent],
          )
        ).rows[0].id;
        await expect(
          client.query(
            'INSERT INTO product_variant_choices(product_id,parent_product_id,choice_indexes) VALUES($1,$2,$3)',
            [extra, parent, indexes],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }
    const incomplete = await product('مصفوفة ناقصة اختبار');
    await expect(
      db.query(
        "INSERT INTO product_variant_matrices(parent_product_id,clinic_id,dimensions,sku_prefix,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,'DB-TEST',$4,$5,$6)",
        [
          incomplete,
          fixture.clinicId,
          JSON.stringify(dimensions),
          fixture.accounts.manager!.id,
          randomUUID(),
          'a'.repeat(64),
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await db.query(
          'SELECT 1 FROM product_variant_matrices WHERE parent_product_id=$1',
          [incomplete],
        )
      ).rowCount,
    ).toBe(0);
  });
  test('السعر والحجز مستقلان لكل تركيبة وتُحجب التكاليف والمتجر المخفي', async () => {
    const first = children[0]!.id,
      second = children[1]!.id;
    await stock(first);
    await stock(second);
    await publish(first, '1200000');
    await publish(second, '1800000');
    const publicData = await (
      await owner.get(root + `products/${first}`)
    ).json();
    for (const p of [publicData.product, ...publicData.variants]) {
      expect(p).not.toHaveProperty('cost_minor');
      expect(p).not.toHaveProperty('matrix_dimensions');
    }
    expect(publicData.variants.map((p: Product) => p.id).sort()).toEqual(
      [parent, first, second].sort(),
    );
    const orderInput = {
      idempotencyKey: randomUUID(),
      items: [{ productId: second, quantity: 2 }],
      address: 'عنوان اختبار مصفوفة بغداد',
    };
    expect(
      (
        await owner.post(root + 'checkout', {
          data: {
            ...orderInput,
            items: [{ ...orderInput.items[0], priceMinor: '1' }],
          },
        })
      ).status(),
    ).toBe(400);
    const order = await create(owner, 'checkout', orderInput);
    expect(order.total_minor).toBe('3600000');
    expect((await create(owner, 'checkout', orderInput)).id).toBe(order.id);
    expect(
      (await db.query('SELECT reserved FROM products WHERE id=$1', [first]))
        .rows[0].reserved,
    ).toBe(0);
    expect(
      (await db.query('SELECT reserved FROM products WHERE id=$1', [second]))
        .rows[0].reserved,
    ).toBe(2);
    await create(owner, `orders/${order.id}/cancel`);
    await db.query(
      'UPDATE clinic_storefronts SET published=false WHERE clinic_id=$1',
      [fixture.clinicId],
    );
    try {
      expect((await owner.get(root + `products/${first}`)).status()).toBe(404);
    } finally {
      await db.query(
        'UPDATE clinic_storefronts SET published=true WHERE clinic_id=$1',
        [fixture.clinicId],
      );
    }
  });
  test('الهاتف ينشئ المصفوفة من معاينة حقيقية دون تجاوز أو أخطاء وصول', async ({
    page,
    context,
  }) => {
    uiParent = await product('طوق خيارات من الهاتف');
    await cookies(context, 'manager');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${fixture.clinicId}/commerce`);
    const row = page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: 'طوق خيارات من الهاتف',
        exact: true,
      }),
    });
    await row
      .getByText('إنشاء خيارات اللون والمقاس دفعة واحدة', { exact: true })
      .click();
    await row.getByLabel('اسم البُعد 1', { exact: true }).fill('اللون');
    await row
      .getByLabel('قيم البُعد 1 مفصولة بفاصلة أو |', { exact: true })
      .fill('أحمر، أزرق');
    await row
      .getByLabel('اسم البُعد 2 (اختياري)', { exact: true })
      .fill('المقاس');
    await row
      .getByLabel('قيم البُعد 2 مفصولة بفاصلة أو |', { exact: true })
      .fill('صغير، كبير');
    await expect(
      row.getByText('سيُنشأ 4 SKU مستقلاً', { exact: true }),
    ).toBeVisible();
    await row
      .getByText('معاينة التركيبات قبل الإنشاء', { exact: true })
      .click();
    await expect(row.getByRole('listitem')).toHaveCount(4);
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
    await row.screenshot({
      path: 'docs/evidence/product-matrix-editor-390.png',
    });
    await row
      .getByRole('button', { name: 'إنشاء التركيبات المخفية', exact: true })
      .click();
    await expect(row.getByText(/مصفوفة ثابتة:/)).toBeVisible();
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM products WHERE parent_product_id=$1 AND NOT active',
          [uiParent],
        )
      ).rows[0].n,
    ).toBe(4);
  });
  test('المشتري يختار أبعاداً منشورة ويضيف SKU المطابق بسعره ومخزونه', async ({
    page,
    context,
  }) => {
    await publish(children[2]!.id);
    await cookies(context, 'owner');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/marketplace/products/${parent}`);
    await page.getByLabel('اختر اللون', { exact: true }).selectOption('أزرق');
    await page.getByLabel('اختر المقاس', { exact: true }).selectOption('كبير');
    await expect(
      page.getByText('هذه التركيبة غير منشورة أو غير متاحة؛ اختر قيماً أخرى.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /عرض هذا الخيار/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'إضافة الخيار للسلة', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('اختر اللون', { exact: true }).selectOption('أحمر');
    await page.getByLabel('اختر المقاس', { exact: true }).selectOption('كبير');
    await page.getByRole('link', { name: /عرض هذا الخيار/ }).click();
    await expect(page).toHaveURL(new RegExp(children[1]!.id));
    await expect(page.getByLabel('اختر اللون', { exact: true })).toHaveValue(
      'أحمر',
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'docs/evidence/product-matrix-picker-390.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'إضافة الخيار للسلة', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'تم الحفظ' }),
    ).toBeVisible();
    const cart = await (await owner.get(root + 'me/cart')).json();
    expect(
      cart.find((p: { product_id: string }) => p.product_id === children[1]!.id)
        ?.quantity,
    ).toBe(1);
    await publish(children[1]!.id, '1800000', false);
    const hidden = await (
      await owner.get(root + `products/${children[0]!.id}`)
    ).json();
    expect(hidden.variants.map((p: Product) => p.id)).not.toContain(
      children[1]!.id,
    );
  });
  test('استرجاع نسخة بها مصفوفات فعلية يحفظ كل التركيبات وآليات الحماية', async () => {
    test.setTimeout(90000);
    const result = JSON.parse(
      execFileSync(process.execPath, ['scripts/verify-backup.mjs'], {
        env: process.env,
        stdio: 'pipe',
        timeout: 80000,
      }).toString(),
    );
    expect(result.status).toBe('verified');
    expect(result.tables).toBe(142);
    expect(result.protectionTriggers).toBe(75);
  });
});
