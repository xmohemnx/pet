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
import type { CheckoutQuote } from '../../packages/contracts/src';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100',
  db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
    clinicId: string;
    clinicB: string;
    accounts: Record<string, { id: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext;
let p1: string, p2: string, pB: string;
const address = 'عنوان اختبار تسعير خاص';
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function coupon(code: string, over: Record<string, unknown> = {}) {
  return post(manager, `clinics/${fixture.clinicId}/coupons`, {
    code,
    kind: 'fixed',
    value: '100',
    minimumMinor: '0',
    maximumDiscountMinor: null,
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    maxUses: 100,
    maxPerUser: 100,
    ...over,
  });
}
async function quote(
  c: APIRequestContext,
  items: { productId: string; quantity: number }[],
  code?: string,
): Promise<CheckoutQuote> {
  return post(c, 'checkout/quote', {
    items,
    coupons: code ? [{ clinicId: fixture.clinicId, code }] : [],
  });
}
async function order(
  c: APIRequestContext,
  items: { productId: string; quantity: number }[],
  code?: string,
  q?: CheckoutQuote,
  key = randomUUID(),
) {
  return post(c, 'checkout', {
    idempotencyKey: key,
    items,
    address,
    quoteHash: (q ?? (await quote(c, items, code))).quoteHash,
    coupons: code ? [{ clinicId: fixture.clinicId, code }] : [],
  });
}
async function tax(rate: number) {
  const data = await (
    await manager.get(root + `clinics/${fixture.clinicId}/pricing`)
  ).json();
  return post(manager, `clinics/${fixture.clinicId}/tax-settings`, {
    rateBps: rate,
    label: 'ضريبة اختبار محلي',
    version: data.tax.version,
  });
}
async function cookies(context: BrowserContext, role = 'owner') {
  await context.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((c) => {
      const n = c.indexOf('=');
      return {
        name: c.slice(0, n),
        value: c.slice(n + 1),
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax' as const,
      };
    }),
  );
}
test.describe.serial('خصم وضريبة ومرتجع دقيق مع حدود ذرية', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-pricing-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, manager, doctor] = await Promise.all(
      ['owner', 'other', 'manager', 'doctor'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    async function product(
      c: APIRequestContext,
      clinic: string,
      name: string,
      price: string,
    ) {
      const base = `clinics/${clinic}`,
        p = await post(c, base + '/products', {
          sku: randomUUID(),
          name,
          description: 'تسعير اصطناعي',
          species: 'all',
          priceMinor: price,
          costMinor: '100',
        }),
        v = await post(c, base + '/vendors', {
          name: 'مورد اختبار تسعير',
          contact: '',
        }),
        po = await post(c, base + '/purchases', {
          productId: p.id,
          vendorId: v.id,
          quantity: 50,
          unitCost: '100',
        });
      await post(c, base + `/purchases/${po.id}/receive`);
      return p.id;
    }
    p1 = await product(manager, fixture.clinicId, 'منتج تسعير دقيق', '1000');
    p2 = await product(manager, fixture.clinicId, 'منتج كوبون متزامن', '2000');
    pB = await product(
      other,
      fixture.clinicB,
      'منتج العيادة الأخرى للتسعير',
      '5000',
    );
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      other?.dispose(),
      manager?.dispose(),
      doctor?.dispose(),
    ]);
    await db.end();
  });
  test('الصلاحيات وMFA وشروط الرمز ثابتة والتعطيل بإصدار متفائل', async () => {
    expect(
      (await owner.get(root + `clinics/${fixture.clinicId}/pricing`)).status(),
    ).toBe(403);
    expect(
      (await other.get(root + `clinics/${fixture.clinicId}/pricing`)).status(),
    ).toBe(403);
    expect(
      (
        await doctor.post(root + `clinics/${fixture.clinicId}/tax-settings`, {
          data: { rateBps: 250, label: 'اختبار', version: 0 },
        })
      ).status(),
    ).toBe(403);
    await tax(250);
    const c = await coupon('TERMS');
    await expect(
      db.query(
        'UPDATE commerce_coupons SET value=1,version=version+1 WHERE id=$1',
        [c.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await other.patch(
          root + `clinics/${fixture.clinicId}/coupons/${c.id}`,
          { data: { active: false, version: 1 } },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await manager.patch(
          root + `clinics/${fixture.clinicId}/coupons/${c.id}`,
          { data: { active: false, version: 1 } },
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await manager.patch(
          root + `clinics/${fixture.clinicId}/coupons/${c.id}`,
          { data: { active: true, version: 1 } },
        )
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: {
            items: [{ productId: p1, quantity: 1 }],
            coupons: [{ clinicId: fixture.clinicId, code: 'TERMS' }],
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.patch(
          root + `clinics/${fixture.clinicId}/coupons/${c.id}`,
          { data: { active: true, version: 2 } },
        )
      ).status(),
    ).toBe(200);
    await coupon('MINIMUM', { minimumMinor: '5000' });
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: {
            items: [{ productId: p1, quantity: 1 }],
            coupons: [{ clinicId: fixture.clinicId, code: 'MINIMUM' }],
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: {
            items: [{ productId: p1, quantity: 1 }],
            coupons: [
              { clinicId: fixture.clinicId, code: 'TERMS' },
              { clinicId: fixture.clinicId, code: 'MINIMUM' },
            ],
          },
        })
      ).status(),
    ).toBe(400);
  });
  test('المعاينة لا تثق بسعر العميل وتعيد التحقق عند تبدل الإعداد والطلب يحفظ لقطة', async () => {
    const items = [{ productId: p1, quantity: 3 }];
    await coupon('EXACT');
    const q = await quote(owner, items, 'exact');
    expect(q).toMatchObject({
      subtotalMinor: '3000',
      discountMinor: '100',
      taxMinor: '73',
      totalMinor: '2973',
    });
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: { items, totalMinor: '1' },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await owner.post(root + 'checkout', {
          data: {
            idempotencyKey: randomUUID(),
            items,
            address,
            coupons: [{ clinicId: fixture.clinicId, code: 'EXACT' }],
          },
        })
      ).status(),
    ).toBe(409);
    await tax(500);
    expect(
      (
        await owner.post(root + 'checkout', {
          data: {
            idempotencyKey: randomUUID(),
            items,
            address,
            quoteHash: q.quoteHash,
            coupons: [{ clinicId: fixture.clinicId, code: 'EXACT' }],
          },
        })
      ).status(),
    ).toBe(409);
    await tax(250);
    const fresh = await quote(owner, items, 'EXACT'),
      key = randomUUID(),
      o = await order(owner, items, 'EXACT', fresh, key);
    await tax(800);
    expect((await order(owner, items, 'EXACT', fresh, key)).id).toBe(o.id);
    await expect(
      db.query(
        'UPDATE checkout_orders SET tax_minor=0,total_minor=2900 WHERE id=$1',
        [o.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const child = (
      await db.query('SELECT * FROM clinic_orders WHERE parent_id=$1', [o.id])
    ).rows[0];
    await expect(
      db.query('UPDATE order_lines SET discount_minor=0 WHERE order_id=$1', [
        child.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(child.tax_minor).toBe('73');
    await post(owner, `sandbox/orders/${o.id}/capture`, {
      eventKey: randomUUID(),
    });
    await post(owner, `sandbox/orders/${o.id}/capture`, {
      eventKey: randomUUID(),
    });
    for (const status of ['packed', 'shipped', 'delivered'])
      await post(
        manager,
        `clinics/${fixture.clinicId}/orders/${child.id}/transition`,
        { status },
      );
    const sale = (
      await db.query(
        'SELECT l.account_code,l.credit::text FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE j.source_key=$1',
        [`sale:${child.id}`],
      )
    ).rows;
    expect(sale).toContainEqual({ account_code: '4000', credit: '2900' });
    expect(sale).toContainEqual({ account_code: '2400', credit: '73' });
    const line = (
      await db.query('SELECT id FROM order_lines WHERE order_id=$1', [child.id])
    ).rows[0];
    const refunded = [];
    for (let n = 0; n < 3; n++) {
      const r = await post(owner, `order-lines/${line.id}/returns`, {
        quantity: 1,
        reason: 'مرتجع اختبار وحدات دقيقة',
      });
      const result = await post(
        manager,
        `clinics/${fixture.clinicId}/returns/${r.id}/approve`,
        { restock: true },
      );
      refunded.push(result.amountMinor);
      expect(
        (
          await manager.post(
            root + `clinics/${fixture.clinicId}/returns/${r.id}/approve`,
            { data: { restock: true } },
          )
        ).status(),
      ).toBe(409);
    }
    expect(refunded).toEqual(['990', '991', '992']);
    const balances = (
      await db.query(
        "SELECT l.account_code,sum(l.debit-l.credit)::text balance FROM journal_lines l JOIN journals j ON j.id=l.journal_id JOIN ledger_entities e ON e.id=l.entity_id WHERE e.clinic_id=$1 AND (j.source_key=$2 OR j.source_key LIKE 'return-sale:%' OR j.source_key LIKE 'return-fee:%' OR j.source_key=$3 OR j.source_key=$4) GROUP BY l.account_code",
        [
          fixture.clinicId,
          `sale:${child.id}`,
          `commission:${child.id}`,
          `capture:${child.id}`,
        ],
      )
    ).rows;
    for (const account of ['4000', '2400', '5100', '1200'])
      expect(
        balances.find((b) => b.account_code === account)?.balance ?? '0',
      ).toBe('0');
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM journals j WHERE status='posted' AND (SELECT coalesce(sum(debit-credit),0) FROM journal_lines WHERE journal_id=j.id)<>0",
        )
      ).rows[0].n,
    ).toBe(0);
    await tax(250);
  });
  test('آخر استخدام لا يتجاوز الحد مع منتجين متزامنين والإلغاء والانتهاء يحرران الحجز', async () => {
    await coupon('LASTONE', { maxUses: 1, maxPerUser: 1 });
    const a = [{ productId: p1, quantity: 1 }],
      b = [{ productId: p2, quantity: 1 }],
      qa = await quote(owner, a, 'LASTONE'),
      qb = await quote(other, b, 'LASTONE');
    const contexts = [owner, other],
      sets = [a, b],
      quotes = [qa, qb];
    const results = await Promise.all(
      contexts.map((c, n) =>
        c.post(root + 'checkout', {
          data: {
            idempotencyKey: randomUUID(),
            items: sets[n],
            address,
            quoteHash: quotes[n]!.quoteHash,
            coupons: [{ clinicId: fixture.clinicId, code: 'LASTONE' }],
          },
        }),
      ),
    );
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    const winner = results.findIndex((r) => r.status() === 201),
      saved = await results[winner]!.json();
    await post(contexts[winner]!, `orders/${saved.id}/cancel`);
    const next = await order(owner, a, 'LASTONE');
    await db.query(
      "UPDATE checkout_orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [next.id],
    );
    const final = await order(other, b, 'LASTONE');
    await post(other, `sandbox/orders/${final.id}/capture`, {
      eventKey: randomUUID(),
    });
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: {
            items: a,
            coupons: [{ clinicId: fixture.clinicId, code: 'LASTONE' }],
          },
        })
      ).status(),
    ).toBe(409);
  });
  test('حد العميل مستقل عن الحد العام والخصم والنسبة لا يتسربان لعيادة أخرى', async () => {
    await coupon('ONEUSER', { maxUses: 10, maxPerUser: 1 });
    const a = [{ productId: p1, quantity: 1 }];
    const used = await order(owner, a, 'ONEUSER');
    await post(owner, `sandbox/orders/${used.id}/capture`, {
      eventKey: randomUUID(),
    });
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: {
            items: a,
            coupons: [{ clinicId: fixture.clinicId, code: 'ONEUSER' }],
          },
        })
      ).status(),
    ).toBe(409);
    await quote(other, a, 'ONEUSER');
    await coupon('PERCENT', {
      kind: 'percent',
      value: '5000',
      maximumDiscountMinor: '101',
    });
    const q = await quote(
      owner,
      [
        { productId: p1, quantity: 3 },
        { productId: p2, quantity: 1 },
        { productId: pB, quantity: 1 },
      ],
      'PERCENT',
    );
    const own = q.groups.find((g) => g.clinicId === fixture.clinicId)!,
      otherGroup = q.groups.find((g) => g.clinicId === fixture.clinicB)!;
    expect(own.discountMinor).toBe('101');
    expect(
      own.lines.map((l) => BigInt(l.discountMinor)).reduce((a, b) => a + b, 0n),
    ).toBe(101n);
    expect(otherGroup).toMatchObject({
      discountMinor: '0',
      taxMinor: '0',
      totalMinor: '5000',
      couponCode: null,
    });
    const mixed = await order(
      owner,
      [
        { productId: p1, quantity: 3 },
        { productId: p2, quantity: 1 },
        { productId: pB, quantity: 1 },
      ],
      'PERCENT',
      q,
    );
    expect(mixed.total_minor).toBe(q.totalMinor);
    await post(owner, `orders/${mixed.id}/cancel`);
    expect(
      (
        await owner.post(root + 'checkout/quote', {
          data: {
            items: [{ productId: pB, quantity: 1 }],
            coupons: [{ clinicId: fixture.clinicId, code: 'PERCENT' }],
          },
        })
      ).status(),
    ).toBe(400);
  });
  test('واجهة الهاتف تنشئ كوبوناً وتعاين الخصم والضريبة وتحجز الطلب الحقيقي', async ({
    page,
    context,
  }) => {
    await cookies(context, 'manager');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${fixture.clinicId}/promotions`);
    await page
      .getByRole('textbox', { name: 'رمز الكوبون', exact: true })
      .fill('BROWSER');
    await page
      .getByRole('textbox', { name: 'قيمة الخصم', exact: true })
      .fill('100');
    const date = new Date(Date.now() + 3 * 3600000).toISOString();
    await page
      .getByLabel('بداية الكوبون بتوقيت بغداد', { exact: true })
      .fill(date.slice(0, 16));
    await page
      .getByLabel('نهاية الكوبون بتوقيت بغداد', { exact: true })
      .fill(new Date(Date.now() + 27 * 3600000).toISOString().slice(0, 16));
    await page
      .getByRole('button', { name: 'إنشاء الكوبون', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'BROWSER', exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    mkdirSync('docs/evidence', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/promotions-390.png',
      fullPage: true,
    });
    await context.clearCookies();
    await cookies(context);
    await page.goto('/marketplace');
    await page.getByLabel('كمية منتج تسعير دقيق', { exact: true }).fill('3');
    await page.getByRole('textbox', { name: /كوبون/ }).fill('BROWSER');
    await page
      .getByRole('button', { name: 'معاينة السعر النهائي', exact: true })
      .click();
    const region = page.getByRole('region', {
      name: 'السعر النهائي',
      exact: true,
    });
    await expect(region).toContainText('BROWSER');
    await page
      .getByRole('textbox', { name: 'عنوان التسليم الخاص', exact: true })
      .fill(address);
    await page
      .getByRole('button', { name: 'حجز الطلب الاختباري', exact: true })
      .click();
    await expect(
      page.getByText('الكوبون: BROWSER', { exact: false }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/evidence/checkout-promotions-390.png',
      fullPage: true,
    });
  });
});
