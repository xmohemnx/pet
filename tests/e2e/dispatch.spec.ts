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
  driverA: APIRequestContext,
  driverB: APIRequestContext,
  other: APIRequestContext;
let pet: string,
  secondPet: string,
  ride: string,
  offer: { id: string; driver_id: string };
const city = `اختبار-${randomUUID().slice(0, 8)}`;
const vehicle = {
  plate: 'DISPATCH-TEST',
  description: 'مركبة توزيع اختبارية',
  city,
  expiresOn: '2030-01-01',
  available: true,
  autoDispatch: true,
  capacity: 1,
  allowedSpecies: ['cat'],
  passengerAllowed: false,
};
async function post(c: APIRequestContext, path: string, body: unknown = {}) {
  const r = await c.post(root + path, { data: body });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function request(options: Record<string, unknown> = {}) {
  return post(owner, 'sandbox/rides', {
    petId: pet,
    city,
    originLabel: 'بداية خاصة اختبارية',
    destinationLabel: 'نهاية خاصة اختبارية',
    originLat: 33.3152,
    originLng: 44.3661,
    destinationLat: 33.3115,
    destinationLng: 44.4009,
    policyAccepted: true,
    autoDispatch: true,
    idempotencyKey: randomUUID(),
    ...options,
  });
}
function tick() {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const u=new URL(process.env.DATABASE_URL);if(process.env.APP_ENV!=='local'||!['127.0.0.1','localhost'].includes(u.hostname)||!/^\\/petra_e2e_\\d+$/.test(u.pathname))throw new Error('Isolated DB required');const {dispatchRides}=await import('./apps/api/dist/apps/api/src/services/dispatch.js');const {database}=await import('./apps/api/dist/apps/api/src/database.js');try{await dispatchRides();}finally{await database.end();}`,
    ],
    { env: process.env, stdio: 'pipe' },
  );
}
const actor = (id: string) =>
  id === f.accounts.driver!.id ? driverA : driverB;
async function pending(id: string) {
  return (
    await db.query(
      "SELECT * FROM ride_dispatch_offers WHERE ride_id=$1 AND status='pending'",
      [id],
    )
  ).rows[0];
}
test.describe
  .serial('Consent, eligibility, exclusive offers and atomic dispatch', () => {
  test.beforeAll(async () => {
    const path = `/tmp/petra-dispatch-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', path], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(path, 'utf8'));
    } finally {
      rmSync(path, { force: true });
    }
    [owner, driverA, driverB, other] = await Promise.all(
      ['owner', 'driver', 'driverOther', 'other'].map((role) =>
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
        name: 'قط توزيع',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    secondPet = (
      await post(owner, 'pets', {
        name: 'كلب توزيع',
        species: 'dog',
        sex: 'unknown',
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      driverA?.dispose(),
      driverB?.dispose(),
      other?.dispose(),
    ]);
    await db.end();
  });
  test('default driver opt-out, rider opt-out and eligibility prevent assignment', async () => {
    await post(driverA, 'driver/vehicle', { ...vehicle, autoDispatch: false });
    await post(driverB, 'driver/vehicle', { ...vehicle, autoDispatch: false });
    const opted = await request();
    tick();
    expect(await pending(opted.id)).toBeUndefined();
    await post(owner, `rides/${opted.id}/cancel`);
    await post(driverA, 'driver/vehicle', vehicle);
    await post(driverB, 'driver/vehicle', vehicle);
    for (const options of [
      { autoDispatch: false },
      { extraPetIds: [secondPet] },
      { petId: secondPet },
      { accompanying: true },
      { scheduledAt: new Date(Date.now() + 86400000).toISOString() },
    ]) {
      const r = await request(options);
      tick();
      expect(await pending(r.id)).toBeUndefined();
      await post(owner, `rides/${r.id}/cancel`);
    }
  });
  test('two dispatchers produce one private offer without leaking coordinates or reserving a second ride', async () => {
    ride = (await request()).id;
    tick();
    tick();
    offer = await pending(ride);
    expect(offer).toBeTruthy();
    const target = actor(offer.driver_id),
      excluded = target === driverA ? driverB : driverA;
    const home = await (await target.get(root + 'driver/home')).json();
    expect(home.offers).toHaveLength(1);
    expect(home.offers[0]).not.toHaveProperty('origin_lat');
    expect(JSON.stringify(home.offers)).not.toContain('بداية خاصة');
    expect(
      (await (await excluded.get(root + 'driver/home')).json()).requests.some(
        (r: { id: string }) => r.id === ride,
      ),
    ).toBe(false);
    expect(
      (
        await excluded.post(root + `rides/${ride}/claim`, { data: {} })
      ).status(),
    ).toBe(409);
    expect(
      (
        await other.post(root + `driver/dispatch-offers/${offer.id}/decline`, {
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await excluded.post(
          root + `driver/dispatch-offers/${offer.id}/decline`,
          { data: {} },
        )
      ).status(),
    ).toBe(404);
    const notification = await db.query(
      "SELECT payload FROM outbox_messages WHERE aggregate_id=$1 AND event_type='RideDispatchOffered'",
      [offer.id],
    );
    expect(notification.rows).toHaveLength(1);
    expect(notification.rows[0].payload).toEqual({
      actorId: offer.driver_id,
      clinicId: null,
    });
  });
  test('decline is idempotent and reassignment chooses a different eligible driver', async () => {
    await post(
      actor(offer.driver_id),
      `driver/dispatch-offers/${offer.id}/decline`,
    );
    await post(
      actor(offer.driver_id),
      `driver/dispatch-offers/${offer.id}/decline`,
    );
    tick();
    const next = await pending(ride);
    expect(next.driver_id).not.toBe(offer.driver_id);
    offer = next;
    await expect(
      db.query('DELETE FROM ride_dispatch_offers WHERE id=$1', [offer.id]),
    ).rejects.toMatchObject({ code: '23514' });
    const results = await Promise.all([
      actor(offer.driver_id).post(
        root + `driver/dispatch-offers/${offer.id}/accept`,
        { data: {} },
      ),
      actor(offer.driver_id).post(
        root + `driver/dispatch-offers/${offer.id}/accept`,
        { data: {} },
      ),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect(
      (
        await db.query('SELECT status FROM ride_dispatch_offers WHERE id=$1', [
          offer.id,
        ])
      ).rows[0].status,
    ).toBe('accepted');
  });
  test('a driver cannot accept or be offered a second active journey, and cancellation releases capacity', async () => {
    const occupied = actor(offer.driver_id),
      free = occupied === driverA ? driverB : driverA;
    const second = (await request()).id;
    tick();
    const next = await pending(second);
    expect(next.driver_id).not.toBe(offer.driver_id);
    expect(
      (
        await occupied.post(root + `rides/${second}/claim`, { data: {} })
      ).status(),
    ).toBe(409);
    await post(owner, `rides/${ride}/cancel`);
    await post(free, `rides/${second}/claim`);
    await expect(
      db.query("UPDATE rides SET status='accepted',driver_id=$2 WHERE id=$1", [
        ride,
        next.driver_id,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await post(owner, `rides/${second}/cancel`);
  });
  test('expired offer acceptance is rejected and opt-out withdraws immediately', async () => {
    // Hold the dispatch lock while adding an already elapsed historical offer.
    const connection = await db.connect();
    let elapsed: string;
    try {
      await connection.query('BEGIN');
      await connection.query('SELECT pg_advisory_xact_lock(823703)');
      const snapshot = (
        await connection.query(
          "INSERT INTO rides(user_id,pet_id,city,origin_label,destination_label,origin_lat,origin_lng,destination_lat,destination_lng,fare_minor,driver_share,idempotency_key,auto_dispatch) VALUES($1,$2,$3,'اختبار بداية','اختبار نهاية',33,44,33.01,44.01,7000000,6300000,$4,true) RETURNING id",
          [f.accounts.owner!.id, pet, city, randomUUID()],
        )
      ).rows[0].id;
      elapsed = (
        await connection.query(
          "INSERT INTO ride_dispatch_offers(ride_id,driver_id,created_at,expires_at) VALUES($1,$2,now()-interval '1 minute',now()-interval '15 seconds') RETURNING id",
          [snapshot, f.accounts.driver!.id],
        )
      ).rows[0].id;
      await connection.query('COMMIT');
      expect(
        (
          await driverA.post(
            root + `driver/dispatch-offers/${elapsed}/accept`,
            { data: {} },
          )
        ).status(),
      ).toBe(409);
      tick();
      expect(
        (
          await db.query(
            'SELECT status FROM ride_dispatch_offers WHERE id=$1',
            [elapsed],
          )
        ).rows[0].status,
      ).toBe('expired');
      await post(owner, `rides/${snapshot}/cancel`);
    } finally {
      await connection.query('ROLLBACK').catch(() => {});
      connection.release();
    }
    const r = (await request()).id;
    tick();
    const active = await pending(r);
    await post(actor(active.driver_id), 'driver/vehicle', {
      ...vehicle,
      autoDispatch: false,
    });
    expect(
      (
        await db.query('SELECT status FROM ride_dispatch_offers WHERE id=$1', [
          active.id,
        ])
      ).rows[0].status,
    ).toBe('withdrawn');
    tick();
    const next = await pending(r);
    expect(next.driver_id).not.toBe(active.driver_id);
    await post(owner, `rides/${r}/cancel`);
    expect(await pending(r)).toBeUndefined();
    await expect(
      db.query('UPDATE rides SET auto_dispatch=false WHERE id=$1', [r]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('driver workspace discovers offers automatically, expires offline, and clears revoked access', async ({
    page,
    context,
  }) => {
    await post(driverA, 'driver/vehicle', vehicle);
    await post(driverB, 'driver/vehicle', { ...vehicle, autoDispatch: false });
    await context.addCookies(
      f.accounts.driver!.cookie.split('; ').map((c) => {
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
    await page.goto('/driver');
    await expect(
      page.getByRole('button', { name: 'قبول عرض الإسناد', exact: true }),
    ).toHaveCount(0);
    const r = await request();
    tick();
    await expect(
      page.getByRole('button', { name: 'قبول عرض الإسناد', exact: true }),
    ).toHaveCount(1, { timeout: 12000 });
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
      path: 'docs/evidence/driver-auto-updates-390.png',
      fullPage: true,
    });
    // Lose the network and advance the browser clock past the 45-second offer lease.
    await page.clock.install();
    await context.setOffline(true);
    await page.clock.fastForward(46000);
    await expect(
      page.getByRole('button', { name: 'قبول عرض الإسناد', exact: true }),
    ).toHaveCount(0);
    await post(owner, `rides/${r.id}/cancel`);
    await db.query(
      "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1 AND kind='driver'",
      [f.accounts.driver!.id],
    );
    await page.clock.resume();
    await context.setOffline(false);
    await expect(
      page.getByRole('alert').filter({ hasText: 'انتهى إذن عرض مساحة السائق' }),
    ).toContainText('انتهى إذن عرض مساحة السائق', { timeout: 15000 });
    await expect(
      page.getByText('المستحق الاختباري من الدفتر', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'قبول الرحلة', exact: true }),
    ).toHaveCount(0);
  });
});
