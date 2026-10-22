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
let f: { accounts: Record<string, { id: string; cookie: string }> },
  owner: APIRequestContext,
  other: APIRequestContext,
  driver: APIRequestContext;
let quote: { id: string; fareMinor: string }, ride: string, pet: string;
const coordinates = {
  originLat: 33.3152,
  originLng: 44.3661,
  destinationLat: 33.3115,
  destinationLng: 44.4009,
};
const data = { ...coordinates, consent: true, idempotencyKey: randomUUID() };
async function post(c: APIRequestContext, path: string, body: unknown) {
  const r = await c.post(root + path, { data: body });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
test.describe
  .serial('OSRM protocol integration — synthetic isolated routes', () => {
  test.beforeAll(async () => {
    const path = `/tmp/petra-road-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', path], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(path, 'utf8'));
    } finally {
      rmSync(path, { force: true });
    }
    [owner, other, driver] = await Promise.all(
      ['owner', 'other', 'doctor'].map((role) =>
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
        name: 'حيوان مسار اختباري',
        species: 'cat',
        sex: 'unknown',
        birthDate: null,
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), other?.dispose(), driver?.dispose()]);
    await db.end();
  });
  test('authentication, explicit coordinate consent, Iraq bounds and URL injection', async () => {
    const anonymous = await factory.newContext({
      extraHTTPHeaders: { Origin: origin },
    });
    try {
      expect(
        (await anonymous.post(root + 'taxi/route-quotes', { data })).status(),
      ).toBe(401);
    } finally {
      await anonymous.dispose();
    }
    for (const body of [
      { ...data, consent: false },
      { ...data, originLat: 10 },
      { ...data, originLng: 44.1234567 },
      { ...data, url: 'http://169.254.169.254/' },
    ])
      expect(
        (await owner.post(root + 'taxi/route-quotes', { data: body })).status(),
      ).toBe(400);
    expect(await (await owner.get(root + 'taxi/routing')).json()).toMatchObject(
      { enabled: true, providerHost: '127.0.0.1:4199' },
    );
  });
  test('immutable road distance and integer sandbox quote survive concurrent replay', async () => {
    const results = await Promise.all([
      post(owner, 'taxi/route-quotes', data),
      post(owner, 'taxi/route-quotes', data),
    ]);
    quote = results[0];
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toMatchObject({
      metres: 12346,
      seconds: 1241,
      fareMinor: '18000000',
      mode: 'sandbox',
      geometry: { type: 'LineString' },
    });
    expect(
      (
        await owner.post(root + 'taxi/route-quotes', {
          data: { ...data, destinationLat: 33.4 },
        })
      ).status(),
    ).toBe(409);
    await expect(
      db.query('UPDATE ride_route_quotes SET metres=1 WHERE id=$1', [quote.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('DELETE FROM ride_route_quotes WHERE id=$1', [quote.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('quote owner, coordinate and expiry checks bind the ride and do not trust browser fares', async () => {
    const body = {
      ...coordinates,
      policyAccepted: true,
      petId: pet,
      city: 'بغداد',
      originLabel: 'انطلاق خاص اختباري',
      destinationLabel: 'وجهة خاصة اختبارية',
      idempotencyKey: randomUUID(),
      routeQuoteId: quote.id,
    };
    const foreign = (
      await post(other, 'taxi/route-quotes', {
        ...data,
        idempotencyKey: randomUUID(),
      })
    ).id;
    expect(
      (
        await owner.post(root + 'sandbox/rides', {
          data: { ...body, routeQuoteId: foreign },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.post(root + 'sandbox/rides', {
          data: { ...body, destinationLat: 33.5 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.post(root + 'sandbox/rides', {
          data: { ...body, fareMinor: '1' },
        })
      ).status(),
    ).toBe(400);
    const expired = (
      await db.query(
        "INSERT INTO ride_route_quotes(user_id,idempotency_key,origin_lat,origin_lng,destination_lat,destination_lng,metres,seconds,fare_minor,geometry,created_at,consent_at,expires_at) SELECT user_id,$2,origin_lat,origin_lng,destination_lat,destination_lng,metres,seconds,fare_minor,geometry,now()-interval '20 minutes',now()-interval '20 minutes',now()-interval '10 minutes' FROM ride_route_quotes WHERE id=$1 RETURNING id",
        [quote.id, randomUUID()],
      )
    ).rows[0].id;
    expect(
      (
        await owner.post(root + 'sandbox/rides', {
          data: { ...body, routeQuoteId: expired },
        })
      ).status(),
    ).toBe(409);
    const created = await post(owner, 'sandbox/rides', body);
    ride = created.id;
    expect(created.fare_minor).toBe(quote.fareMinor);
    expect(created.route_quote_id).toBe(quote.id);
    expect((await post(owner, 'sandbox/rides', body)).id).toBe(ride);
    await expect(
      db.query('UPDATE rides SET destination_lat=33.7 WHERE id=$1', [ride]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('provider failures produce no fabricated quote and failed attempts are limited', async () => {
    const before = (
      await db.query(
        'SELECT count(*)::int n FROM ride_route_quotes WHERE user_id=$1',
        [f.accounts.other!.id],
      )
    ).rows[0].n;
    // One successful quote above has already consumed one of five attempts.
    for (const lat of [34, 35, 36, 34]) {
      const r = await other.post(root + 'taxi/route-quotes', {
        data: { ...data, originLat: lat, idempotencyKey: randomUUID() },
      });
      expect(r.status()).toBe(lat === 34 ? 400 : 503);
    }
    expect(
      (
        await other.post(root + 'taxi/route-quotes', {
          data: { ...data, idempotencyKey: randomUUID() },
        })
      ).status(),
    ).toBe(429);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM ride_route_quotes WHERE user_id=$1',
          [f.accounts.other!.id],
        )
      ).rows[0].n,
    ).toBe(before);
  });
  test('geometry remains private until assigned, and driver revocation removes access', async () => {
    expect((await other.get(root + `rides/${ride}/route`)).status()).toBe(404);
    expect((await driver.get(root + `rides/${ride}/route`)).status()).toBe(404);
    expect(
      (await (await owner.get(root + `rides/${ride}/route`)).json()).id,
    ).toBe(quote.id);
    await post(driver, 'driver/vehicle', {
      plate: 'TEST-ROUTE',
      description: 'مركبة مسار اختباري',
      city: 'بغداد',
      expiresOn: '2030-01-01',
      available: true,
    });
    const queue = await (await driver.get(root + 'driver/home')).json();
    expect(
      queue.requests.find((r: { id: string }) => r.id === ride),
    ).not.toHaveProperty('origin_lat');
    await post(driver, `rides/${ride}/claim`, {});
    expect((await driver.get(root + `rides/${ride}/route`)).status()).toBe(200);
    await db.query(
      "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1 AND kind='driver'",
      [f.accounts.doctor!.id],
    );
    expect((await driver.get(root + `rides/${ride}/route`)).status()).toBe(404);
  });
  test('mobile planner loads no tiles before opt-in, computes quote and clears it when coordinates change', async ({
    page,
    context,
  }) => {
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
    let tiles = 0;
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      tiles++;
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DLEAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/taxi');
    await page
      .getByRole('button', { name: 'تخطيط طريق فعلي اختياري', exact: true })
      .click();
    for (const [label, value] of [
      ['خط عرض الانطلاق', '33.3152'],
      ['خط طول الانطلاق', '44.3661'],
      ['خط عرض الوجهة', '33.3115'],
      ['خط طول الوجهة', '44.4009'],
    ])
      await page.getByLabel(label!, { exact: true }).fill(value!);
    expect(tiles).toBe(0);
    await page
      .getByRole('checkbox', { name: /أوافق على إرسال نقطتي الرحلة/ })
      .check();
    await page
      .getByRole('button', {
        name: 'حساب مسار الطرق والسعر الاختباري',
        exact: true,
      })
      .click();
    await expect(page.getByText(/مسار الطرق: 12.35 كم/)).toBeVisible();
    expect(tiles).toBe(0);
    await page
      .getByRole('checkbox', { name: /تحميل خريطة OpenStreetMap/ })
      .check();
    await expect.poll(() => tiles).toBeGreaterThan(0);
    await expect(
      page.getByRole('region', { name: 'خريطة الطريق الاختيارية' }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'docs/evidence/taxi-road-routing-390.png',
      fullPage: true,
    });
    await page.getByLabel('خط عرض الوجهة', { exact: true }).fill('33.4');
    await expect(page.getByText(/مسار الطرق: 12.35 كم/)).toHaveCount(0);
  });
});
