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
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
    accounts: Record<string, { id: string; email: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext;
async function post(c: APIRequestContext, p: string, data: unknown = {}) {
  return c.post(root + p, { data });
}
async function create(c: APIRequestContext, p: string, data: unknown = {}) {
  const r = await post(c, p, data);
  expect(r.status(), `${p}: ${await r.text()}`).toBe(201);
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
const listingData = {
  title: 'إعلان رعاية اختبار',
  description: 'وصف تبني اصطناعي للاختبار فقط',
  city: 'بغداد',
  requirements: 'شروط اختبار دون تبني فعلي',
};
test.describe.serial('دورة إعلان التبني والحملة', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-lifecycle-${randomUUID()}.json`;
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
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), other?.dispose(), manager?.dispose()]);
    await db.end();
  });
  test('تعديل الإعلان يعيده للمراجعة، وإغلاقه يرفض الطلبات؛ سباق الإغلاق والتسليم لا ينقل مرتين', async () => {
    const pet = (
      await create(owner, 'pets', {
        name: 'حيوان دورة تبنٍ',
        species: 'cat',
        sex: 'female',
      })
    ).id;
    const l = await create(owner, 'adoptions', { ...listingData, petId: pet });
    const changed = {
      ...listingData,
      title: 'عنوان معدل قبل المراجعة',
      version: 1,
    };
    expect(
      (
        await other.patch(root + `adoptions/${l.id}`, { data: changed })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.patch(root + `adoptions/${l.id}`, { data: changed })
      ).status(),
    ).toBe(200);
    expect(
      (
        await owner.patch(root + `adoptions/${l.id}`, { data: changed })
      ).status(),
    ).toBe(409);
    await create(manager, `admin/rescue/listing/${l.id}`, { approved: true });
    const application = await create(other, `adoptions/${l.id}/applications`, {
      privateDetails: 'بيئة رعاية اصطناعية لا تتضمن طلب تبنٍ حقيقي',
    });
    expect(
      (
        await owner.patch(root + `adoptions/${l.id}`, {
          data: { ...changed, version: 3 },
        })
      ).status(),
    ).toBe(409);
    await create(owner, `adoptions/${l.id}/close`, { version: 3 });
    expect(
      (
        await db.query('SELECT status FROM adoption_applications WHERE id=$1', [
          application.id,
        ])
      ).rows[0].status,
    ).toBe('rejected');
    expect(
      (
        await post(other, `adoptions/${l.id}/applications`, {
          privateDetails: 'طلب جديد بعد الإغلاق غير مسموح',
        })
      ).status(),
    ).toBe(409);
    const second = await create(owner, 'adoptions', {
      ...listingData,
      petId: pet,
    });
    await create(manager, `admin/rescue/listing/${second.id}`, {
      approved: true,
    });
    const a = await create(other, `adoptions/${second.id}/applications`, {
      privateDetails: 'قدرة رعاية للاختبار فقط مع التزام اصطناعي',
    });
    await create(owner, `adoption-applications/${a.id}/decision`, {
      decision: 'approved',
      reason: 'قبول اختباري للمقارنة مع إغلاق الإعلان',
    });
    const version = (
      await db.query('SELECT version FROM adoption_listings WHERE id=$1', [
        second.id,
      ])
    ).rows[0].version;
    const result = await Promise.all([
      post(owner, `adoptions/${second.id}/close`, { version }),
      post(other, `adoption-applications/${a.id}/handover`, { received: true }),
    ]);
    expect(result.filter((r) => r.status() === 201)).toHaveLength(1);
    expect(
      result.map((r) => r.status()).every((s) => [201, 404, 409].includes(s)),
    ).toBe(true);
    const final = (
      await db.query(
        'SELECT l.status,p.owner_id FROM adoption_listings l JOIN pets p ON p.id=l.pet_id WHERE l.id=$1',
        [second.id],
      )
    ).rows[0];
    expect(final.owner_id).toBe(
      final.status === 'adopted'
        ? fixture.accounts.other.id
        : fixture.accounts.owner.id,
    );
    await expect(
      db.query(
        'UPDATE rescue_content_history SET version=100 WHERE resource_id=$1',
        [l.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('الحملة تحفظ شروطها بعد أول تبرع، وتغلق بأثر واحد مع السماح برد التبرعات القديمة', async () => {
    const input = {
      name: 'حملة دورة اختبار',
      purpose: 'غرض اصطناعي مستقل',
      beneficiary: 'مستفيد اختبار غير حقيقي',
      goalMinor: '30000',
    };
    const c = await create(manager, 'admin/sandbox/campaigns', input);
    const edit = {
      ...input,
      name: 'حملة معدلة قبل التبرعات',
      goalMinor: '40000',
      version: 1,
      reason: 'تصحيح بيانات اختبار قبل أي تحصيل',
    };
    expect(
      (
        await owner.patch(root + `admin/sandbox/campaigns/${c.id}`, {
          data: edit,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await manager.patch(root + `admin/sandbox/campaigns/${c.id}`, {
          data: edit,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await manager.patch(root + `admin/sandbox/campaigns/${c.id}`, {
          data: edit,
        })
      ).status(),
    ).toBe(409);
    const key = randomUUID(),
      donation = await create(owner, `sandbox/campaigns/${c.id}/donate`, {
        amountMinor: '1000',
        anonymous: true,
        idempotencyKey: key,
      });
    expect(
      (
        await manager.patch(root + `admin/sandbox/campaigns/${c.id}`, {
          data: { ...edit, version: 2 },
        })
      ).status(),
    ).toBe(409);
    const close = {
      version: 2,
      reason: 'إيقاف حملة الاختبار دون تغيير مستحقاتها',
    };
    const raced = await Promise.all([
      post(manager, `admin/sandbox/campaigns/${c.id}/close`, close),
      post(other, `sandbox/campaigns/${c.id}/donate`, {
        amountMinor: '1000',
        anonymous: true,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(raced[0]!.status()).toBe(201);
    expect([201, 409]).toContain(raced[1]!.status());
    expect(
      (
        await post(owner, `sandbox/campaigns/${c.id}/donate`, {
          amountMinor: '1',
          anonymous: true,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await create(owner, `sandbox/campaigns/${c.id}/donate`, {
          amountMinor: '1000',
          anonymous: true,
          idempotencyKey: key,
        })
      ).id,
    ).toBe(donation.id);
    await create(owner, `sandbox/donations/${donation.id}/refund`);
    if (raced[1]!.status() === 201)
      await create(
        other,
        `sandbox/donations/${(await raced[1]!.json()).id}/refund`,
      );
    expect(
      (
        await db.query('SELECT status FROM donation_campaigns WHERE id=$1', [
          c.id,
        ])
      ).rows[0].status,
    ).toBe('closed');
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM audit_events WHERE action='sandbox.campaign_closed' AND details->>'campaignId'=$1",
          [c.id],
        )
      ).rows[0].n,
    ).toBe(1);
    await create(manager, `admin/sandbox/campaigns/${c.id}/close`, close);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM audit_events WHERE action='sandbox.campaign_closed' AND details->>'campaignId'=$1",
          [c.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  test('المالك يعدل ويغلق الإعلان من الواجهة، والإدارة تعدل الحملة ثم توقفها', async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const pet = (
      await create(owner, 'pets', {
        name: 'رفيق واجهة الإغلاق',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    const title = `إعلان واجهة ${randomUUID().slice(0, 6)}`;
    const listing = await create(owner, 'adoptions', {
      ...listingData,
      title,
      petId: pet,
    });
    const campaign = await create(manager, 'admin/sandbox/campaigns', {
      name: `حملة واجهة ${randomUUID().slice(0, 6)}`,
      purpose: 'حملة اصطناعية لاختبار الحفظ',
      beneficiary: 'مستفيد اصطناعي للاختبار',
      goalMinor: '40000',
    });
    const oc = await browser.newContext(),
      mc = await browser.newContext();
    try {
      await cookies(oc, 'owner');
      await cookies(mc, 'manager');
      const p = await oc.newPage(),
        m = await mc.newPage();
      await p.goto(origin + '/adoption');
      const row = p
        .getByRole('heading', { name: new RegExp(title) })
        .locator('../..');
      await row.getByText('تعديل الإعلان أو إغلاقه', { exact: true }).click();
      await row.getByLabel('عنوان الإعلان المعدل').fill(title + ' معدل');
      await row
        .getByRole('button', {
          name: 'تعديل الإعلان وإرساله للمراجعة',
          exact: true,
        })
        .click();
      await expect(
        row.getByRole('heading', { name: title + ' معدل' }),
      ).toBeVisible();
      await row.getByRole('checkbox').check();
      await row
        .getByRole('button', { name: 'إغلاق إعلان التبني', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await db.query(
                'SELECT status FROM adoption_listings WHERE id=$1',
                [listing.id],
              )
            ).rows[0].status,
        )
        .toBe('removed');
      await m.goto(origin + '/admin/operations');
      const summary = m.getByText(campaign.name, { exact: false });
      await summary.click();
      const details = summary.locator('..');
      await details
        .getByLabel('اسم الحملة المعدل')
        .fill(campaign.name + ' معدلة');
      await details
        .getByLabel('سبب تعديل الحملة')
        .fill('سبب اختباري واضح لتعديل الحملة');
      await details
        .getByRole('button', { name: 'حفظ تعديل الحملة', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await db.query(
                'SELECT version FROM donation_campaigns WHERE id=$1',
                [campaign.id],
              )
            ).rows[0].version,
        )
        .toBe(2);
      await details
        .getByLabel('سبب إيقاف الحملة')
        .fill('إغلاق اختباري واضح دون تحصيل مالي');
      await details.getByRole('checkbox').check();
      await details
        .getByRole('button', { name: 'إيقاف استقبال التبرعات', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await db.query(
                'SELECT status FROM donation_campaigns WHERE id=$1',
                [campaign.id],
              )
            ).rows[0].status,
        )
        .toBe('closed');
    } finally {
      await oc.close();
      await mc.close();
    }
  });
});
