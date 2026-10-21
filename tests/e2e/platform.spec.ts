import {
  test,
  expect,
  request as requestFactory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const apiRoot = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
  accounts: Record<string, { id: string; email: string; cookie: string }>;
  clinicId: string;
  clinicB: string;
  branchId: string;
};
let owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext;
let productA: string,
  productB: string,
  purchaseId: string,
  orderId: string,
  childA: string,
  lineA: string,
  petId: string,
  serviceId: string,
  encounterId: string,
  subscriptionId: string,
  rideId: string,
  listingId: string,
  campaignId: string;
async function send(c: APIRequestContext, path: string, data: unknown = {}) {
  return c.post(apiRoot + path, { data });
}
async function get(c: APIRequestContext, path: string) {
  return c.get(apiRoot + path);
}
async function expectJson(
  c: APIRequestContext,
  path: string,
  data: unknown = {},
) {
  const r = await send(c, path, data);
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function stock(
  c: APIRequestContext,
  clinic: string,
  sku: string,
  price: string,
  cost: string,
  quantity: number,
) {
  const p = await expectJson(c, `clinics/${clinic}/products`, {
    sku,
    name: `منتج اختبار ${sku}`,
    description: 'منتج fixture محلي فقط',
    priceMinor: price,
    costMinor: cost,
  });
  const v = await expectJson(c, `clinics/${clinic}/vendors`, {
    name: 'مورد اختبار',
    contact: 'بيانات غير حقيقية',
  });
  const po = await expectJson(c, `clinics/${clinic}/purchases`, {
    productId: p.id,
    vendorId: v.id,
    quantity,
    unitCost: cost,
  });
  await expectJson(c, `clinics/${clinic}/purchases/${po.id}/receive`);
  await expectJson(c, `clinics/${clinic}/purchases/${po.id}/bill`);
  return { product: p.id, purchase: po.id };
}
async function cookies(context: BrowserContext, role: string) {
  await context.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((c) => {
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
}
test.describe
  .serial('بقية الموقع: تجارة ودفتر وخدمات ومجتمع وإنقاذ ونقل', () => {
  test.beforeAll(async () => {
    const file = `/tmp/platform-fixture-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    const contexts = await Promise.all(
      ['owner', 'other', 'manager', 'doctor', 'stranger'].map((role) =>
        requestFactory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    [owner, other, manager, doctor, stranger] = contexts;
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
  test('كتالوج ومشتريات واستلام ومطابقة، وعزل العيادات', async () => {
    await db.query('UPDATE sandbox_policy SET commission_bps=1000');
    const a = await stock(
      manager,
      fixture.clinicId,
      `A-${randomUUID()}`,
      '100000000',
      '60000000',
      3,
    );
    productA = a.product;
    purchaseId = a.purchase;
    const b = await stock(
      other,
      fixture.clinicB,
      `B-${randomUUID()}`,
      '20000000',
      '5000000',
      2,
    );
    productB = b.product;
    expect(
      (await get(other, `clinics/${fixture.clinicId}/commerce`)).status(),
    ).toBe(403);
    expect(
      (await get(other, `clinics/${fixture.clinicId}/finance`)).status(),
    ).toBe(403);
    expect(
      (
        await other.patch(
          `${apiRoot}clinics/${fixture.clinicB}/products/${productA}`,
          {
            data: {
              name: 'اختراق',
              description: '',
              priceMinor: '1',
              active: true,
              version: 1,
            },
          },
        )
      ).status(),
    ).toBe(409);
    const catalog = await (await get(owner, 'marketplace')).json();
    expect(
      catalog.find((p: { id: string }) => p.id === productA).available,
    ).toBe(3);
    expect(
      (
        await send(
          manager,
          `clinics/${fixture.clinicId}/purchases/${purchaseId}/receive`,
        )
      ).status(),
    ).toBe(409);
  });
  test('سلة متعددة العيادات وتحصل خمس مرات بأثر واحد وتسليم حقيقي', async () => {
    const payload = {
      idempotencyKey: randomUUID(),
      items: [
        { productId: productA, quantity: 2 },
        { productId: productB, quantity: 1 },
      ],
      address: 'عنوان اختبار خاص في بغداد',
    };
    const o = await expectJson(owner, 'checkout', payload);
    orderId = o.id;
    expect(o.total_minor).toBe('220000000');
    expect((await expectJson(owner, 'checkout', payload)).id).toBe(orderId);
    expect(
      (
        await send(owner, 'checkout', { ...payload, total_minor: '1' })
      ).status(),
    ).toBe(400);
    const captures = await Promise.all(
      Array.from({ length: 5 }, () =>
        send(owner, `sandbox/orders/${orderId}/capture`, {
          eventKey: randomUUID(),
        }),
      ),
    );
    expect(captures.map((r) => r.status())).toEqual([201, 201, 201, 201, 201]);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM sandbox_captures WHERE order_id=$1',
          [orderId],
        )
      ).rows[0].n,
    ).toBe(1);
    const orders = await (await get(owner, 'me/orders')).json();
    const stored = orders.find((o: { id: string }) => o.id === orderId);
    expect(stored.children).toHaveLength(2);
    for (const c of stored.children) {
      for (const status of ['packed', 'shipped', 'delivered'])
        await expectJson(
          c.clinic_id === fixture.clinicId ? manager : other,
          `clinics/${c.clinic_id}/orders/${c.id}/transition`,
          { status },
        );
      if (c.clinic_id === fixture.clinicId) {
        childA = c.id;
        lineA = c.lines[0].id;
      }
    }
    expect(
      (
        await db.query('SELECT on_hand,reserved FROM products WHERE id=$1', [
          productA,
        ])
      ).rows[0],
    ).toEqual({ on_hand: 1, reserved: 0 });
    const bad = await db.query(
      "SELECT j.id FROM journals j JOIN journal_lines l ON l.journal_id=j.id WHERE j.status='posted' GROUP BY j.id HAVING sum(l.debit)<>sum(l.credit)",
    );
    expect(bad.rowCount).toBe(0);
  });
  test('سباق مخزون قطعة واحدة، وانتهاء الحجز يعيدها عبر العامل', async () => {
    const p = await stock(
      manager,
      fixture.clinicId,
      `R-${randomUUID()}`,
      '1000',
      '500',
      1,
    );
    const payload = {
      items: [{ productId: p.product, quantity: 1 }],
      address: 'عنوان اختبار الخصوصية',
    };
    const results = await Promise.all([
      send(owner, 'checkout', { ...payload, idempotencyKey: randomUUID() }),
      send(stranger, 'checkout', { ...payload, idempotencyKey: randomUUID() }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    const winner = await results.find((r) => r.status() === 201)!.json();
    await db.query(
      "UPDATE checkout_orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [winner.id],
    );
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT reserved FROM products WHERE id=$1', [
              p.product,
            ])
          ).rows[0].reserved,
        { timeout: 10000 },
      )
      .toBe(0);
  });
  test('مرتجع جزئي يعكس العمولة وتكلفة FIFO مرة واحدة', async () => {
    const r = await expectJson(owner, `order-lines/${lineA}/returns`, {
      quantity: 1,
      reason: 'إرجاع اختباري موثق للقطعة الأولى',
    });
    const results = await Promise.all([
      send(manager, `clinics/${fixture.clinicId}/returns/${r.id}/approve`, {
        restock: true,
      }),
      send(manager, `clinics/${fixture.clinicId}/returns/${r.id}/approve`, {
        restock: true,
      }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect(
      (
        await db.query('SELECT on_hand,reserved FROM products WHERE id=$1', [
          productA,
        ])
      ).rows[0],
    ).toEqual({ on_hand: 2, reserved: 0 });
    expect(
      (
        await db.query(
          'SELECT returned_quantity FROM order_lines WHERE id=$1',
          [lineA],
        )
      ).rows[0].returned_quantity,
    ).toBe(1);
    expect(
      (await db.query('SELECT status FROM clinic_orders WHERE id=$1', [childA]))
        .rows[0].status,
    ).toBe('delivered');
    const fees = (
      await db.query(
        "SELECT l.debit::text FROM journal_lines l JOIN journals j ON j.id=l.journal_id JOIN ledger_entities e ON e.id=j.entity_id WHERE j.source_key=$1 AND e.kind='platform' AND l.account_code='4000'",
        [`return-payment:${r.id}`],
      )
    ).rows;
    expect(fees[0].debit).toBe('10000000');
  });
  test('قاعدة البيانات ترفض القيد غير المتوازن وتعديل المرحل وتفرض اعتمادًا مستقلًا', async () => {
    const report = await (
      await get(doctor, `clinics/${fixture.clinicId}/finance`)
    ).json();
    const posted = report.journals.find(
      (j: { status: string }) => j.status === 'posted',
    );
    await expect(
      db.query("UPDATE journals SET description='changed' WHERE id=$1", [
        posted.id,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      db.query('DELETE FROM journal_lines WHERE journal_id=$1', [posted.id]),
    ).rejects.toThrow('immutable');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const j = (
        await client.query(
          "INSERT INTO journals(entity_id,source_key,description,created_by) VALUES($1,$2,'unbalanced fixture',$3) RETURNING id",
          [report.entityId, randomUUID(), fixture.accounts.doctor.id],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO journal_lines(journal_id,entity_id,account_code,debit) VALUES($1,$2,'1000',1)",
        [j.id, report.entityId],
      );
      await client.query("UPDATE journals SET status='posted' WHERE id=$1", [
        j.id,
      ]);
      await expect(client.query('COMMIT')).rejects.toThrow('balance');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    const input = {
      idempotencyKey: randomUUID(),
      description: 'قيد تمويل صندوق الاختبار',
      date: new Date().toISOString().slice(0, 10),
      lines: [
        { account: '1000', debit: '200000000', credit: '0' },
        { account: '3000', debit: '0', credit: '200000000' },
      ],
    };
    const j = await expectJson(
      doctor,
      `clinics/${fixture.clinicId}/finance/journals`,
      input,
    );
    expect(j.status).toBe('draft');
    const approval = (
      await db.query('SELECT id FROM finance_approvals WHERE source_id=$1', [
        j.id,
      ])
    ).rows[0].id;
    expect(
      (
        await send(
          doctor,
          `clinics/${fixture.clinicId}/finance/approvals/${approval}/approve`,
        )
      ).status(),
    ).toBe(403);
    await expectJson(
      stranger,
      `clinics/${fixture.clinicId}/finance/approvals/${approval}/approve`,
    );
    const a = await expectJson(
      doctor,
      `clinics/${fixture.clinicId}/finance/approvals`,
      {
        kind: 'vendor_payment',
        sourceId: purchaseId,
        reason: 'صرف اختباري بعد مطابقة الاستلام والفاتورة',
      },
    );
    await expectJson(
      stranger,
      `clinics/${fixture.clinicId}/finance/approvals/${a.id}/approve`,
    );
    expect(
      (
        await send(
          stranger,
          `clinics/${fixture.clinicId}/finance/approvals/${a.id}/approve`,
        )
      ).status(),
    ).toBe(409);
    await expectJson(
      manager,
      `clinics/${fixture.clinicId}/finance/periods/close`,
      { startsOn: '2020-01-01', endsOn: '2020-02-01' },
    );
    expect(
      (
        await send(doctor, `clinics/${fixture.clinicId}/finance/journals`, {
          ...input,
          idempotencyKey: randomUUID(),
          date: '2020-01-15',
        })
      ).status(),
    ).toBe(409);
  });
  test('رعاية موقعة ثم اشتراك: استخدام متزامن واحد، وفندق لا يقبل تداخلًا', async () => {
    petId = (
      await expectJson(owner, 'pets', {
        name: 'حيوان المنصة',
        species: 'cat',
        sex: 'female',
      })
    ).id;
    serviceId = (
      await expectJson(manager, `clinics/${fixture.clinicId}/services`, {
        name: 'خدمة اشتراك الاختبار',
        durationMinutes: 30,
      })
    ).id;
    const plan = await expectJson(
      manager,
      `clinics/${fixture.clinicId}/care-plans`,
      {
        serviceId,
        name: 'باقة اختبار',
        priceMinor: '10001',
        uses: 3,
        validDays: 30,
      },
    );
    subscriptionId = (
      await expectJson(owner, 'sandbox/subscriptions', {
        planId: plan.id,
        petId,
        idempotencyKey: randomUUID(),
      })
    ).id;
    const slot = await expectJson(doctor, `clinics/${fixture.clinicId}/slots`, {
      serviceId,
      branchId: fixture.branchId,
      startsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const appointment = await expectJson(owner, 'appointments', {
      petId,
      slotId: slot.id,
      idempotencyKey: randomUUID(),
    });
    await expectJson(owner, `pets/${petId}/consents`, {
      doctorId: fixture.accounts.doctor.id,
      clinicId: fixture.clinicId,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '1 hour',ends_at=now()-interval '30 minutes' WHERE id=$1",
      [appointment.id],
    );
    const e = await expectJson(
      doctor,
      `appointments/${appointment.id}/encounter`,
      {
        version: 0,
        content: {
          complaint: 'اختبار',
          subjective: '',
          objective: '',
          assessment: 'تقييم fixture',
          plan: 'متابعة fixture',
          prescriptions: [],
          vaccines: [],
          labs: [],
          followUps: [],
        },
      },
    );
    encounterId = e.id;
    await expectJson(doctor, `encounters/${e.id}/sign`, { version: 1 });
    const used = await Promise.all([
      send(doctor, `subscriptions/${subscriptionId}/redeem`, { encounterId }),
      send(doctor, `subscriptions/${subscriptionId}/redeem`, { encounterId }),
    ]);
    expect(used.map((r) => r.status())).toEqual([201, 201]);
    expect((await used[0]!.json()).id).toBe((await used[1]!.json()).id);
    expect(
      (
        await db.query('SELECT uses_used FROM care_subscriptions WHERE id=$1', [
          subscriptionId,
        ])
      ).rows[0].uses_used,
    ).toBe(1);
    const unit = await expectJson(
      manager,
      `clinics/${fixture.clinicId}/boarding-units`,
      { name: 'غرفة واحدة للاختبار', species: 'cat', nightPrice: '5000' },
    );
    const pet2 = (
      await expectJson(other, 'pets', {
        name: 'حيوان آخر',
        species: 'cat',
        sex: 'male',
      })
    ).id;
    const payload = {
      unitId: unit.id,
      startsOn: '2027-04-01',
      endsOn: '2027-04-03',
    };
    const rooms = await Promise.all([
      send(owner, 'sandbox/boarding', {
        ...payload,
        petId,
        idempotencyKey: randomUUID(),
      }),
      send(other, 'sandbox/boarding', {
        ...payload,
        petId: pet2,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(rooms.map((r) => r.status()).sort()).toEqual([201, 409]);
  });
  test('المجتمع: الخصوصية والحظر والرسائل المتينة ومنع وصول المرفق', async () => {
    await expectJson(owner, 'social/profile', {
      displayName: 'حساب المجتمع الخاص',
      bio: 'fixture',
      privacy: 'private',
    });
    await expectJson(other, 'social/profile', {
      displayName: 'حساب المتابع',
      bio: 'fixture',
      privacy: 'public',
    });
    const image = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=40x40',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    const asset = await expectJson(owner, 'media', {
      dataBase64: image.toString('base64'),
    });
    const p = await expectJson(owner, 'social/posts', {
      body: 'منشور خاص بالمتابعين',
      visibility: 'followers',
      kind: 'post',
      assetId: asset.id,
    });
    expect((await get(other, `social/posts/${p.id}`)).status()).toBe(404);
    expect((await get(other, `media/${asset.id}/file`)).status()).toBe(404);
    await expectJson(other, `social/users/${fixture.accounts.owner.id}/follow`);
    expect((await get(other, `social/posts/${p.id}`)).status()).toBe(404);
    await expectJson(
      owner,
      `social/users/${fixture.accounts.other.id}/accept-follow`,
    );
    expect((await get(other, `social/posts/${p.id}`)).status()).toBe(200);
    expect((await get(other, `media/${asset.id}/file`)).status()).toBe(200);
    const key = randomUUID();
    const one = await expectJson(
      other,
      `social/messages/${fixture.accounts.owner.id}`,
      { body: 'رسالة محفوظة', idempotencyKey: key },
    );
    const two = await expectJson(
      other,
      `social/messages/${fixture.accounts.owner.id}`,
      { body: 'رسالة محفوظة', idempotencyKey: key },
    );
    expect(one.id).toBe(two.id);
    expect(
      (
        await (
          await get(owner, `social/messages/${fixture.accounts.other.id}`)
        ).json()
      ).map((m: { id: string }) => m.id),
    ).toContain(one.id);
    await expectJson(other, `social/posts/${p.id}/reactions`, {
      kind: 'save',
      enabled: true,
    });
    expect(
      (await (await get(other, 'social/feed?saved=true')).json()).map(
        (post: { id: string }) => post.id,
      ),
    ).toContain(p.id);
    // A third party cannot revoke a relationship belonging to this owner.
    expect(
      (
        await stranger.delete(
          `${apiRoot}social/followers/${fixture.accounts.other.id}`,
        )
      ).status(),
    ).toBe(200);
    expect((await get(other, `social/posts/${p.id}`)).status()).toBe(200);
    expect(
      (
        await owner.delete(
          `${apiRoot}social/followers/${fixture.accounts.other.id}`,
        )
      ).status(),
    ).toBe(200);
    expect((await get(other, `social/posts/${p.id}`)).status()).toBe(404);
    expect((await get(other, `media/${asset.id}/file`)).status()).toBe(404);
    expect(
      (await (await get(other, 'social/feed?saved=true')).json()).map(
        (post: { id: string }) => post.id,
      ),
    ).not.toContain(p.id);
    await expectJson(other, `social/users/${fixture.accounts.owner.id}/follow`);
    await owner.delete(
      `${apiRoot}social/followers/${fixture.accounts.other.id}`,
    );
    expect(
      (
        await db.query(
          'SELECT 1 FROM social_follows WHERE follower_id=$1 AND followed_id=$2',
          [fixture.accounts.other.id, fixture.accounts.owner.id],
        )
      ).rowCount,
    ).toBe(0);
    await expectJson(other, `social/users/${fixture.accounts.owner.id}/follow`);
    await expectJson(
      owner,
      `social/users/${fixture.accounts.other.id}/accept-follow`,
    );
    await other.delete(
      `${apiRoot}social/users/${fixture.accounts.owner.id}/follow`,
    );
    expect((await get(other, `media/${asset.id}/file`)).status()).toBe(404);
    await expectJson(other, `social/users/${fixture.accounts.owner.id}/follow`);
    await expectJson(
      owner,
      `social/users/${fixture.accounts.other.id}/accept-follow`,
    );
    await expectJson(owner, `social/users/${fixture.accounts.other.id}/block`);
    expect((await get(other, `social/posts/${p.id}`)).status()).toBe(404);
    expect((await get(other, `media/${asset.id}/file`)).status()).toBe(404);
    expect(
      (
        await send(other, `social/messages/${fixture.accounts.owner.id}`, {
          body: 'مرفوض',
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(404);
    const story = await expectJson(owner, 'social/posts', {
      body: 'قصة منتهية',
      visibility: 'public',
      kind: 'story',
    });
    await db.query(
      "UPDATE social_posts SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [story.id],
    );
    expect((await get(owner, `social/posts/${story.id}`)).status()).toBe(404);
  });
  test('الفيديو لا ينشر قبل التحويل، ومرفق طبي لا يقرأه مستخدم آخر', async () => {
    const video = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=48x64:d=0.3',
      '-c:v',
      'libx264',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ]);
    const asset = await expectJson(owner, 'media', {
      dataBase64: video.toString('base64'),
    });
    expect(asset.status).toBe('pending');
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT status FROM media_assets WHERE id=$1', [
              asset.id,
            ])
          ).rows[0].status,
        { timeout: 20000 },
      )
      .toBe('ready');
    await expectJson(owner, 'social/posts', {
      body: 'فيديو fixture معالج',
      visibility: 'private',
      kind: 'reel',
      assetId: asset.id,
    });
    expect(
      (
        await send(owner, 'media', {
          dataBase64: Buffer.from('<svg onload="alert(1)"/>').toString(
            'base64',
          ),
        })
      ).status(),
    ).toBe(400);
    const image = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=30x30',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    const medical = await expectJson(owner, 'media', {
      dataBase64: image.toString('base64'),
      petId,
    });
    expect((await get(other, `media/${medical.id}/file`)).status()).toBe(404);
    expect(
      (
        await get(
          doctor,
          `media/${medical.id}/file?clinicId=${fixture.clinicId}`,
        )
      ).status(),
    ).toBe(200);
  });
  test('الرفع الخاطئ يحتسب محاولاته، وروابط الملفات الرمزية لا تكشف ملفات الخادم', async () => {
    for (let n = 0; n < 6; n++) {
      const response = await stranger.post(`${apiRoot}media`, {
        headers: { 'content-type': 'application/json' },
        data: '{',
      });
      expect(response.status()).toBe(n < 5 ? 400 : 429);
    }
    const id = randomUUID(),
      key = `${id}.webp`;
    const path = join(process.env.PETRA_MEDIA_ROOT!, key);
    const canary = `/tmp/petra-file-canary-${id}`;
    const secret = randomUUID();
    try {
      writeFileSync(canary, secret, { mode: 0o600 });
      symlinkSync(canary, path);
      await db.query(
        "INSERT INTO media_assets(id,owner_id,kind,status,mime,byte_count,storage_key) VALUES($1,$2,'image','ready','image/webp',36,$3)",
        [id, fixture.accounts.stranger.id, key],
      );
      const response = await get(stranger, `media/${id}/file`);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain(secret);
    } finally {
      rmSync(path, { force: true });
      rmSync(canary, { force: true });
      await db.query('DELETE FROM media_assets WHERE id=$1', [id]);
    }
  });
  test('الاعتماد المالي يرفض غياب MFA والجلسة القديمة أو السابقة لتفعيله', async () => {
    const path = `clinics/${fixture.clinicId}/finance/approvals/${randomUUID()}/approve`;
    const missing = await send(doctor, path);
    expect(missing.status()).toBe(403);
    expect((await missing.json()).message).toContain('التحقق بخطوتين');
    const s = (
      await db.query(
        'SELECT id,"createdAt" FROM auth_sessions WHERE "userId"=$1',
        [fixture.accounts.stranger.id],
      )
    ).rows[0];
    const u = (
      await db.query('SELECT mfa_session_after FROM auth_users WHERE id=$1', [
        fixture.accounts.stranger.id,
      ])
    ).rows[0];
    try {
      await db.query(
        "UPDATE auth_users SET mfa_session_after=now()-interval '40 minutes' WHERE id=$1",
        [fixture.accounts.stranger.id],
      );
      await db.query(
        'UPDATE auth_sessions SET "createdAt"=now()-interval \'31 minutes\' WHERE id=$1',
        [s.id],
      );
      expect((await send(stranger, path)).status()).toBe(403);
      await db.query('UPDATE auth_sessions SET "createdAt"=$2 WHERE id=$1', [
        s.id,
        s.createdAt,
      ]);
      await db.query(
        'UPDATE auth_users SET mfa_session_after=clock_timestamp() WHERE id=$1',
        [fixture.accounts.stranger.id],
      );
      expect((await send(stranger, path)).status()).toBe(403);
    } finally {
      await db.query('UPDATE auth_sessions SET "createdAt"=$2 WHERE id=$1', [
        s.id,
        s.createdAt,
      ]);
      await db.query('UPDATE auth_users SET mfa_session_after=$2 WHERE id=$1', [
        fixture.accounts.stranger.id,
        u.mfa_session_after,
      ]);
    }
    // Fresh MFA passes the session gate, then the unrelated approval is rejected.
    expect((await send(stranger, path)).status()).toBe(409);
  });
  test('تبنٍ ببيانات خاصة وقبول ثم تسليم، وبلاغ لا يكشف موقعه', async () => {
    const pet = (
      await expectJson(owner, 'pets', {
        name: 'حيوان للتبني',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    listingId = (
      await expectJson(owner, 'adoptions', {
        petId: pet,
        title: 'بيت جديد fixture',
        description: 'وصف اختبار صالح',
        city: 'بغداد',
        requirements: 'رعاية منزلية مسؤولة',
      })
    ).id;
    expect(
      (await (await get(other, 'adoptions')).json()).some(
        (l: { id: string }) => l.id === listingId,
      ),
    ).toBe(false);
    await expectJson(manager, `admin/rescue/listing/${listingId}`, {
      approved: true,
    });
    const a = await expectJson(other, `adoptions/${listingId}/applications`, {
      privateDetails: 'معلومات شخصية اصطناعية لا تظهر للعامة',
    });
    expect(
      (await get(stranger, `adoptions/${listingId}/applications`)).status(),
    ).toBe(404);
    await expectJson(owner, `adoption-applications/${a.id}/decision`, {
      decision: 'approved',
      reason: 'مراجعة fixture متوافقة لشروط الرعاية',
    });
    await expectJson(other, `adoption-applications/${a.id}/handover`, {
      received: true,
    });
    expect((await get(owner, `pets/${pet}`)).status()).toBe(404);
    expect((await get(other, `pets/${pet}`)).status()).toBe(200);
    const c = await expectJson(owner, 'rescue/cases', {
      kind: 'rescue',
      title: 'بلاغ اختبار',
      description: 'تفاصيل اختبار لا تمثل حالة فعلية',
      city: 'بغداد',
      privateLocation: 'عنوان سري fixture لا تنشره',
    });
    await expectJson(manager, `admin/rescue/case/${c.id}`, { approved: true });
    const publicCase = (await (await get(other, 'rescue/cases')).json()).find(
      (x: { id: string }) => x.id === c.id,
    );
    expect(publicCase.private_location).toBeUndefined();
    await expectJson(manager, `rescue/cases/${c.id}/accept`, {
      clinicId: fixture.clinicId,
    });
    await expectJson(manager, `rescue/cases/${c.id}/transition`, {
      status: 'in_progress',
    });
    await expectJson(manager, `rescue/cases/${c.id}/transition`, {
      status: 'resolved',
    });
  });
  test('التبرعات المقيدة ومطابقة الصرف لا تتكرر أو تتجاوز فصل المهام', async () => {
    campaignId = (
      await expectJson(manager, 'admin/sandbox/campaigns', {
        name: 'حملة fixture',
        purpose: 'اختبار الأموال المقيدة فقط',
        beneficiary: 'جهة اختبار غير حقيقية',
        goalMinor: '100000',
      })
    ).id;
    const key = randomUUID();
    const ds = await Promise.all([
      send(owner, `sandbox/campaigns/${campaignId}/donate`, {
        amountMinor: '100000',
        anonymous: true,
        idempotencyKey: key,
      }),
      send(owner, `sandbox/campaigns/${campaignId}/donate`, {
        amountMinor: '100000',
        anonymous: true,
        idempotencyKey: key,
      }),
    ]);
    expect(ds.map((r) => r.status())).toEqual([201, 201]);
    const donation = (await ds[0]!.json()).id;
    expect(
      (await (await get(owner, 'donations/campaigns')).json()).find(
        (c: { id: string }) => c.id === campaignId,
      ).collected_minor,
    ).toBe('100000');
    const platform = (
      await db.query("SELECT id FROM ledger_entities WHERE kind='platform'")
    ).rows[0].id;
    expect(
      (
        await db.query(
          "SELECT sum(credit-debit)::text amount FROM journal_lines WHERE entity_id=$1 AND account_code='2300' AND party_id=$2",
          [platform, campaignId],
        )
      ).rows[0].amount,
    ).toBe('100000');
    await expectJson(owner, `sandbox/donations/${donation}/refund`);
    expect(
      (await send(owner, `sandbox/donations/${donation}/refund`)).status(),
    ).toBe(409);
    await db.query(
      "UPDATE platform_finance_grants SET scopes=ARRAY['maker','checker'] WHERE user_id=$1",
      [fixture.accounts.manager.id],
    );
    const payout = await expectJson(manager, 'admin/sandbox/payouts', {
      kind: 'clinic',
      partyId: fixture.clinicId,
      amountMinor: '1000',
    });
    expect(
      (await send(manager, `admin/sandbox/payouts/${payout.id}/pay`)).status(),
    ).toBe(403);
    await expectJson(other, `admin/sandbox/payouts/${payout.id}/pay`);
    expect(
      (
        await send(other, `admin/sandbox/payouts/${payout.id}/reconcile`, {
          amountMinor: '999',
          statementReference: 'fixture-mismatch',
        })
      ).status(),
    ).toBe(409);
    await expectJson(other, `admin/sandbox/payouts/${payout.id}/reconcile`, {
      amountMinor: '1000',
      statementReference: `fixture-${randomUUID()}`,
    });
  });
  test('السائق: سباق قبول واحد، موقع مؤقت، ومستحق مشتق من الدفتر', async () => {
    for (const c of [doctor, stranger])
      await expectJson(c, 'driver/vehicle', {
        plate: 'TEST-ONLY',
        description: 'مركبة اختبار مجهزة',
        city: 'بغداد',
        expiresOn: '2027-12-31',
        available: true,
      });
    rideId = (
      await expectJson(owner, 'sandbox/rides', {
        petId,
        city: 'بغداد',
        originLabel: 'عنوان بداية اختبار خاص',
        destinationLabel: 'عنوان نهاية اختبار خاص',
        originLat: 33.3,
        originLng: 44.3,
        destinationLat: 33.31,
        destinationLng: 44.31,
        idempotencyKey: randomUUID(),
        policyAccepted: true,
      })
    ).id;
    const requests = await (await get(doctor, 'driver/home')).json();
    const pub = requests.requests.find((r: { id: string }) => r.id === rideId);
    expect(pub.origin_lat).toBeUndefined();
    const r = await Promise.all([
      send(doctor, `rides/${rideId}/claim`),
      send(stranger, `rides/${rideId}/claim`),
    ]);
    expect(r.map((x) => x.status()).sort()).toEqual([201, 409]);
    const driver = r[0]!.status() === 201 ? doctor : stranger,
      loser = driver === doctor ? stranger : doctor;
    expect((await get(loser, `rides/${rideId}/location`)).status()).toBe(404);
    await expectJson(driver, `rides/${rideId}/location`, {
      lat: 33.3,
      lng: 44.3,
      shared: true,
    });
    expect(
      (await (await get(owner, `rides/${rideId}/location`)).json()).lat,
    ).toBe('33.300000');
    for (const status of [
      'driver_en_route',
      'arrived',
      'in_transit',
      'completed',
    ])
      await expectJson(driver, `rides/${rideId}/transition`, { status });
    expect((await get(owner, `rides/${rideId}/location`)).status()).toBe(404);
    const home = await (await get(driver, 'driver/home')).json();
    expect(BigInt(home.walletMinor) > 0n).toBe(true);
    expect(
      (
        await send(driver, `rides/${rideId}/transition`, {
          status: 'completed',
        })
      ).status(),
    ).toBe(409);
  });
  test('العامل والإشعارات والمحتوى العام تعمل ببيانات محفوظة', async () => {
    await expect
      .poll(
        async () =>
          (await (await get(owner, 'me/notifications')).json()).length,
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);
    await expectJson(manager, 'admin/content/test-policy', {
      title: 'سياسة اختبار منشورة',
      body: 'صفحة محتوى محلية لا تمثل سياسة قانونية نهائية.',
      published: true,
      version: 0,
    });
    expect((await get(owner, 'content/pages/test-policy')).status()).toBe(200);
    expect(
      (
        await send(owner, 'admin/content/evil', {
          title: 'رفض',
          body: 'نص لا ينشر',
          published: true,
          version: 0,
        })
      ).status(),
    ).toBe(403);
  });
  test('حفظ السلة والمفضلة والتقييم الموثق وإلغاء الخدمات يعيد الأثر مرة واحدة', async () => {
    await expectJson(owner, 'me/cart', {
      items: [{ productId: productA, quantity: 1 }],
    });
    expect((await (await get(owner, 'me/cart')).json())[0].quantity).toBe(1);
    expect(await (await get(other, 'me/cart')).json()).toEqual([]);
    await expectJson(owner, `products/${productA}/wishlist`, { enabled: true });
    expect(await (await get(owner, 'me/wishlist')).json()).toContain(productA);
    expect(
      (
        await send(other, `products/${productA}/reviews`, {
          orderLineId: lineA,
          rating: 5,
          body: 'محاولة غير مخولة',
        })
      ).status(),
    ).toBe(403);
    await expectJson(owner, `products/${productA}/reviews`, {
      orderLineId: lineA,
      rating: 5,
      body: 'مراجعة شراء اختبارية موثقة',
    });
    expect(
      (
        await send(owner, `products/${productA}/reviews`, {
          orderLineId: lineA,
          rating: 5,
          body: 'تقييم مكرر',
        })
      ).status(),
    ).toBe(409);
    const plan = await expectJson(
      manager,
      `clinics/${fixture.clinicId}/care-plans`,
      {
        serviceId,
        name: 'باقة غير مستخدمة للاختبار',
        priceMinor: '100000000',
        uses: 1,
        validDays: 30,
      },
    );
    const subscription = await expectJson(owner, 'sandbox/subscriptions', {
      planId: plan.id,
      petId,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await send(manager, 'admin/sandbox/payouts', {
          kind: 'clinic',
          partyId: fixture.clinicId,
          amountMinor: '150000000',
        })
      ).status(),
    ).toBe(409);
    await expectJson(owner, `sandbox/subscriptions/${subscription.id}/cancel`);
    expect(
      (
        await send(owner, `sandbox/subscriptions/${subscription.id}/cancel`)
      ).status(),
    ).toBe(409);
    const unit = await expectJson(
      manager,
      `clinics/${fixture.clinicId}/boarding-units`,
      { name: 'غرفة إلغاء اختبارية', species: 'cat', nightPrice: '2000' },
    );
    const booking = await expectJson(owner, 'sandbox/boarding', {
      unitId: unit.id,
      petId,
      startsOn: '2027-05-01',
      endsOn: '2027-05-02',
      idempotencyKey: randomUUID(),
    });
    await expectJson(owner, `sandbox/boarding/${booking.id}/cancel`);
    expect(
      (await send(owner, `sandbox/boarding/${booking.id}/cancel`)).status(),
    ).toBe(409);
    const pending = await expectJson(manager, 'admin/sandbox/payouts', {
      kind: 'clinic',
      partyId: fixture.clinicId,
      amountMinor: '100',
    });
    await expectJson(manager, `admin/sandbox/payouts/${pending.id}/cancel`);
    expect(
      (await send(other, `admin/sandbox/payouts/${pending.id}/pay`)).status(),
    ).toBe(409);
    await expectJson(owner, 'me/cart', { items: [] });
  });
  test('المطابقة المصرفية ترفض قيد عيادة أخرى وتحفظ مرجع السطر', async () => {
    const bank = await expectJson(
      manager,
      `clinics/${fixture.clinicId}/finance/banks`,
      { name: 'مصرف fixture', reference: 'TEST-ACCOUNT' },
    );
    await expectJson(
      doctor,
      `clinics/${fixture.clinicId}/finance/banks/${bank.id}/import`,
      {
        lines: [
          {
            reference: 'statement-1000',
            bookedOn: new Date().toISOString().slice(0, 10),
            amountMinor: '1000',
          },
        ],
      },
    );
    const data = await (
      await get(manager, `clinics/${fixture.clinicId}/finance/banks`)
    ).json();
    const statement = data.lines.find(
      (l: { reference: string }) => l.reference === 'statement-1000',
    );
    const own = data.journalLines.find(
      (l: { debit: string }) => l.debit === '1000',
    );
    expect(own).toBeTruthy();
    const foreign = (
      await db.query(
        'SELECT l.id FROM journal_lines l JOIN ledger_entities e ON e.id=l.entity_id WHERE e.clinic_id=$1 LIMIT 1',
        [fixture.clinicB],
      )
    ).rows[0];
    expect(
      (
        await send(
          manager,
          `clinics/${fixture.clinicId}/finance/banks/lines/${statement.id}/match`,
          { journalLineId: foreign.id },
        )
      ).status(),
    ).toBe(404);
    await expectJson(
      manager,
      `clinics/${fixture.clinicId}/finance/banks/lines/${statement.id}/match`,
      { journalLineId: own.id },
    );
    expect(
      (
        await send(
          manager,
          `clinics/${fixture.clinicId}/finance/banks/lines/${statement.id}/match`,
          { journalLineId: own.id },
        )
      ).status(),
    ).toBe(404);
  });
  test('فشل العامل لا يغير الحدث؛ dead letter ثم إعادة تشغيل دون تكرار', async () => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO outbox_messages(event_id,aggregate_id,aggregate_version,event_type,payload,attempts) VALUES($1,$2,1,'FailureFixture',$3,4)",
      [id, randomUUID(), { actorId: randomUUID() }],
    );
    await expect
      .poll(
        async () =>
          (
            await db.query(
              'SELECT failed_at IS NOT NULL failed FROM outbox_messages WHERE event_id=$1',
              [id],
            )
          ).rows[0].failed,
        { timeout: 10000 },
      )
      .toBe(true);
    await db.query('UPDATE outbox_messages SET payload=$2 WHERE event_id=$1', [
      id,
      { actorId: fixture.accounts.owner.id },
    ]);
    await expectJson(manager, `admin/jobs/${id}/retry`);
    await expect
      .poll(
        async () =>
          (
            await db.query(
              'SELECT count(*)::int n FROM notifications WHERE event_id=$1',
              [id],
            )
          ).rows[0].n,
        { timeout: 10000 },
      )
      .toBe(1);
  });
  test('خط أساس حمل محلي وفحص 120 منتجًا وقياسات متصفح', async ({
    browser,
  }) => {
    test.setTimeout(60000);
    for (let i = 0; i < 120; i++)
      await db.query(
        'INSERT INTO products(clinic_id,sku,name,description,price_minor,cost_minor) VALUES($1,$2,$3,$4,1000,500)',
        [
          fixture.clinicId,
          `LOAD-${randomUUID()}`,
          `منتج قياس ${i}`,
          'fixture load only',
        ],
      );
    const timings = await Promise.all(
      Array.from({ length: 40 }, async () => {
        const start = performance.now();
        const r = await get(owner, 'marketplace');
        expect(r.status()).toBe(200);
        return performance.now() - start;
      }),
    );
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
    expect(p95).toBeLessThan(3000);
    const ctx = await browser.newContext();
    await cookies(ctx, 'owner');
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const metrics = { lcp: 0, cls: 0 };
      (window as Window & { petraMetrics: typeof metrics }).petraMetrics =
        metrics;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) metrics.lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const v = e as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!v.hadRecentInput) metrics.cls += v.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/marketplace');
    await expect
      .poll(() => page.locator('.market-card').count())
      .toBeGreaterThanOrEqual(120);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const start = performance.now();
    await page.getByRole('searchbox').fill('منتج قياس 119');
    await expect(page.locator('.market-card')).toHaveCount(1);
    const interactionMs = performance.now() - start;
    const metrics = await page.evaluate(
      () =>
        (window as Window & { petraMetrics: { lcp: number; cls: number } })
          .petraMetrics,
    );
    expect(metrics.cls).toBeLessThan(0.1);
    expect(interactionMs).toBeLessThan(1500);
    writeFileSync(
      'docs/evidence/performance-baseline.json',
      JSON.stringify(
        {
          environment: 'local Chromium, synthetic',
          fieldWebVitals: false,
          requests: 40,
          concurrency: 40,
          catalogP95Ms: p95,
          productCount: 120,
          searchInteractionMs: interactionMs,
          lcpMs: metrics.lcp,
          cls: metrics.cls,
        },
        null,
        2,
      ) + '\n',
    );
    await ctx.close();
  });
  test('نسخة PostgreSQL والوسائط تسترجع إلى قاعدة مستقلة مع تطابق البصمات', async () => {
    test.setTimeout(90000);
    const result = execFileSync(
      process.execPath,
      ['scripts/verify-backup.mjs'],
      { env: process.env, stdio: 'pipe', timeout: 80000 },
    ).toString();
    expect(JSON.parse(result).status).toBe('verified');
  });
  test('واجهات جميع الأقسام تحفظ وتعرض وتتجاوب وتسمح بلوحة المفاتيح', async ({
    browser,
  }) => {
    test.setTimeout(90000);
    const context = await browser.newContext();
    await cookies(context, 'owner');
    const page = await context.newPage();
    for (const route of [
      '/marketplace',
      '/services',
      '/social',
      '/adoption',
      '/taxi',
      '/notifications',
    ]) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route,
        ).toBe(true);
      }
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
        route,
      ).toEqual([]);
      await page.screenshot({
        path: `docs/evidence/platform-${route.slice(1)}-1440.png`,
        fullPage: true,
      });
    }
    await page.goto('/marketplace');
    await page.getByLabel(/كمية منتج اختبار A-/).fill('1.5');
    await expect(page.getByLabel(/كمية منتج اختبار A-/)).toHaveValue('1');
    await page
      .getByRole('button', { name: 'معاينة السعر النهائي', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'السعر النهائي', exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('عنوان التسليم الخاص')
      .fill('عنوان تسليم حُفظ من الواجهة للاختبار');
    await page.getByLabel('عنوان التسليم الخاص').press('Tab');
    await expect(
      page.getByRole('button', { name: 'حجز الطلب الاختباري', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'تحصيل اختباري', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'تحصيل اختباري', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'تحصيل اختباري', exact: true }),
    ).toHaveCount(0);
    await page.goto('/social');
    await page
      .getByRole('textbox', { name: 'نبذة', exact: true })
      .fill('نبذة حُفظت من الواجهة');
    await page.getByRole('button', { name: 'حفظ الملف الاجتماعي' }).click();
    await page.reload();
    await expect(
      page.getByRole('textbox', { name: 'نبذة', exact: true }),
    ).toHaveValue('نبذة حُفظت من الواجهة');
    const adminContext = await browser.newContext();
    await cookies(adminContext, 'manager');
    const ap = await adminContext.newPage();
    for (const route of [
      `/clinic/${fixture.clinicId}/commerce`,
      `/clinic/${fixture.clinicId}/finance`,
      `/clinic/${fixture.clinicId}/services`,
      '/admin/operations',
      '/admin/finance',
    ]) {
      await ap.goto(route);
      await expect(ap.locator('h1')).toBeVisible();
      for (const width of [320, 390, 1440]) {
        await ap.setViewportSize({ width, height: 1000 });
        expect(
          await ap.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route,
        ).toBe(true);
      }
      expect(
        (
          await new AxeBuilder({ page: ap })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
        route,
      ).toEqual([]);
      await ap.screenshot({
        path: `docs/evidence/platform-${route.startsWith('/clinic/') ? 'clinic' : 'admin'}-${route.split('/').pop()}-1440.png`,
        fullPage: true,
      });
    }
    const keyboardJournal = await expectJson(
      doctor,
      `clinics/${fixture.clinicId}/finance/journals`,
      {
        idempotencyKey: randomUUID(),
        description: 'قيد اعتماد من لوحة المفاتيح',
        date: new Date().toISOString().slice(0, 10),
        lines: [
          { account: '1000', debit: '1', credit: '0' },
          { account: '3000', debit: '0', credit: '1' },
        ],
      },
    );
    await ap.goto(`/clinic/${fixture.clinicId}/finance`);
    const approvalRow = ap
      .locator('.care-list-row')
      .filter({ hasText: 'قيد اعتماد من لوحة المفاتيح' });
    await approvalRow
      .getByRole('button', { name: 'اعتماد وتنفيذ اختباري', exact: true })
      .focus();
    await ap.keyboard.press('Enter');
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT status FROM journals WHERE id=$1', [
              keyboardJournal.id,
            ])
          ).rows[0].status,
      )
      .toBe('posted');
    const driverContext = await browser.newContext();
    await cookies(driverContext, 'doctor');
    const dp = await driverContext.newPage();
    await dp.goto('/driver');
    await expect(dp.getByRole('heading', { level: 1 })).toHaveText(
      'رحلاتك ومستحقاتك',
    );
    await dp.screenshot({
      path: 'docs/evidence/platform-driver-1440.png',
      fullPage: true,
    });
    await context.close();
    await adminContext.close();
    await driverContext.close();
  });
});
