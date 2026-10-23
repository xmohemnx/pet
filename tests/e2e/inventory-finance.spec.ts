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
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
  clinicId: string;
  clinicB: string;
  branchId: string;
  accounts: Record<string, { id: string; cookie: string }>;
};
let manager: APIRequestContext,
  other: APIRequestContext,
  owner: APIRequestContext,
  doctor: APIRequestContext,
  accountant: APIRequestContext,
  cashier: APIRequestContext;
let product: string,
  po: string,
  vendor: string,
  warehouse: string,
  second: string,
  validLayer: string,
  expiredLayer: string,
  writeoff: string;
const day = (offset = 0) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offset * 86400000));
async function create(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
const base = () => `clinics/${fixture.clinicId}`;
async function inventory(c = manager) {
  const r = await c.get(root + base() + '/inventory');
  expect(r.status()).toBe(200);
  return r.json();
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
test.describe.serial('مستودعات ودفعات واستلام جزئي واعتماد وتقارير', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-inventory-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [manager, other, owner, doctor, cashier, accountant] = await Promise.all(
      ['manager', 'other', 'owner', 'doctor', 'cashier', 'accountant'].map(
        (role) =>
          factory.newContext({
            extraHTTPHeaders: {
              Origin: origin,
              Cookie: fixture.accounts[role]!.cookie,
            },
          }),
      ),
    );
    product = (
      await create(manager, base() + '/products', {
        sku: randomUUID(),
        name: 'غذاء دفعات اختباري',
        description: 'دفعات غير حقيقية',
        species: 'all',
        priceMinor: '5000',
        costMinor: '2000',
      })
    ).id;
    vendor = (
      await create(manager, base() + '/vendors', {
        name: 'مورد الدفعات',
        contact: '',
      })
    ).id;
    po = (
      await create(manager, base() + '/purchases', {
        productId: product,
        vendorId: vendor,
        quantity: 10,
        unitCost: '2000',
      })
    ).id;
    warehouse = (await inventory()).warehouses[0].id;
  });
  test.afterAll(async () => {
    await Promise.all([
      manager?.dispose(),
      other?.dispose(),
      owner?.dispose(),
      doctor?.dispose(),
      accountant?.dispose(),
      cashier?.dispose(),
    ]);
    await db.end();
  });
  test('المستودع والدفعة داخل العيادة؛ الاستلام الجزئي لا يتجاوز PO ولا يتكرر', async () => {
    expect((await other.get(root + base() + '/inventory')).status()).toBe(403);
    second = (
      await create(manager, base() + '/warehouses', {
        name: 'مستودع الفرع',
        branchId: fixture.branchId,
      })
    ).id;
    expect(
      (
        await other.post(root + `clinics/${fixture.clinicB}/warehouses`, {
          data: { name: 'خاطئ', branchId: fixture.branchId },
        })
      ).status(),
    ).toBe(400);
    const input = {
      idempotencyKey: randomUUID(),
      warehouseId: warehouse,
      quantity: 4,
      batchCode: 'VALID-LOT',
      expiresOn: day(10),
    };
    const [a, b] = await Promise.all([
      create(manager, base() + `/purchases/${po}/receipts`, input),
      create(manager, base() + `/purchases/${po}/receipts`, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      (
        await manager.post(root + base() + `/purchases/${po}/bill`, {
          data: {},
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + base() + `/purchases/${po}/receipts`, {
          data: { ...input, quantity: 5 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + base() + `/purchases/${po}/receipts`, {
          data: { ...input, idempotencyKey: randomUUID(), quantity: 7 },
        })
      ).status(),
    ).toBe(409);
    await create(manager, base() + `/purchases/${po}/receipts`, {
      ...input,
      idempotencyKey: randomUUID(),
      quantity: 6,
      batchCode: 'EXPIRED-LOT',
      expiresOn: day(-2),
    });
    await create(manager, base() + `/purchases/${po}/bill`);
    const d = await inventory();
    validLayer = d.layers.find(
      (l: { batch_code: string }) => l.batch_code === 'VALID-LOT',
    ).id;
    expiredLayer = d.layers.find(
      (l: { batch_code: string }) => l.batch_code === 'EXPIRED-LOT',
    ).id;
    expect(
      d.products.find((p: { id: string }) => p.id === product),
    ).toMatchObject({ on_hand: 10, eligible: 4, available: 4 });
    expect(
      (
        await db.query(
          'SELECT received_quantity FROM purchase_orders WHERE id=$1',
          [po],
        )
      ).rows[0].received_quantity,
    ).toBe(10);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM purchase_receipts WHERE po_id=$1',
          [po],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  test('منع المنتهي وسباق الحجز والحجر؛ نقل الدفعة يحفظ الكلفة والرصيد', async () => {
    const checkout = {
      idempotencyKey: randomUUID(),
      items: [{ productId: product, quantity: 3 }],
      address: 'عنوان اختبار دفعات فقط',
    };
    const r = await Promise.all([
      owner.post(root + 'checkout', {
        data: { ...checkout, idempotencyKey: randomUUID() },
      }),
      other.post(root + 'checkout', {
        data: { ...checkout, idempotencyKey: randomUUID() },
      }),
    ]);
    expect(r.map((x) => x.status()).sort()).toEqual([201, 409]);
    expect(
      (
        await manager.post(
          root + base() + `/inventory/${validLayer}/quarantine`,
          { data: { quarantined: true, reason: 'حجر لا يستهلك الحجز الحالي' } },
        )
      ).status(),
    ).toBe(409);
    const winner = r[0]!.status() === 201 ? owner : other,
      order = await r.find((x) => x.status() === 201)!.json();
    await create(winner, `orders/${order.id}/cancel`);
    const transfer = {
      layerId: validLayer,
      warehouseId: second,
      quantity: 2,
      idempotencyKey: randomUUID(),
    };
    const t = await create(manager, base() + '/inventory/transfers', transfer);
    expect(
      (await create(manager, base() + '/inventory/transfers', transfer)).id,
    ).toBe(t.id);
    const moved = (await inventory()).layers.find(
      (l: { id: string }) => l.id === t.target_layer,
    );
    expect(moved).toMatchObject({
      remaining: 2,
      unit_cost: '2000',
      batch_code: 'VALID-LOT',
      quarantined: false,
    });
    expect(moved.expires_on.slice(0, 10)).toBe(day(10));
    await create(manager, base() + `/inventory/${validLayer}/quarantine`, {
      quarantined: true,
      reason: 'حجر تشغيلي موثق للاختبار',
    });
    expect(
      (await inventory()).products.find((p: { id: string }) => p.id === product)
        .available,
    ).toBe(2);
    expect(
      (
        await owner.post(root + 'checkout', {
          data: { ...checkout, idempotencyKey: randomUUID() },
        })
      ).status(),
    ).toBe(409);
    await create(manager, base() + `/inventory/${validLayer}/quarantine`, {
      quarantined: false,
      reason: 'فك الحجر بعد فحص اصطناعي',
    });
  });
  test('الإتلاف يتطلب شخصاً ثانياً وMFA ويولد قيداً متوازناً مرة واحدة', async () => {
    const input = {
      layerId: expiredLayer,
      quantity: 2,
      reason: 'إتلاف وحدتين منتهيتين للاختبار',
      idempotencyKey: randomUUID(),
    };
    writeoff = (await create(manager, base() + '/inventory/writeoffs', input))
      .id;
    expect(
      (await create(manager, base() + '/inventory/writeoffs', input)).id,
    ).toBe(writeoff);
    expect(
      (
        await manager.post(
          root + base() + `/inventory/writeoffs/${writeoff}/decision`,
          { data: { decision: 'approved' } },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await doctor.post(
          root + base() + `/inventory/writeoffs/${writeoff}/decision`,
          { data: { decision: 'approved' } },
        )
      ).status(),
    ).toBe(403);
    const [a, b] = await Promise.all([
      create(cashier, base() + `/inventory/writeoffs/${writeoff}/decision`, {
        decision: 'approved',
      }),
      create(cashier, base() + `/inventory/writeoffs/${writeoff}/decision`, {
        decision: 'approved',
      }),
    ]);
    expect(a.status).toBe('approved');
    expect(b.status).toBe('approved');
    const q = await db.query(
      'SELECT j.id,sum(l.debit-l.credit)::text diff,count(*)::int lines FROM journals j JOIN journal_lines l ON l.journal_id=j.id WHERE j.source_key=$1 GROUP BY j.id',
      [`writeoff:${writeoff}`],
    );
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0]).toMatchObject({ diff: '0', lines: 2 });
    expect(
      (await inventory(cashier)).products.find(
        (p: { id: string }) => p.id === product,
      ),
    ).toMatchObject({ on_hand: 8, eligible: 4, available: 4 });
  });
  test('السداد الجزئي وأعمار المستحقات حسب التاريخ؛ لا صرف زائد أو عبر العيادات', async () => {
    await db.query(
      'UPDATE purchase_orders SET due_on=$2::date-40 WHERE id=$1',
      [po, day()],
    );
    const path = base() + '/finance/statements?asOf=' + day();
    expect((await other.get(root + path)).status()).toBe(403);
    const first = await create(accountant, base() + '/finance/approvals', {
      kind: 'vendor_payment',
      sourceId: po,
      reason: 'دفعة جزئية تجريبية موثقة',
      amountMinor: '7000',
    });
    await create(cashier, base() + `/finance/approvals/${first.id}/approve`);
    const report = await (await accountant.get(root + path)).json();
    expect(report.aging.days31to60).toBe('13000');
    expect(report.statements.difference).toBe('0');
    expect(report.statements.expenses).toBe('4000');
    expect(
      (
        await accountant.post(root + base() + '/finance/approvals', {
          data: {
            kind: 'vendor_payment',
            sourceId: po,
            reason: 'محاولة تجاوز المستحق المتبقي',
            amountMinor: '13001',
          },
        })
      ).status(),
    ).toBe(409);
    const input = {
      kind: 'vendor_payment',
      sourceId: po,
      reason: 'تسديد ما تبقى من المستحق',
    };
    const attempts = await Promise.all([
      accountant.post(root + base() + '/finance/approvals', { data: input }),
      accountant.post(root + base() + '/finance/approvals', { data: input }),
    ]);
    expect(attempts.map((r) => r.status()).sort()).toEqual([201, 409]);
    const approval = await attempts.find((r) => r.status() === 201)!.json();
    await create(cashier, base() + `/finance/approvals/${approval.id}/reject`);
    expect(
      (
        await cashier.post(
          root + base() + `/finance/approvals/${approval.id}/approve`,
          { data: {} },
        )
      ).status(),
    ).toBe(409);
    const replacement = await create(
      accountant,
      base() + '/finance/approvals',
      input,
    );
    await create(
      cashier,
      base() + `/finance/approvals/${replacement.id}/approve`,
    );
    expect(
      (
        await cashier.post(
          root + base() + `/finance/approvals/${approval.id}/approve`,
          { data: {} },
        )
      ).status(),
    ).toBe(409);
    expect(
      (
        await db.query(
          'SELECT sum(amount_minor)::text total,count(*)::int n FROM vendor_payments WHERE po_id=$1',
          [po],
        )
      ).rows[0],
    ).toMatchObject({ total: '20000', n: 2 });
    const historic = await (
      await accountant.get(
        root + base() + '/finance/statements?asOf=' + day(-1),
      )
    ).json();
    expect(historic.statements.assets).toBe('0');
    expect(historic.payables).toEqual([]);
  });
  test('شحن طلب بعد انتهاء دفعته يرفض ولا يخصم المنتهي', async () => {
    const order = await create(owner, 'checkout', {
      idempotencyKey: randomUUID(),
      items: [{ productId: product, quantity: 4 }],
      address: 'عنوان اختبار انتهاء بعد الحجز',
    });
    await create(owner, `sandbox/orders/${order.id}/capture`, {
      eventKey: randomUUID(),
    });
    const child = (
      await db.query('SELECT id FROM clinic_orders WHERE parent_id=$1', [
        order.id,
      ])
    ).rows[0].id;
    await create(manager, base() + `/orders/${child}/transition`, {
      status: 'packed',
    });
    await db.query(
      'UPDATE inventory_layers SET expires_on=$2 WHERE product_id=$1 AND batch_code=$3',
      [product, day(-1), 'VALID-LOT'],
    );
    expect(
      (
        await manager.post(root + base() + `/orders/${child}/transition`, {
          data: { status: 'shipped' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await db.query('SELECT on_hand,reserved FROM products WHERE id=$1', [
          product,
        ])
      ).rows[0],
    ).toEqual({ on_hand: 8, reserved: 4 });
    await db.query(
      'UPDATE inventory_layers SET expires_on=$2 WHERE product_id=$1 AND batch_code=$3',
      [product, day(10), 'VALID-LOT'],
    );
    await create(manager, base() + `/orders/${child}/transition`, {
      status: 'shipped',
    });
  });
  test('واجهات المستودعات والتقارير تحفظ وتعكس القاعدة وتدعم الهاتف والوصول', async ({
    page,
    context,
  }) => {
    await cookies(context, 'manager');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${fixture.clinicId}/inventory`);
    await page
      .getByRole('textbox', { name: 'اسم المستودع', exact: true })
      .fill('مستودع محفوظ من الواجهة');
    await page
      .getByRole('button', { name: 'إضافة مستودع', exact: true })
      .click();
    await expect(
      page
        .getByRole('paragraph')
        .filter({ hasText: /^مستودع محفوظ من الواجهة$/ }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByRole('paragraph')
        .filter({ hasText: /^مستودع محفوظ من الواجهة$/ }),
    ).toBeVisible();
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
      path: 'docs/evidence/inventory-batches-390.png',
      fullPage: true,
    });
    await page.goto(`/clinic/${fixture.clinicId}/finance/statements`);
    await expect(
      page.getByRole('heading', { name: 'الدخل والمركز المالي', exact: true }),
    ).toBeVisible();
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
      path: 'docs/evidence/financial-statements-390.png',
      fullPage: true,
    });
  });
});
