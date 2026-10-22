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
  driver: APIRequestContext,
  maker: APIRequestContext,
  checker: APIRequestContext,
  other: APIRequestContext;
let pet: string, ride: string, caseId: string;
const city = `نزاع-${randomUUID().slice(0, 8)}`;
async function post(c: APIRequestContext, path: string, body: unknown = {}) {
  const r = await c.post(root + path, { data: body });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
const admin = (id: string) => `admin/transport/rides/${id}/dispute`;
async function request() {
  return post(owner, 'sandbox/rides', {
    petId: pet,
    city,
    originLabel: 'نقطة اختبار خاصة',
    destinationLabel: 'نهاية اختبار خاصة',
    originLat: 33.3152,
    originLng: 44.3661,
    destinationLat: 33.3115,
    destinationLng: 44.4009,
    policyAccepted: true,
    idempotencyKey: randomUUID(),
  });
}
async function completed() {
  const r = await request();
  await post(driver, `rides/${r.id}/claim`);
  for (const status of [
    'driver_en_route',
    'arrived',
    'in_transit',
    'completed',
  ])
    await post(driver, `rides/${r.id}/transition`, { status });
  return r;
}
test.describe
  .serial('Private transport disputes with independent sandbox compensation', () => {
  test.beforeAll(async () => {
    const path = `/tmp/petra-dispute-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', path], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(path, 'utf8'));
    } finally {
      rmSync(path, { force: true });
    }
    [owner, driver, maker, checker, other] = await Promise.all(
      ['owner', 'doctor', 'manager', 'other', 'stranger'].map((role) =>
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
        name: 'حيوان نزاع اختباري',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    await post(driver, 'driver/vehicle', {
      plate: 'DISPUTE-TEST',
      description: 'مركبة نزاع اختبارية',
      city,
      expiresOn: '2030-01-01',
      available: true,
    });
    ride = (await completed()).id;
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      driver?.dispose(),
      maker?.dispose(),
      checker?.dispose(),
      other?.dispose(),
    ]);
    await db.end();
  });
  test('general admin and finance grants do not grant dispute access; participants have scoped read', async () => {
    expect((await maker.get(root + 'admin/transport/disputes')).status()).toBe(
      403,
    );
    expect((await checker.get(root + admin(ride))).status()).toBe(403);
    expect((await other.get(root + `rides/${ride}/dispute`)).status()).toBe(
      404,
    );
    expect((await driver.get(root + `rides/${ride}/dispute`)).status()).toBe(
      200,
    );
    expect((await maker.get(root + `rides/${ride}/dispute`)).status()).toBe(
      404,
    );
    await db.query(
      "UPDATE admin_grants SET capabilities=capabilities||ARRAY['manage_transport_disputes'] WHERE user_id=ANY($1::uuid[])",
      [[f.accounts.manager!.id, f.accounts.other!.id]],
    );
  });
  test('opening and immutable statements are idempotent and cannot cross ride scope', async () => {
    const body = {
      reason: 'سبب نزاع اختباري خاص لا يظهر للعامة',
      idempotencyKey: randomUUID(),
    };
    const d = await post(owner, `rides/${ride}/dispute`, body);
    caseId = d.id;
    expect((await post(owner, `rides/${ride}/dispute`, body)).id).toBe(caseId);
    expect(
      (
        await owner.post(root + `rides/${ride}/dispute`, {
          data: { ...body, reason: 'سبب مختلف للطلب المعاد' },
        })
      ).status(),
    ).toBe(409);
    const message = {
      body: 'إفادة السائق الخاصة بسجل النقل الاختباري',
      idempotencyKey: randomUUID(),
    };
    const m = await post(driver, `rides/${ride}/dispute/messages`, message);
    expect(
      (await post(driver, `rides/${ride}/dispute/messages`, message)).id,
    ).toBe(m.id);
    expect(
      (
        await other.post(root + `rides/${ride}/dispute/messages`, {
          data: message,
        })
      ).status(),
    ).toBe(404);
    await expect(
      db.query('UPDATE ride_dispute_messages SET body=$2 WHERE id=$1', [
        m.id,
        'إفادة معدلة غير مسموحة',
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('DELETE FROM ride_disputes WHERE id=$1', [caseId]),
    ).rejects.toMatchObject({ code: '23514' });
    const pending = await request();
    expect(
      (
        await owner.post(root + `rides/${pending.id}/dispute`, {
          data: { ...body, idempotencyKey: randomUUID() },
        })
      ).status(),
    ).toBe(409);
    await post(owner, `rides/${pending.id}/cancel`);
  });
  test('proposal needs maker scope and version, while the same maker cannot approve even with both scopes', async () => {
    const body = {
      version: 1,
      kind: 'refund_full',
      reason: 'اقتراح رد كامل للتحصيل الاختباري بعد مراجعة الإفادات',
    };
    expect(
      (
        await checker.post(root + `${admin(ride)}/proposal`, { data: body })
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post(root + `${admin(ride)}/proposal`, { data: body })
      ).status(),
    ).toBe(403);
    expect((await post(maker, `${admin(ride)}/proposal`, body)).version).toBe(
      2,
    );
    expect(
      (
        await maker.post(root + `${admin(ride)}/proposal`, { data: body })
      ).status(),
    ).toBe(409);
    await db.query(
      "UPDATE platform_finance_grants SET scopes=scopes||ARRAY['checker'] WHERE user_id=$1",
      [f.accounts.manager!.id],
    );
    try {
      expect(
        (
          await maker.post(root + `${admin(ride)}/decision`, {
            data: {
              version: 2,
              approved: true,
              reason: 'محاولة اعتماد المقترح من معده نفسه',
            },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await db.query(
        "UPDATE platform_finance_grants SET scopes=array_remove(scopes,'checker') WHERE user_id=$1",
        [f.accounts.manager!.id],
      );
    }
  });
  test('concurrent approval refunds the exact original amount once and preserves the original posted journal', async () => {
    const body = {
      version: 2,
      approved: true,
      reason: 'اعتماد المراجع المستقل لتعويض اختباري كامل',
    };
    const results = await Promise.all([
      post(checker, `${admin(ride)}/decision`, body),
      post(checker, `${admin(ride)}/decision`, body),
    ]);
    expect(results[0].journal_id).toBeTruthy();
    expect(results[1].journal_id).toBe(results[0].journal_id);
    const journals = (
      await db.query(
        'SELECT source_key,status,created_by,approved_by FROM journals WHERE source_key=ANY($1::text[]) ORDER BY source_key',
        [[`ride:${ride}`, `ride-refund:${ride}`]],
      )
    ).rows;
    expect(journals).toHaveLength(2);
    expect(journals.every((j) => j.status === 'posted')).toBe(true);
    const refund = journals.find(
      (j) => j.source_key === `ride-refund:${ride}`,
    )!;
    expect(refund.created_by).toBe(f.accounts.manager!.id);
    expect(refund.approved_by).toBe(f.accounts.other!.id);
    expect(
      (
        await db.query(
          'SELECT sum(debit-credit)::text balance FROM journal_lines WHERE journal_id=$1',
          [results[0].journal_id],
        )
      ).rows[0].balance,
    ).toBe('0');
    expect(
      (await (await driver.get(root + 'driver/home')).json()).walletMinor,
    ).toBe('0');
    expect(
      (
        await owner.post(root + `rides/${ride}/dispute/messages`, {
          data: {
            body: 'إفادة بعد حسم النزاع غير مسموحة',
            idempotencyKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(409);
    await expect(
      db.query('UPDATE ride_disputes SET version=version+1 WHERE id=$1', [
        caseId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('spent driver payables block refund atomically; independent rejection closes with no financial effect', async () => {
    const r = await completed();
    await post(owner, `rides/${r.id}/dispute`, {
      reason: 'نزاع بعد صرف المستحق لا يولد رصيداً سالباً',
      idempotencyKey: randomUUID(),
    });
    await post(maker, `${admin(r.id)}/proposal`, {
      version: 1,
      kind: 'refund_full',
      reason: 'اقتراح تعويض اختباري يخضع لكفاية الرصيد',
    });
    const payout = await post(maker, 'admin/sandbox/payouts', {
      kind: 'driver',
      partyId: f.accounts.doctor!.id,
      amountMinor: r.driver_share,
    });
    await post(checker, `admin/sandbox/payouts/${payout.id}/pay`);
    expect(
      (
        await checker.post(root + `${admin(r.id)}/decision`, {
          data: {
            version: 2,
            approved: true,
            reason: 'محاولة تعويض بعد صرف المستحق الاختباري',
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await db.query(
          'SELECT status,journal_id FROM ride_disputes WHERE ride_id=$1',
          [r.id],
        )
      ).rows[0],
    ).toEqual({ status: 'proposed', journal_id: null });
    expect(
      (
        await db.query('SELECT 1 FROM journals WHERE source_key=$1', [
          `ride-refund:${r.id}`,
        ])
      ).rowCount,
    ).toBe(0);
    const decision = await post(checker, `${admin(r.id)}/decision`, {
      version: 2,
      approved: false,
      reason: 'رفض المقترح المالي لعدم توفر المستحق؛ يلزم إجراء مطابقة آخر',
    });
    expect(decision.status).toBe('resolved');
    expect(decision.journal_id).toBeNull();
  });
  test('mobile participant statements and reviewer queue preserve accessibility and private content', async ({
    page,
    context,
  }) => {
    const r = await request();
    await post(owner, `rides/${r.id}/cancel`);
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/taxi');
    const card = page
      .locator('.ride-card')
      .filter({ has: page.getByText('ملغى', { exact: true }) })
      .first();
    await card.getByText('سجل نزاع الرحلة وتسويته', { exact: true }).click();
    await card
      .getByLabel('سبب فتح النزاع', { exact: true })
      .fill('إفادة واجهة الهاتف بشأن رحلة ملغاة اختبارياً');
    await card
      .getByRole('button', { name: 'فتح نزاع الرحلة', exact: true })
      .click();
    await expect(
      card.getByRole('heading', { name: 'حالة النزاع: مفتوح', exact: true }),
    ).toBeVisible();
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
      path: 'docs/evidence/transport-dispute-390.png',
      fullPage: true,
    });
    expect((await maker.get(root + 'admin/transport/disputes')).status()).toBe(
      200,
    );
    const details = await (await maker.get(root + admin(r.id))).json();
    expect(details).not.toHaveProperty('origin_lat');
    expect(details.ride).not.toHaveProperty('origin_label');
  });
});
