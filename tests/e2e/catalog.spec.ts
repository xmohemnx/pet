import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import type { Product, Storefront } from '@petra/contracts';
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
  owner: APIRequestContext;
let parent: string,
  variant: string,
  photo: string,
  privatePhoto: string,
  medicalPhoto: string;
const name = 'غذاء الرفيق كتالوج',
  variantName = 'غذاء الرفيق كتالوج 2 كغ';
const productData = {
  sku: randomUUID(),
  name,
  description: 'منتج اختبار اصطناعي دون ادعاء علاجي',
  species: 'cat',
  priceMinor: '10000000',
  costMinor: '5000000',
};
const catalogData = {
  version: 1,
  category: 'غذاء',
  brand: 'علامة اختبار',
  barcode: 'CAT-100',
  unit: 'كيس',
  ageSuitability: 'بالغ',
  specifications: [{ name: 'الوزن', value: '1 كغ' }],
  images: [] as { assetId: string; alt: string }[],
  publicationConsent: true,
};
async function post(c: APIRequestContext, p: string, data: unknown = {}) {
  return c.post(root + p, { data });
}
async function create(c: APIRequestContext, p: string, data: unknown = {}) {
  const r = await post(c, p, data);
  expect(r.status(), `${p}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function editCatalog(data: unknown, id = parent, c = manager) {
  return c.patch(root + `clinics/${fixture.clinicId}/products/${id}/catalog`, {
    data,
  });
}
async function settings() {
  return (
    await manager.get(root + `clinics/${fixture.clinicId}/storefront`)
  ).json() as Promise<Storefront>;
}
async function saveStore(patch: Record<string, unknown> = {}, c = manager) {
  const s = await settings();
  return c.patch(root + `clinics/${fixture.clinicId}/storefront`, {
    data: {
      version: s.version,
      published: s.published,
      displayName: s.display_name,
      description: s.description,
      city: s.city,
      openingHours: s.opening_hours,
      deliveryPolicy: s.delivery_policy,
      returnPolicy: s.return_policy,
      logoAssetId: s.logo_asset_id,
      coverAssetId: s.cover_asset_id,
      publicationConsent: true,
      ...patch,
    },
  });
}
async function version(id = parent) {
  return (await db.query('SELECT version FROM products WHERE id=$1', [id]))
    .rows[0].version as number;
}
async function cookies(c: BrowserContext, role: string) {
  await c.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((x) => {
      const n = x.indexOf('=');
      return {
        name: x.slice(0, n),
        value: x.slice(n + 1),
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax' as const,
      };
    }),
  );
}
test.describe.serial('كتالوج بصور وخيارات ومتجر تابع للعيادة', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-catalog-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [manager, other, owner] = await Promise.all(
      ['manager', 'other', 'owner'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    parent = (
      await create(manager, `clinics/${fixture.clinicId}/products`, productData)
    ).id;
    variant = (
      await create(manager, `clinics/${fixture.clinicId}/products`, {
        ...productData,
        sku: randomUUID(),
        name: variantName,
        priceMinor: '18000000',
        parentProductId: parent,
        variantLabel: '2 كغ',
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([manager?.dispose(), other?.dispose(), owner?.dispose()]);
    await db.end();
  });
  test('صلاحيات العيادة ومجموعات SKU تمنع ربط عيادة أخرى أو خيار متداخل', async () => {
    expect((await editCatalog(catalogData, parent, other)).status()).toBe(403);
    expect((await saveStore({ city: 'تغيير غير مسموح' }, other)).status()).toBe(
      403,
    );
    const invalid = {
      ...productData,
      sku: randomUUID(),
      parentProductId: parent,
      variantLabel: 'اختبار',
    };
    expect(
      (
        await post(other, `clinics/${fixture.clinicB}/products`, invalid)
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(manager, `clinics/${fixture.clinicId}/products`, {
          ...invalid,
          parentProductId: variant,
        })
      ).status(),
    ).toBe(400);
    await expect(
      db.query(
        'UPDATE products SET parent_product_id=$2,variant_label=$3 WHERE id=$1',
        [parent, variant, 'invalid'],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('الصورة خاصة قبل النشر؛ رفض سرقة الصورة والمرفق الطبي وغياب الموافقة', async () => {
    const image = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=80x80',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    photo = (
      await create(manager, 'media', { dataBase64: image.toString('base64') })
    ).id;
    privatePhoto = (
      await create(other, 'media', { dataBase64: image.toString('base64') })
    ).id;
    const pet = (
      await create(manager, 'pets', {
        name: 'ملف طبي خاص بالمتجر',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    medicalPhoto = (
      await create(manager, 'media', {
        dataBase64: image.toString('base64'),
        petId: pet,
      })
    ).id;
    expect((await owner.get(root + `media/${photo}/file`)).status()).toBe(404);
    const unavailable = [] as string[];
    for (const [kind, status] of [
      ['video', 'ready'],
      ['image', 'pending'],
    ]) {
      const a = (
        await db.query(
          'INSERT INTO media_assets(owner_id,kind,status,mime,byte_count,storage_key) VALUES($1,$2,$3,$4,100,$5) RETURNING id',
          [
            fixture.accounts.manager!.id,
            kind,
            status,
            kind === 'video' ? 'video/mp4' : 'image/webp',
            `${randomUUID()}.upload`,
          ],
        )
      ).rows[0];
      unavailable.push(a.id);
    }
    try {
      for (const assetId of [privatePhoto, medicalPhoto, ...unavailable])
        expect(
          (
            await editCatalog({
              ...catalogData,
              images: [{ assetId, alt: 'صورة ممنوعة' }],
            })
          ).status(),
        ).toBe(400);
    } finally {
      // These deliberately invalid fixture rows have no backing files. Remove
      // only their generated IDs before another suite takes a media backup.
      await db.query('DELETE FROM media_assets WHERE id=ANY($1::uuid[])', [
        unavailable,
      ]);
    }
    expect(
      (
        await editCatalog({
          ...catalogData,
          images: [{ assetId: photo, alt: name }],
          publicationConsent: false,
        })
      ).status(),
    ).toBe(400);
    expect((await saveStore({ logoAssetId: medicalPhoto })).status()).toBe(400);
    await expect(
      db.query(
        'UPDATE clinic_storefronts SET logo_asset_id=$2 WHERE clinic_id=$1 AND is_primary',
        [fixture.clinicId, medicalPhoto],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(
        'INSERT INTO product_images(product_id,clinic_id,asset_id,position,alt,published_by) VALUES($1,$2,$3,0,$4,$5)',
        [
          parent,
          fixture.clinicId,
          medicalPhoto,
          'invalid medical image',
          fixture.accounts.manager!.id,
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await editCatalog({
          ...catalogData,
          images: [{ assetId: photo, alt: name }],
        })
      ).status(),
    ).toBe(200);
    const file = await owner.get(root + `media/${photo}/file`);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toContain('image/webp');
    expect((await editCatalog(catalogData)).status()).toBe(409);
  });
  test('حذف الصورة يلغي صلاحية قراءتها، والمشتري لا يرى التكلفة والموردين', async () => {
    expect(
      (
        await editCatalog({ ...catalogData, version: await version() })
      ).status(),
    ).toBe(200);
    expect((await owner.get(root + `media/${photo}/file`)).status()).toBe(404);
    expect(
      (
        await editCatalog({
          ...catalogData,
          version: await version(),
          images: [{ assetId: photo, alt: name }],
        })
      ).status(),
    ).toBe(200);
    const r = await owner.get(root + `products/${variant}`),
      detail = await r.json();
    expect(r.status()).toBe(200);
    expect(detail.variants.map((p: Product) => p.id).sort()).toEqual(
      [parent, variant].sort(),
    );
    for (const p of [detail.product, ...detail.variants]) {
      expect(p).not.toHaveProperty('cost_minor');
      expect(p).not.toHaveProperty('on_hand');
      expect(p).not.toHaveProperty('storage_key');
    }
  });
  test('كل خيار يملك مخزونه وسعره؛ الخادم يرفض السعر المزور والكمية الزائدة', async () => {
    const vendor = (
      await create(manager, `clinics/${fixture.clinicId}/vendors`, {
        name: 'مورد خيارات اختبار',
        contact: '',
      })
    ).id;
    for (const productId of [parent, variant]) {
      const po = await create(
        manager,
        `clinics/${fixture.clinicId}/purchases`,
        { productId, vendorId: vendor, quantity: 3, unitCost: '5000000' },
      );
      await create(
        manager,
        `clinics/${fixture.clinicId}/purchases/${po.id}/receive`,
      );
    }
    const input = {
      idempotencyKey: randomUUID(),
      items: [{ productId: variant, quantity: 2 }],
      address: 'عنوان اختبار بغداد فقط',
    };
    expect(
      (
        await post(owner, 'checkout', {
          ...input,
          items: [{ ...input.items[0], priceMinor: '1' }],
        })
      ).status(),
    ).toBe(400);
    const order = await create(owner, 'checkout', input);
    expect(order.total_minor).toBe('36000000');
    expect((await create(owner, 'checkout', input)).id).toBe(order.id);
    const rows = (
      await db.query(
        'SELECT id,reserved FROM products WHERE id=ANY($1::uuid[])',
        [[parent, variant]],
      )
    ).rows;
    expect(rows.find((p) => p.id === parent).reserved).toBe(0);
    expect(rows.find((p) => p.id === variant).reserved).toBe(2);
    expect(
      (
        await post(other, 'checkout', {
          ...input,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    await create(owner, `orders/${order.id}/cancel`);
  });
  test('إخفاء المتجر يحجب الكتالوج والصور والطلبات الجديدة ويحتفظ بالسجل', async () => {
    expect(
      (
        await saveStore({
          displayName: 'متجر الرفيق المعتمد',
          city: 'بغداد',
          logoAssetId: photo,
          coverAssetId: photo,
        })
      ).status(),
    ).toBe(200);
    const stale = (await settings()).version!;
    expect((await saveStore({ published: false })).status()).toBe(200);
    expect((await saveStore({ version: stale })).status()).toBe(409);
    expect(
      (await owner.get(root + `stores/${fixture.clinicId}`)).status(),
    ).toBe(404);
    expect((await owner.get(root + `products/${parent}`)).status()).toBe(404);
    expect((await owner.get(root + `media/${photo}/file`)).status()).toBe(404);
    expect(
      (await owner.get(root + `stores/${fixture.clinicId}/products`)).ok(),
    ).toBeTruthy();
    expect(
      await (
        await owner.get(root + `stores/${fixture.clinicId}/products`)
      ).json(),
    ).toEqual([]);
    expect(
      (
        await post(owner, 'me/cart', {
          items: [{ productId: variant, quantity: 1 }],
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await post(owner, 'checkout', {
          idempotencyKey: randomUUID(),
          items: [{ productId: variant, quantity: 1 }],
          address: 'عنوان اختبار بغداد',
        })
      ).status(),
    ).toBe(409);
    expect(
      (await manager.get(root + `clinics/${fixture.clinicId}/commerce`)).ok(),
    ).toBeTruthy();
    expect((await saveStore({ published: true })).status()).toBe(200);
    await db.query(
      "UPDATE clinics SET verification_status='suspended' WHERE id=$1",
      [fixture.clinicId],
    );
    expect((await owner.get(root + `media/${photo}/file`)).status()).toBe(404);
    expect((await owner.get(root + `products/${variant}`)).status()).toBe(404);
    await db.query(
      "UPDATE clinics SET verification_status='verified' WHERE id=$1",
      [fixture.clinicId],
    );
  });
  test('المتصفح يحفظ بيانات وصورة المنتج وإعدادات المتجر على الهاتف', async ({
    page,
    context,
  }) => {
    await cookies(context, 'manager');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${fixture.clinicId}/commerce`);
    const row = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await row.getByText('صور ومواصفات المنتج', { exact: true }).click();
    const upload = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=96x96',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    await row
      .getByLabel('صورة المنتج أو المتجر', { exact: true })
      .setInputFiles({
        name: 'catalog.png',
        mimeType: 'image/png',
        buffer: upload,
      });
    await row.getByRole('button', { name: 'رفع الملف وفحصه' }).click();
    await expect(row.locator('img.catalog-thumbnail')).toHaveCount(2);
    await row
      .getByLabel('العلامة التجارية', { exact: true })
      .fill('علامة محفوظة من المتصفح');
    await row
      .getByLabel('أوافق على نشر الصور المحددة للمشترين وأملك حق استخدامها')
      .check();
    await row.getByRole('button', { name: 'حفظ الصور والمواصفات' }).click();
    await expect
      .poll(
        async () =>
          (await (await owner.get(root + `products/${parent}`)).json()).product
            .brand,
      )
      .toBe('علامة محفوظة من المتصفح');
    await page.goto(`/clinic/${fixture.clinicId}/storefront`);
    await page
      .getByLabel('صورة المنتج أو المتجر', { exact: true })
      .setInputFiles({
        name: 'cover.png',
        mimeType: 'image/png',
        buffer: upload,
      });
    await page.getByRole('button', { name: 'رفع الملف وفحصه' }).click();
    await page.getByRole('button', { name: 'استخدام الصورة غلافاً' }).click();
    await page
      .getByLabel('سياسة التسليم', { exact: true })
      .fill('تسليم تجريبي داخل بغداد بعد التأكيد');
    await page
      .getByLabel('سياسة الإرجاع', { exact: true })
      .fill('تواصل مع العيادة لطلب إرجاع موثق');
    await page
      .getByLabel('أوافق على نشر الشعار والغلاف وأملك حق استخدامهما')
      .check();
    await page.getByRole('button', { name: 'حفظ إعدادات المتجر' }).click();
    await expect(page.getByText('تم الحفظ', { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('textbox', { name: 'سياسة التسليم', exact: true }),
    ).toHaveValue('تسليم تجريبي داخل بغداد بعد التأكيد');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    mkdirSync('docs/evidence', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/storefront-settings-390.png',
      fullPage: true,
    });
  });
  test('رحلة المتسوق: فلترة ثم اختيار SKU وصورة وإضافة للسلة دون تجاوز الشاشة', async ({
    page,
    context,
  }) => {
    await cookies(context, 'owner');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/marketplace');
    await page
      .getByRole('combobox', { name: 'التصنيف', exact: true })
      .selectOption('غذاء');
    await expect(
      page
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name, exact: true }) }),
    ).toBeVisible();
    await page.getByRole('link', { name, exact: true }).click();
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByRole('img', { name, exact: true })
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole('link', { name: /2 كغ ·/ }).click();
    await expect(
      page.getByRole('heading', { name: variantName, exact: true }),
    ).toBeVisible();
    await page.getByLabel(`كمية ${variantName}`, { exact: true }).fill('1');
    await page.getByRole('button', { name: 'إضافة الخيار للسلة' }).click();
    await expect(page.getByText('تم الحفظ', { exact: true })).toBeVisible();
    expect(await (await owner.get(root + 'me/cart')).json()).toContainEqual({
      product_id: variant,
      quantity: 1,
    });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: 'docs/evidence/product-variant-390.png',
      fullPage: true,
    });
    await page.goto(`/marketplace/stores/${fixture.clinicId}`);
    await expect(
      page.getByRole('heading', { name: 'متجر الرفيق المعتمد', exact: true }),
    ).toBeVisible();
    await page
      .getByText('سياسات المتجر وأوقات التوفر', { exact: true })
      .click();
    await expect(
      page.getByText('تسليم تجريبي داخل بغداد بعد التأكيد', { exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: 'docs/evidence/storefront-390.png',
      fullPage: true,
    });
  });
});
