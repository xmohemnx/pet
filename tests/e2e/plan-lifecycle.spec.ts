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
let f: {
    clinicId: string;
    clinicB: string;
    branchId: string;
    branchB: string;
    accounts: Record<string, { id: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext;
let pet: string,
  serviceA: string,
  serviceB: string,
  serviceC: string,
  branch2: string,
  plan: string,
  visitNumber = 0;
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function bad(
  c: APIRequestContext,
  path: string,
  data: unknown,
  status = 409,
) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
}
const terms = (extra: Record<string, unknown> = {}) => ({
  name: 'باقة حقوق متعددة اختبارية',
  category: 'وقائية اختبارية',
  priceMinor: '10001',
  validDays: 30,
  branchId: f.branchId,
  waitingDays: 0,
  maxPauseDays: 30,
  entitlements: [
    { serviceId: serviceA, uses: 1 },
    { serviceId: serviceB, uses: 2 },
  ],
  ...extra,
});
const buy = (planId = plan, petId = pet) =>
  post(owner, 'sandbox/subscriptions', {
    planId,
    petId,
    idempotencyKey: randomUUID(),
    priceMinor: '10001',
  });
async function mine(id: string) {
  const rows = (await (await owner.get(root + 'me/services')).json())
    .subscriptions;
  return rows.find((s: { id: string }) => s.id === id);
}
async function visit(
  service = serviceA,
  branch = f.branchId,
  petId = pet,
  minutesAgo = 0,
) {
  const slot = await post(doctor, `clinics/${f.clinicId}/slots`, {
    serviceId: service,
    branchId: branch,
    startsAt: new Date(
      Date.now() + (++visitNumber + 1) * 86400000,
    ).toISOString(),
  });
  const a = await post(owner, 'appointments', {
    petId,
    slotId: slot.id,
    idempotencyKey: randomUUID(),
  });
  await post(owner, `pets/${petId}/consents`, {
    doctorId: f.accounts.doctor!.id,
    clinicId: f.clinicId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await db.query(
    "UPDATE appointments SET starts_at=clock_timestamp()-make_interval(mins=>$2),ends_at=clock_timestamp()+interval '30 minutes' WHERE id=$1",
    [a.id, minutesAgo],
  );
  const e = await post(doctor, `appointments/${a.id}/encounter`, {
    version: 0,
    content: {
      complaint: 'زيارة اصطناعية',
      subjective: '',
      objective: '',
      assessment: 'تقييم fixture',
      plan: 'متابعة fixture',
      prescriptions: [],
      vaccines: [],
      labs: [],
      followUps: [],
    },
  });
  await post(doctor, `encounters/${e.id}/sign`, { version: 1 });
  return e.id;
}
async function cookies(context: BrowserContext, role: string) {
  await context.addCookies(
    f.accounts[role]!.cookie.split('; ').map((c) => {
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
test.describe.serial('دورة باقات الرعاية وحقوق الخدمة والإيراد', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-plans-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, manager, doctor, stranger] = await Promise.all(
      ['owner', 'other', 'manager', 'doctor', 'stranger'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    pet = (
      await post(owner, 'pets', {
        name: 'حيوان باقة الاختبار',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    const services: string[] = [];
    for (const name of ['خدمة أولى', 'خدمة ثانية', 'خدمة مستبعدة'])
      services.push(
        (
          await post(manager, `clinics/${f.clinicId}/services`, {
            name,
            durationMinutes: 30,
          })
        ).id,
      );
    [serviceA, serviceB, serviceC] = services as [string, string, string];
    branch2 = (
      await post(manager, `clinics/${f.clinicId}/branches`, {
        name: 'فرع ثان للاختبار',
        city: 'بغداد',
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      other?.dispose(),
      manager?.dispose(),
      doctor?.dispose(),
      stranger?.dispose(),
    ]);
    await db.end();
  });
  test('شروط محدودة بنطاق العيادة والفرع والخدمات وإتاحة بإصدار', async () => {
    const path = `clinics/${f.clinicId}/care-plans`;
    await bad(owner, path, terms(), 403);
    await bad(other, path, terms(), 403);
    await bad(manager, path, terms({ branchId: f.branchB }), 404);
    const foreign = (
      await post(other, `clinics/${f.clinicB}/services`, {
        name: 'خدمة عيادة أخرى',
        durationMinutes: 30,
      })
    ).id;
    await bad(
      manager,
      path,
      terms({ entitlements: [{ serviceId: foreign, uses: 1 }] }),
      404,
    );
    for (const extra of [
      {
        entitlements: [
          { serviceId: serviceA, uses: 1 },
          { serviceId: serviceA, uses: 2 },
        ],
      },
      {
        entitlements: [
          { serviceId: serviceA, uses: 100 },
          { serviceId: serviceB, uses: 1 },
        ],
      },
      { waitingDays: 30 },
      { serviceId: serviceA, uses: 1 },
    ])
      await bad(manager, path, terms(extra), 400);
    plan = (await post(manager, path, terms())).id;
    const catalog = await (await owner.get(root + 'services/catalog')).json();
    expect(
      catalog.plans.find((p: { id: string }) => p.id === plan),
    ).toMatchObject({
      uses: 3,
      branch_id: f.branchId,
      entitlements: expect.arrayContaining([
        expect.objectContaining({ service_id: serviceA, uses: 1 }),
        expect.objectContaining({ service_id: serviceB, uses: 2 }),
      ]),
    });
    await expect(
      db.query(
        'UPDATE care_plans SET price_minor=1,version=version+1 WHERE id=$1',
        [plan],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await post(manager, `${path}/${plan}/availability`, {
      version: 1,
      active: false,
    });
    await bad(manager, `${path}/${plan}/availability`, {
      version: 1,
      active: true,
    });
    await bad(
      owner,
      'sandbox/subscriptions',
      { planId: plan, petId: pet, idempotencyKey: randomUUID() },
      404,
    );
    await post(manager, `${path}/${plan}/availability`, {
      version: 2,
      active: true,
    });
  });
  test('شراء مكرر بلقطة ثابتة وسعر خادم، ومنع تغيير العدادات والمبالغ', async () => {
    const i = {
      planId: plan,
      petId: pet,
      idempotencyKey: randomUUID(),
      priceMinor: '10001',
    };
    await bad(owner, 'sandbox/subscriptions', { ...i, priceMinor: '1' });
    const [a, b] = await Promise.all([
      post(owner, 'sandbox/subscriptions', i),
      post(owner, 'sandbox/subscriptions', i),
    ]);
    expect(a.id).toBe(b.id);
    await bad(owner, 'sandbox/subscriptions', { ...i, priceMinor: '10002' });
    const p = await mine(a.id);
    expect(p.entitlements).toHaveLength(2);
    await expect(
      db.query(
        'UPDATE care_subscriptions SET price_minor=1,version=version+1 WHERE id=$1',
        [a.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(
        'UPDATE care_subscriptions SET uses_used=1,version=version+1 WHERE id=$1',
        [a.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(
        'UPDATE care_subscription_entitlements SET uses=99 WHERE subscription_id=$1',
        [a.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`plan:${a.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
    await bad(
      other,
      `subscriptions/${a.id}/pause`,
      { version: 1, days: 1, idempotencyKey: randomUUID() },
      404,
    );
  });
  test('حصص مستقلة وزيارة مؤهلة واستهلاك متزامن واحد وإيراد كامل دون فقد التقريب', async () => {
    const s = await buy();
    const first = await visit();
    const [a, b] = await Promise.all([
      post(doctor, `subscriptions/${s.id}/redeem`, { encounterId: first }),
      post(doctor, `subscriptions/${s.id}/redeem`, { encounterId: first }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.recognized_minor).toBe('3333');
    await bad(doctor, `subscriptions/${s.id}/redeem`, {
      encounterId: await visit(),
    });
    await bad(doctor, `subscriptions/${s.id}/redeem`, {
      encounterId: await visit(serviceC),
    });
    await bad(doctor, `subscriptions/${s.id}/redeem`, {
      encounterId: await visit(serviceB, branch2),
    });
    await bad(doctor, `subscriptions/${s.id}/redeem`, {
      encounterId: await visit(serviceB, f.branchId, pet, 10),
    });
    await post(doctor, `subscriptions/${s.id}/redeem`, {
      encounterId: await visit(serviceB),
    });
    await post(doctor, `subscriptions/${s.id}/redeem`, {
      encounterId: await visit(serviceB),
    });
    expect(await mine(s.id)).toMatchObject({
      state: 'exhausted',
      uses_used: 3,
    });
    expect(
      (
        await db.query(
          'SELECT sum(recognized_minor)::text amount FROM entitlement_usage WHERE subscription_id=$1',
          [s.id],
        )
      ).rows[0].amount,
    ).toBe('10001');
    const another = await buy();
    await bad(doctor, `subscriptions/${another.id}/redeem`, {
      encounterId: first,
    });
    await bad(owner, `sandbox/subscriptions/${s.id}/cancel`, {});
  });
  test('انتظار وتعليق محدود واستئناف مبكر وتلقائي وحظر زيارة أثناء التعليق', async () => {
    const waitingPlan = (
      await post(
        manager,
        `clinics/${f.clinicId}/care-plans`,
        terms({ waitingDays: 2 }),
      )
    ).id;
    const waiting = await buy(waitingPlan);
    expect((await mine(waiting.id)).state).toBe('waiting');
    await bad(doctor, `subscriptions/${waiting.id}/redeem`, {
      encounterId: await visit(),
    });
    const s = await buy(),
      pause = { version: 1, days: 2, idempotencyKey: randomUUID() };
    const [a, b] = await Promise.all([
      post(owner, `subscriptions/${s.id}/pause`, pause),
      post(owner, `subscriptions/${s.id}/pause`, pause),
    ]);
    expect(a.version).toBe(b.version);
    const paused = await mine(s.id);
    expect(paused.state).toBe('paused');
    expect(Date.parse(paused.expires_at) - Date.parse(s.expires_at)).toBe(
      2 * 86400000,
    );
    await bad(owner, `subscriptions/${s.id}/pause`, {
      version: 2,
      days: 1,
      idempotencyKey: randomUUID(),
    });
    const during = await visit();
    await bad(doctor, `subscriptions/${s.id}/redeem`, { encounterId: during });
    await post(owner, `subscriptions/${s.id}/resume`, {
      version: 2,
      idempotencyKey: randomUUID(),
    });
    const resumed = await mine(s.id);
    expect(resumed.state).toBe('active');
    expect(Number(resumed.pause_seconds)).toBeLessThan(60);
    expect(
      Date.parse(resumed.expires_at) - Date.parse(s.expires_at),
    ).toBeLessThan(60000);
    await bad(doctor, `subscriptions/${s.id}/redeem`, { encounterId: during });
    await bad(owner, `subscriptions/${s.id}/pause`, {
      version: 3,
      days: 31,
      idempotencyKey: randomUUID(),
    });
    await post(owner, `subscriptions/${s.id}/pause`, {
      version: 3,
      days: 1,
      idempotencyKey: randomUUID(),
    });
    // Move only the isolated fixture's timer to prove automatic resumption without a worker.
    await db.query(
      "UPDATE care_subscriptions SET paused_until=clock_timestamp()-interval '1 second',version=version+1 WHERE id=$1",
      [s.id],
    );
    expect((await mine(s.id)).state).toBe('active');
    await expect(
      db.query(
        'DELETE FROM care_subscription_events WHERE subscription_id=$1',
        [s.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('تجديد دورة منتهية مرة واحدة بشروط متاحة ومن دون ترحيل الاستخدامات', async () => {
    const s = await buy(),
      input = { priceMinor: '10001', idempotencyKey: randomUUID() };
    await bad(owner, `sandbox/subscriptions/${s.id}/renew`, input);
    await db.query(
      "UPDATE care_subscriptions SET available_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day',version=version+1 WHERE id=$1",
      [s.id],
    );
    expect((await mine(s.id)).state).toBe('expired');
    const [a, b] = await Promise.all([
      post(owner, `sandbox/subscriptions/${s.id}/renew`, input),
      post(owner, `sandbox/subscriptions/${s.id}/renew`, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({
      predecessor_id: s.id,
      operation: 'renew',
      uses_used: 0,
      uses_total: 3,
    });
    await bad(owner, `sandbox/subscriptions/${s.id}/renew`, {
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect((await mine(s.id)).successor_id).toBe(a.id);
  });
  test('المستحق المحجوز يمنع الرد، وتعليق الانتظار يمدد المدة المتبقية فقط', async () => {
    const waitingPlan = (
      await post(
        manager,
        `clinics/${f.clinicId}/care-plans`,
        terms({ waitingDays: 2 }),
      )
    ).id;
    const s = await buy(waitingPlan),
      before = await mine(s.id);
    await post(owner, `subscriptions/${s.id}/pause`, {
      version: 1,
      days: 3,
      idempotencyKey: randomUUID(),
    });
    const paused = await mine(s.id);
    expect(
      Date.parse(paused.available_at) - Date.parse(before.available_at),
    ).toBe(3 * 86400000);
    await post(owner, `subscriptions/${s.id}/resume`, {
      version: 2,
      idempotencyKey: randomUUID(),
    });
    const resumed = await mine(s.id);
    expect(resumed.state).toBe('waiting');
    expect(
      Date.parse(resumed.available_at) - Date.parse(before.available_at),
    ).toBeLessThan(60000);
    const amount = (
      await db.query(
        "SELECT coalesce(sum(l.credit-l.debit),0)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.party_id=$1 AND l.account_code='2000' AND j.status='posted'",
        [f.clinicId],
      )
    ).rows[0].amount;
    await bad(manager, 'admin/sandbox/payouts', {
      kind: 'clinic',
      partyId: f.clinicId,
      amountMinor: amount,
    });
    // Fault injection only in the disposable DB: even an inconsistent imported hold must not let a refund overdraw the payable.
    const payout = (
      await db.query(
        "INSERT INTO sandbox_payouts(kind,party_id,amount_minor,created_by) VALUES('clinic',$1,$2,$3) RETURNING id",
        [f.clinicId, amount, f.accounts.manager!.id],
      )
    ).rows[0];
    await bad(owner, `sandbox/subscriptions/${s.id}/cancel`, {});
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`plan-cancel:${s.id}`],
        )
      ).rows[0].n,
    ).toBe(0);
    await post(manager, `admin/sandbox/payouts/${payout.id}/cancel`);
    await post(owner, `sandbox/subscriptions/${s.id}/cancel`);
  });
  test('ترقية بفرق موجب تحفظ الحقوق وتستبدل الأصل ذرياً مرة واحدة', async () => {
    const s = await buy(),
      target = await post(
        manager,
        `clinics/${f.clinicId}/care-plans`,
        terms({
          name: 'باقة أعلى اختبارية',
          priceMinor: '20003',
          entitlements: [
            { serviceId: serviceA, uses: 2 },
            { serviceId: serviceB, uses: 2 },
          ],
        }),
      );
    const invalid = await post(
      manager,
      `clinics/${f.clinicId}/care-plans`,
      terms({
        priceMinor: '20003',
        entitlements: [{ serviceId: serviceA, uses: 2 }],
      }),
    );
    await bad(owner, `sandbox/subscriptions/${s.id}/upgrade`, {
      planId: invalid.id,
      priceMinor: '20003',
      idempotencyKey: randomUUID(),
    });
    const i = {
      planId: target.id,
      priceMinor: '20003',
      idempotencyKey: randomUUID(),
    };
    const [a, b] = await Promise.all([
      post(owner, `sandbox/subscriptions/${s.id}/upgrade`, i),
      post(owner, `sandbox/subscriptions/${s.id}/upgrade`, i),
    ]);
    expect(a.id).toBe(b.id);
    expect((await mine(s.id)).state).toBe('upgraded');
    expect((await mine(a.id)).uses_total).toBe(4);
    await bad(owner, `sandbox/subscriptions/${s.id}/cancel`, {});
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`plan-upgrade:${s.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
    await post(owner, `sandbox/subscriptions/${a.id}/cancel`);
    await bad(owner, `sandbox/subscriptions/${a.id}/cancel`, {});
  });
  test('نقل الملكية والأرشفة يسحبان القراءة والتعديل والاستهلاك، والتقارير مقيدة', async () => {
    const p = (
        await post(owner, 'pets', {
          name: 'حيوان نقل باقة',
          species: 'cat',
          sex: 'unknown',
        })
      ).id,
      s = await buy(plan, p),
      e = await visit(serviceA, f.branchId, p);
    // Isolated fixture models an already-approved transfer without creating a second identity route.
    await db.query(
      'UPDATE pets SET owner_id=$2,version=version+1 WHERE id=$1',
      [p, f.accounts.other!.id],
    );
    expect(await mine(s.id)).toBeUndefined();
    await bad(owner, `sandbox/subscriptions/${s.id}/cancel`, {}, 404);
    await bad(
      owner,
      `subscriptions/${s.id}/pause`,
      { version: 1, days: 1, idempotencyKey: randomUUID() },
      404,
    );
    await bad(doctor, `subscriptions/${s.id}/redeem`, { encounterId: e });
    const archived = (
      await post(owner, 'pets', {
        name: 'حيوان مؤرشف باقة',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    expect((await owner.delete(root + `pets/${archived}`)).status()).toBe(200);
    await bad(owner, 'sandbox/subscriptions', {
      planId: plan,
      petId: archived,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await other.get(root + `clinics/${f.clinicId}/services/management`)
      ).status(),
    ).toBe(403);
    const management = await (
      await manager.get(root + `clinics/${f.clinicId}/services/management`)
    ).json();
    expect(
      management.sales.find((r: { id: string }) => r.id === plan)
        .recognized_minor,
    ).toBe('10001');
    expect(
      (
        await (
          await doctor.get(root + `clinics/${f.clinicId}/services/management`)
        ).json()
      ).sales,
    ).toEqual([]);
  });
  test('إنشاء وشراء وتعليق واستئناف من الهاتف مع فحص الوصول', async ({
    browser,
  }) => {
    const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(c, 'manager');
    const page = await c.newPage();
    await page.goto(origin + `/clinic/${f.clinicId}/services`);
    const form = page
      .getByRole('button', { name: 'نشر الباقة', exact: true })
      .locator('..');
    await form
      .getByLabel('اسم الباقة', { exact: true })
      .fill('باقة هاتف الاختبار');
    await form.getByLabel('حصة خدمة أولى', { exact: true }).fill('1');
    await form.getByLabel('حصة خدمة ثانية', { exact: true }).fill('1');
    await form
      .getByLabel('السعر بوحدات IQD الصغرى', { exact: true })
      .fill('9001');
    await form.getByLabel('الصلاحية بالأيام', { exact: true }).fill('30');
    await form.getByRole('button', { name: 'نشر الباقة', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'باقة هاتف الاختبار',
        exact: true,
        level: 3,
      }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    await c.close();
    const oc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(oc, 'owner');
    const op = await oc.newPage();
    await op.goto(origin + '/services');
    const card = op.getByRole('article').filter({
      has: op.getByRole('heading', {
        name: 'باقة هاتف الاختبار',
        exact: true,
      }),
    });
    await card
      .getByRole('combobox', { name: 'الحيوان للاشتراك', exact: true })
      .selectOption(pet);
    await card
      .getByRole('button', { name: 'اشتراك اختباري', exact: true })
      .click();
    const subscription = op.getByRole('article').filter({
      has: op.getByRole('heading', {
        name: 'باقة هاتف الاختبار · حيوان باقة الاختبار',
        exact: true,
      }),
    });
    await subscription
      .getByLabel('مدة التعليق بالأيام', { exact: true })
      .fill('1');
    await subscription
      .getByRole('button', { name: 'تعليق باقة هاتف الاختبار', exact: true })
      .click();
    await expect(
      subscription.getByText('متوقف', { exact: true }),
    ).toBeVisible();
    await subscription
      .getByRole('button', {
        name: 'استئناف باقة هاتف الاختبار الآن',
        exact: true,
      })
      .click();
    await expect(subscription.getByText('نشط', { exact: true })).toBeVisible();
    expect(
      await op.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page: op })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    mkdirSync('docs/evidence', { recursive: true });
    await subscription.screenshot({
      path: 'docs/evidence/care-plan-lifecycle-390.png',
    });
    const higher = await post(
      manager,
      `clinics/${f.clinicId}/care-plans`,
      terms({
        name: 'باقة هاتف أعلى للاختبار',
        priceMinor: '19003',
        branchId: null,
        entitlements: [
          { serviceId: serviceA, uses: 2 },
          { serviceId: serviceB, uses: 2 },
        ],
      }),
    );
    await op.reload();
    await subscription
      .getByRole('combobox', { name: 'الباقة الأعلى' })
      .selectOption(higher.id);
    await subscription
      .getByLabel('أوافق على استبدال الاشتراك ودفع الفرق اختباريًا.', {
        exact: true,
      })
      .check();
    await subscription
      .getByRole('button', {
        name: 'ترقية باقة هاتف الاختبار اختباريًا',
        exact: true,
      })
      .click();
    await expect(
      subscription.getByText('استُبدل بترقية', { exact: true }),
    ).toBeVisible();
    const rows = (await (await owner.get(root + 'me/services')).json())
      .subscriptions;
    const upgraded = rows.find(
      (s: { plan_id: string }) => s.plan_id === higher.id,
    );
    await db.query(
      "UPDATE care_subscriptions SET available_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day',version=version+1 WHERE id=$1",
      [upgraded.id],
    );
    await op.reload();
    const higherCard = op
      .getByRole('article')
      .filter({
        has: op.getByRole('heading', {
          name: 'باقة هاتف أعلى للاختبار · حيوان باقة الاختبار',
          exact: true,
        }),
      })
      .filter({ hasText: upgraded.id });
    await higherCard
      .getByLabel('أوافق على بدء دورة جديدة بالشروط المنشورة.', { exact: true })
      .check();
    await higherCard
      .getByRole('button', {
        name: 'تجديد باقة هاتف أعلى للاختبار اختباريًا',
        exact: true,
      })
      .click();
    await expect(
      op.getByRole('heading', {
        name: 'باقة هاتف أعلى للاختبار · حيوان باقة الاختبار',
        exact: true,
      }),
    ).toHaveCount(2);
    expect((await mine(upgraded.id)).successor_id).toBeTruthy();
    await oc.close();
  });
});
