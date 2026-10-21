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
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100',
  db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
    clinicId: string;
    accounts: Record<string, { id: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext;
let product: string, address: string, order: string, child: string;
const data = {
  label: 'عنوان اختبار خاص',
  contactName: 'مستلم الاختبار',
  phone: '+9647700000000',
  province: 'بغداد',
  city: 'بغداد',
  area: 'منطقة اختبار',
  street: 'PRIVATE-DELIVERY-STREET',
  building: '10',
  landmark: '',
};
async function create(c: APIRequestContext, p: string, data: unknown = {}) {
  const r = await c.post(root + p, { data });
  expect(r.status(), `${p}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function cookies(c: BrowserContext) {
  await c.addCookies(
    fixture.accounts.owner!.cookie.split('; ').map((x) => {
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
test.describe.serial('عنوان محفوظ ونسخة الطلب وتتبع خاص', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-delivery-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, manager] = await Promise.all(
      ['owner', 'other', 'manager'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    const base = `clinics/${fixture.clinicId}`;
    product = (
      await create(manager, base + '/products', {
        sku: randomUUID(),
        name: 'منتج تسليم خاص',
        description: 'اختبار بلا شحن حقيقي',
        species: 'all',
        priceMinor: '10000',
        costMinor: '2000',
      })
    ).id;
    const vendor = (
      await create(manager, base + '/vendors', {
        name: 'مورد تسليم',
        contact: '',
      })
    ).id;
    const po = await create(manager, base + '/purchases', {
      productId: product,
      vendorId: vendor,
      quantity: 3,
      unitCost: '2000',
    });
    await create(manager, base + `/purchases/${po.id}/receive`);
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), other?.dispose(), manager?.dispose()]);
    await db.end();
  });
  test('العنوان لصاحب الجلسة فقط، والطلب يحفظ نسخة مستقلة مع تكرار آمن', async () => {
    address = (await create(owner, 'me/delivery-addresses', data)).id;
    expect(
      await (await other.get(root + 'me/delivery-addresses')).json(),
    ).toEqual([]);
    expect(
      (
        await other.patch(root + `me/delivery-addresses/${address}`, {
          data: { ...data, version: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await other.delete(root + `me/delivery-addresses/${address}`)).status(),
    ).toBe(404);
    const input = {
      idempotencyKey: randomUUID(),
      items: [{ productId: product, quantity: 1 }],
      addressId: address,
    };
    expect(
      (await other.post(root + 'checkout', { data: input })).status(),
    ).toBe(404);
    order = (await create(owner, 'checkout', input)).id;
    expect(
      (
        await owner.patch(root + `me/delivery-addresses/${address}`, {
          data: { ...data, street: 'عنوان جديد لا يغير الطلب', version: 1 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await owner.patch(root + `me/delivery-addresses/${address}`, {
          data: { ...data, version: 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await owner.delete(root + `me/delivery-addresses/${address}`)).status(),
    ).toBe(200);
    expect((await create(owner, 'checkout', input)).id).toBe(order);
    const saved = (
      await db.query(
        'SELECT address,shipping_address FROM checkout_orders WHERE id=$1',
        [order],
      )
    ).rows[0];
    expect(saved.shipping_address.street).toBe('PRIVATE-DELIVERY-STREET');
    expect(saved.address).toContain('PRIVATE-DELIVERY-STREET');
  });
  test('التتبع للعيادة فقط وأحداث التجهيز/الشحن/التسليم لا تعدل', async () => {
    await create(owner, `sandbox/orders/${order}/capture`, {
      eventKey: randomUUID(),
    });
    child = (
      await db.query('SELECT id FROM clinic_orders WHERE parent_id=$1', [order])
    ).rows[0].id;
    const path = `clinics/${fixture.clinicId}/orders/${child}/tracking`,
      tracking = {
        carrier: 'ناقل اختبار يدوي',
        trackingCode: 'TEST-TRACK-001',
        version: 0,
      };
    expect((await other.post(root + path, { data: tracking })).status()).toBe(
      403,
    );
    await create(manager, path, tracking);
    expect((await manager.post(root + path, { data: tracking })).status()).toBe(
      409,
    );
    for (const status of ['packed', 'shipped', 'delivered'])
      await create(
        manager,
        `clinics/${fixture.clinicId}/orders/${child}/transition`,
        { status },
      );
    const result = await (await owner.get(root + 'me/orders')).json(),
      saved = result.find((o: { id: string }) => o.id === order).children[0];
    expect(saved.shipment).toMatchObject({
      carrier: tracking.carrier,
      tracking_code: tracking.trackingCode,
    });
    expect(
      saved.shipment_events.map((e: { status: string }) => e.status),
    ).toEqual(['packed', 'shipped', 'delivered']);
    await expect(
      db.query("UPDATE shipment_events SET status='packed' WHERE order_id=$1", [
        child,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (await (await other.get(root + 'me/orders')).json()).some(
        (o: { id: string }) => o.id === order,
      ),
    ).toBe(false);
  });
  test('المتصفح يحفظ عنواناً ويختاره للشراء دون إدخال نص مباشر', async ({
    page,
    context,
  }) => {
    await cookies(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/marketplace');
    await page.getByText('إضافة عنوان تسليم', { exact: true }).click();
    const fields = [
      ['تسمية العنوان', 'عنوان محفوظ من المتصفح'],
      ['اسم مستلم التسليم', 'مستلم الواجهة'],
      ['رقم اتصال التسليم', '+9647700000001'],
      ['المحافظة', 'بغداد'],
      ['مدينة التسليم', 'بغداد'],
      ['المنطقة', 'منطقة اختبار'],
      ['الشارع', 'شارع اختبار خاص'],
      ['البناية', '20'],
    ];
    for (const [name, value] of fields)
      await page.getByRole('textbox', { name, exact: true }).fill(value!);
    await page
      .getByRole('button', { name: 'حفظ عنوان التسليم', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'عنوان محفوظ من المتصفح',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('كمية منتج تسليم خاص', { exact: true }).fill('1');
    await page
      .getByRole('combobox', { name: 'عنوان محفوظ', exact: true })
      .selectOption({ label: 'عنوان محفوظ من المتصفح' });
    await page
      .getByRole('button', { name: 'معاينة السعر النهائي', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'السعر النهائي', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'حجز الطلب الاختباري', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT count(*)::int n FROM checkout_orders WHERE user_id=$1 AND shipping_address->>'street'=$2",
              [fixture.accounts.owner!.id, 'شارع اختبار خاص'],
            )
          ).rows[0].n,
      )
      .toBe(1);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    mkdirSync('docs/evidence', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/delivery-tracking-390.png',
      fullPage: true,
    });
  });
});
