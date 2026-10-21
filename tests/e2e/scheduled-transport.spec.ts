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
let fixture: { accounts: Record<string, { id: string; cookie: string }> },
  owner: APIRequestContext,
  other: APIRequestContext,
  driver: APIRequestContext;
let cat: string, dog: string, foreign: string;
async function create(c: APIRequestContext, p: string, data: unknown = {}) {
  const r = await c.post(root + p, { data });
  expect(r.status(), `${p}: ${await r.text()}`).toBe(201);
  return r.json();
}
const vehicle = {
  plate: 'SCHEDULE-TEST',
  description: 'مركبة اختبار دون نقل حقيقي',
  city: 'بغداد',
  expiresOn: '2027-12-31',
  available: true,
};
const input = () => ({
  petId: cat,
  extraPetIds: [dog],
  city: 'بغداد',
  originLabel: 'PRIVATE-PICKUP',
  destinationLabel: 'PRIVATE-DROPOFF',
  originLat: 33.3,
  originLng: 44.3,
  destinationLat: 33.31,
  destinationLng: 44.31,
  idempotencyKey: randomUUID(),
  policyAccepted: true,
  accompanying: true,
  transportNotes: 'PRIVATE-TRANSPORT-NOTES',
  scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
});
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
test.describe.serial('حجز نقل مجدول ومتعدد الحيوانات', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-schedule-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, driver] = await Promise.all(
      ['owner', 'other', 'doctor'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    cat = (
      await create(owner, 'pets', {
        name: 'قطة جدولة اختبار',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    dog = (
      await create(owner, 'pets', {
        name: 'كلب جدولة اختبار',
        species: 'dog',
        sex: 'unknown',
      })
    ).id;
    foreign = (
      await create(other, 'pets', {
        name: 'حيوان عائلة أخرى',
        species: 'bird',
        sex: 'unknown',
      })
    ).id;
    await create(driver, 'driver/vehicle', vehicle);
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), other?.dispose(), driver?.dispose()]);
    await db.end();
  });
  test('يرفض حيوان غير مخول وتكراره والموعد البعيد، ويعيد نفس الحجز مرة واحدة', async () => {
    expect([403, 404]).toContain(
      (
        await owner.post(root + 'sandbox/rides', {
          data: { ...input(), extraPetIds: [foreign] },
        })
      ).status(),
    );
    expect(
      (
        await owner.post(root + 'sandbox/rides', {
          data: { ...input(), extraPetIds: [cat] },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await owner.post(root + 'sandbox/rides', {
          data: {
            ...input(),
            scheduledAt: new Date(Date.now() + 40 * 86400000).toISOString(),
          },
        })
      ).status(),
    ).toBe(400);
    const body = input(),
      a = await create(owner, 'sandbox/rides', body),
      b = await create(owner, 'sandbox/rides', body);
    expect(a.id).toBe(b.id);
    expect(
      (await driver.post(root + `rides/${a.id}/claim`, { data: {} })).status(),
    ).toBe(409);
    await create(owner, `rides/${a.id}/cancel`);
  });
  test('نافذة الموعد والسعة والأنواع والراكب تمنع القبول؛ لا عنوان خاص في قائمة الطلبات', async () => {
    const r = await create(owner, 'sandbox/rides', input());
    expect(
      (await (await driver.get(root + 'driver/home')).json()).requests.map(
        (x: { id: string }) => x.id,
      ),
    ).not.toContain(r.id);
    await db.query(
      "UPDATE rides SET scheduled_at=now()+interval '10 minutes' WHERE id=$1",
      [r.id],
    );
    expect(
      (await driver.post(root + `rides/${r.id}/claim`, { data: {} })).status(),
    ).toBe(409);
    await create(driver, 'driver/vehicle', {
      ...vehicle,
      capacity: 2,
      allowedSpecies: ['cat'],
      passengerAllowed: true,
    });
    expect(
      (await driver.post(root + `rides/${r.id}/claim`, { data: {} })).status(),
    ).toBe(409);
    await create(driver, 'driver/vehicle', {
      ...vehicle,
      capacity: 2,
      allowedSpecies: ['all'],
      passengerAllowed: false,
    });
    expect(
      (await driver.post(root + `rides/${r.id}/claim`, { data: {} })).status(),
    ).toBe(409);
    await create(driver, 'driver/vehicle', {
      ...vehicle,
      capacity: 2,
      allowedSpecies: ['all'],
      passengerAllowed: true,
    });
    const list = await driver.get(root + 'driver/home'),
      body = await list.json();
    expect(body.requests.map((x: { id: string }) => x.id)).toContain(r.id);
    expect(await list.text()).not.toContain('PRIVATE-');
    await create(driver, `rides/${r.id}/claim`);
    expect((await other.get(root + `rides/${r.id}/location`)).status()).toBe(
      404,
    );
    await create(owner, `rides/${r.id}/cancel`);
  });
  test('سحب ملكية حيوان إضافي يمنع القبول، والعامل يلغي الموعد الفائت مرة واحدة', async () => {
    const pet = (
      await create(owner, 'pets', {
        name: 'حيوان نقل صلاحية',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    const r = await create(owner, 'sandbox/rides', {
      ...input(),
      extraPetIds: [pet],
      scheduledAt: new Date(Date.now() + 15 * 60000).toISOString(),
    });
    await db.query('UPDATE pets SET owner_id=$2 WHERE id=$1', [
      pet,
      fixture.accounts.other!.id,
    ]);
    expect([403, 404]).toContain(
      (await driver.post(root + `rides/${r.id}/claim`, { data: {} })).status(),
    );
    await create(owner, `rides/${r.id}/cancel`);
    const expired = await create(owner, 'sandbox/rides', input());
    await db.query(
      "UPDATE rides SET scheduled_at=now()-interval '3 hours' WHERE id=$1",
      [expired.id],
    );
    await expect
      .poll(
        async () =>
          (await db.query('SELECT status FROM rides WHERE id=$1', [expired.id]))
            .rows[0].status,
        { timeout: 15000 },
      )
      .toBe('cancelled');
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM outbox_messages WHERE aggregate_id=$1 AND event_type='RideReservationExpired'",
          [expired.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`ride:${expired.id}`],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  test('المتصفح ينشئ موعداً لحيوانين ويعرضه بتوقيت بغداد دون تجاوز الهاتف', async ({
    page,
    context,
  }) => {
    await cookies(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/taxi');
    await page
      .getByRole('combobox', { name: 'الحيوان المسافر', exact: true })
      .selectOption(cat);
    await page
      .getByRole('listbox', { name: /حيوانات إضافية/ })
      .selectOption(dog);
    await page
      .getByLabel('موعد بتوقيت بغداد (اختياري)', { exact: true })
      .fill(
        new Date(Date.now() + 90 * 60000 + 3 * 3600000)
          .toISOString()
          .slice(0, 16),
      );
    await page
      .getByRole('textbox', { name: 'متطلبات النقل', exact: true })
      .fill('قفصان مناسبان وملاحظات نقل اختبارية');
    await page
      .getByRole('textbox', { name: 'مدينة الرحلة', exact: true })
      .fill('بغداد');
    await page
      .getByRole('textbox', { name: 'مكان الانطلاق الخاص', exact: true })
      .fill('عنوان انطلاق اختبار خاص');
    await page
      .getByRole('textbox', { name: 'الوجهة الخاصة', exact: true })
      .fill('عنوان وجهة اختبار خاص');
    await page.getByLabel('خط عرض الانطلاق', { exact: true }).fill('33.3');
    await page.getByLabel('خط طول الانطلاق', { exact: true }).fill('44.3');
    await page.getByLabel('خط عرض الوجهة', { exact: true }).fill('33.31');
    await page.getByLabel('خط طول الوجهة', { exact: true }).fill('44.31');
    await page
      .getByRole('checkbox', { name: /سأجهز وسيلة تثبيت مناسبة/ })
      .check();
    await page
      .getByRole('button', { name: 'إنشاء طلب النقل وعرض السعر', exact: true })
      .click();
    await expect(
      page.getByText('قفصان مناسبان وملاحظات نقل اختبارية', { exact: true }),
    ).toBeVisible();
    const rides = await (await owner.get(root + 'me/rides')).json();
    expect(
      rides.find(
        (r: { transport_notes: string }) =>
          r.transport_notes === 'قفصان مناسبان وملاحظات نقل اختبارية',
      ),
    ).toMatchObject({ pet_count: 2, status: 'requested' });
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
      path: 'docs/evidence/scheduled-taxi-390.png',
      fullPage: true,
    });
  });
});
