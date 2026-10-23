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
    accounts: Record<string, { id: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext,
  accountant: APIRequestContext,
  today: string,
  uiPet: string,
  uiBooking: string;
const day = (n = 0) =>
  new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
const base = (id: string) => `clinics/${f.clinicId}/boarding/${id}`;
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function bad(
  c: APIRequestContext,
  path: string,
  data: unknown = {},
  status = 409,
) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
}
async function detail(id: string, c = owner) {
  const r = await c.get(root + `boarding/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function pet(c = owner, name = 'حيوان إقامة اصطناعي') {
  return (await post(c, 'pets', { name, species: 'cat', sex: 'unknown' }))
    .id as string;
}
const terms = (extra: Record<string, unknown> = {}) => ({
  name: `وحدة اختبار ${randomUUID().slice(0, 8)}`,
  species: 'cat',
  nightPrice: '5000',
  maxWeightGrams: 6000,
  vaccinesRequired: true,
  healthRequirements: 'تدقيق لقاح ووثائق صحية اصطناعية',
  ...extra,
});
async function unit(extra: Record<string, unknown> = {}) {
  return (
    await post(manager, `clinics/${f.clinicId}/boarding-units`, terms(extra))
  ).id as string;
}
async function booking(extra: Record<string, unknown> = {}, c = owner) {
  return post(c, 'sandbox/boarding', {
    unitId: await unit(),
    petId: await pet(c),
    startsOn: day(),
    endsOn: day(2),
    policyAccepted: true,
    idempotencyKey: randomUUID(),
    ...extra,
  });
}
async function review(id: string, extra: Record<string, unknown> = {}) {
  const d = await detail(id);
  return post(doctor, `${base(id)}/reviews`, {
    version: d.booking.version,
    decision: 'approved',
    weightGrams: 5000,
    vaccinesChecked: true,
    validThrough: d.booking.ends_on,
    notes: 'مراجعة صحية خاصة اصطناعية للطبيب والمالك',
    idempotencyKey: randomUUID(),
    ...extra,
  });
}
async function transition(id: string, status: string) {
  return post(manager, `${base(id)}/transition`, {
    status,
    version: (await detail(id)).booking.version,
  });
}
async function cookies(c: BrowserContext, role: string) {
  await c.addCookies(
    f.accounts[role]!.cookie.split('; ').map((x) => {
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
test.describe.serial('الإقامة: قبول طبي وسعة وحوادث وخصوصية وتسوية', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-boarding-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, manager, doctor, stranger, accountant] = await Promise.all(
      ['owner', 'other', 'manager', 'doctor', 'stranger', 'accountant'].map(
        (role) =>
          factory.newContext({
            extraHTTPHeaders: {
              Origin: origin,
              Cookie: f.accounts[role]!.cookie,
            },
          }),
      ),
    );
    today = (
      await db.query(
        "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Baghdad')::date::text d",
      )
    ).rows[0].d;
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      other?.dispose(),
      manager?.dispose(),
      doctor?.dispose(),
      stranger?.dispose(),
      accountant?.dispose(),
    ]);
    await db.end();
  });
  test('الوحدة بشروط ثابتة وإتاحة بإصدار ولا تعديل من المشتري أو عيادة أخرى', async () => {
    await bad(owner, `clinics/${f.clinicId}/boarding-units`, terms(), 403);
    await bad(other, `clinics/${f.clinicId}/boarding-units`, terms(), 403);
    await bad(
      manager,
      `clinics/${f.clinicId}/boarding-units`,
      terms({ maxWeightGrams: 0 }),
      400,
    );
    const u = await unit();
    await expect(
      db.query(
        'UPDATE boarding_units SET night_price=1,version=version+1 WHERE id=$1',
        [u],
      ),
    ).rejects.toThrow();
    await expect(
      db.query('DELETE FROM boarding_units WHERE id=$1', [u]),
    ).rejects.toThrow();
    const p = `clinics/${f.clinicId}/boarding-units/${u}/availability`;
    await post(manager, p, { version: 1, active: false });
    await bad(manager, p, { version: 1, active: true });
    await bad(owner, p, { version: 2, active: true }, 403);
    const catalog = await (await owner.get(root + 'services/catalog')).json();
    expect(catalog.units.some((x: { id: string }) => x.id === u)).toBe(false);
    await post(manager, p, { version: 2, active: true });
  });
  test('موافقة المالك وسعر الخادم وسباق السعة للحيوان والوحدة مع إعادة طلب ثابتة', async () => {
    const u = await unit(),
      p = await pet(),
      i = {
        unitId: u,
        petId: p,
        startsOn: day(5),
        endsOn: day(7),
        policyAccepted: true,
        idempotencyKey: randomUUID(),
      };
    await bad(owner, 'sandbox/boarding', { ...i, policyAccepted: false }, 400);
    await bad(other, 'sandbox/boarding', i, 404);
    const both = await Promise.all([
      post(owner, 'sandbox/boarding', i),
      post(owner, 'sandbox/boarding', i),
    ]);
    expect(both[0].id).toBe(both[1].id);
    const b = (await detail(both[0].id)).booking;
    expect(b.total_minor).toBe('10000');
    expect(b.night_price).toBe('5000');
    await bad(owner, 'sandbox/boarding', { ...i, endsOn: day(8) });
    const u2 = await unit();
    await bad(owner, 'sandbox/boarding', {
      ...i,
      unitId: u2,
      idempotencyKey: randomUUID(),
    });
    const p2 = await pet(other);
    await bad(other, 'sandbox/boarding', {
      ...i,
      petId: p2,
      idempotencyKey: randomUUID(),
    });
    await bad(
      owner,
      'sandbox/boarding',
      {
        ...i,
        unitId: u2,
        startsOn: day(400),
        endsOn: day(401),
        idempotencyKey: randomUUID(),
      },
      400,
    );
    await expect(
      db.query(
        'UPDATE boarding_bookings SET total_minor=1,version=version+1 WHERE id=$1',
        [b.id],
      ),
    ).rejects.toThrow();
    await post(owner, `sandbox/boarding/${b.id}/cancel`);
    await post(owner, `sandbox/boarding/${b.id}/cancel`);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`boarding-cancel:${b.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
    await post(owner, 'sandbox/boarding', {
      ...i,
      unitId: u2,
      idempotencyKey: randomUUID(),
    });
  });
  test('المراجعة لطبيب مخول وتحقق الوزن واللقاح والصلاحية ومربع المتصفح لا يمنح الوصول', async () => {
    const b = await booking(),
      path = `${base(b.id)}/reviews`,
      i = {
        version: 1,
        decision: 'approved',
        weightGrams: 5000,
        vaccinesChecked: true,
        validThrough: day(2),
        notes: 'ملاحظة صحية خاصة باختبار القبول',
        idempotencyKey: randomUUID(),
      };
    await bad(manager, path, i, 403);
    await bad(other, `clinics/${f.clinicB}/boarding/${b.id}/reviews`, i, 404);
    await bad(manager, `${base(b.id)}/transition`, {
      version: 1,
      status: 'checked_in',
      healthReviewed: true,
    });
    await bad(doctor, path, { ...i, weightGrams: 7000 });
    await bad(doctor, path, { ...i, vaccinesChecked: false });
    await bad(doctor, path, { ...i, validThrough: day(1) });
    const rejected = await post(doctor, path, { ...i, decision: 'rejected' });
    await bad(manager, `${base(b.id)}/transition`, {
      version: 2,
      status: 'checked_in',
      healthReviewed: true,
    });
    await bad(doctor, path, { ...i, idempotencyKey: randomUUID() });
    const approved = { ...i, version: 2, idempotencyKey: randomUUID() };
    const r = await post(doctor, path, approved);
    expect(r.id).not.toBe(rejected.id);
    expect((await post(doctor, path, approved)).id).toBe(r.id);
    const op = await detail(b.id, manager);
    expect(
      op.reviews.every((x: { notes: string | null }) => x.notes === null),
    ).toBe(true);
    expect(
      (await detail(b.id)).reviews.some(
        (x: { notes: string }) => x.notes === i.notes,
      ),
    ).toBe(true);
    await expect(
      db.query('UPDATE boarding_admission_reviews SET notes=$2 WHERE id=$1', [
        r.id,
        'تغيير ممنوع',
      ]),
    ).rejects.toThrow();
    await transition(b.id, 'checked_in');
    await post(manager, `${base(b.id)}/transition`, {
      status: 'checked_in',
      version: 3,
    });
    await bad(owner, `sandbox/boarding/${b.id}/cancel`);
    const future = await booking({ startsOn: day(10), endsOn: day(12) });
    await review(future.id);
    await bad(manager, `${base(future.id)}/transition`, {
      status: 'checked_in',
      version: 2,
    });
  });
  test('الحضور الفعلي حصري حتى مع تواريخ عقدين لا تتداخل ولا إدراج حجز حاضر مباشرة', async () => {
    const room = await unit(),
      animal = await pet();
    const first = await booking({
      unitId: room,
      petId: animal,
      endsOn: day(1),
    });
    await review(first.id);
    await transition(first.id, 'checked_in');
    const next = await booking({
      unitId: room,
      petId: await pet(),
      startsOn: day(1),
      endsOn: day(2),
    });
    await review(next.id);
    const elsewhere = await booking({
      unitId: await unit(),
      petId: animal,
      startsOn: day(1),
      endsOn: day(2),
    });
    await review(elsewhere.id);
    for (const id of [next.id, elsewhere.id])
      await expect(
        db.query(
          "UPDATE boarding_bookings SET status='checked_in',checked_in_at=now(),version=version+1 WHERE id=$1",
          [id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.query(
        "INSERT INTO boarding_bookings(unit_id,pet_id,user_id,starts_on,ends_on,total_minor,idempotency_key,unit_name,pet_name,night_price,status,policy_accepted) SELECT unit_id,pet_id,user_id,starts_on+20,ends_on+20,total_minor,$2,unit_name,pet_name,night_price,'checked_in',true FROM boarding_bookings WHERE id=$1",
        [first.id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await transition(first.id, 'completed');
  });
  test('الحادث العاجل يمنع المغادرة وحله لطبيب والسجل ثابت والإيراد مرة واحدة', async () => {
    const b = await booking(),
      input = {
        kind: 'incident',
        severity: 'urgent',
        body: 'حادث تشغيلي خاص اصطناعي يحتاج تقييم الطبيب',
        idempotencyKey: randomUUID(),
      };
    await bad(manager, `${base(b.id)}/incidents`, input);
    await review(b.id);
    await transition(b.id, 'checked_in');
    const i = await post(manager, `${base(b.id)}/incidents`, input);
    expect((await post(manager, `${base(b.id)}/incidents`, input)).id).toBe(
      i.id,
    );
    await bad(manager, `${base(b.id)}/incidents`, {
      ...input,
      body: 'محتوى آخر بالمفتاح نفسه',
    });
    await bad(manager, `${base(b.id)}/transition`, {
      status: 'completed',
      version: (await detail(b.id)).booking.version,
    });
    await expect(
      db.query(
        "UPDATE boarding_bookings SET status='completed',checked_out_at=now(),version=version+1 WHERE id=$1",
        [b.id],
      ),
    ).rejects.toThrow();
    const resolution = {
      kind: 'resolution',
      severity: 'urgent',
      resolvesId: i.id,
      body: 'حل اصطناعي موثق من الطبيب بعد تقييم الواقعة',
      idempotencyKey: randomUUID(),
    };
    await bad(manager, `${base(b.id)}/incidents`, resolution, 403);
    await post(doctor, `${base(b.id)}/incidents`, resolution);
    await post(doctor, `${base(b.id)}/incidents`, resolution);
    await expect(
      db.query('DELETE FROM boarding_incident_log WHERE id=$1', [i.id]),
    ).rejects.toThrow();
    await transition(b.id, 'completed');
    await post(manager, `${base(b.id)}/transition`, {
      status: 'completed',
      version: 1,
    });
    expect((await detail(b.id)).booking.status).toBe('completed');
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`boarding-complete:${b.id}`],
        )
      ).rows[0].n,
    ).toBe(1);
    await bad(manager, `${base(b.id)}/incidents`, {
      ...input,
      idempotencyKey: randomUUID(),
    });
    const events = await db.query(
      'SELECT payload::text FROM outbox_messages WHERE aggregate_id=$1',
      [b.id],
    );
    expect(JSON.stringify(events.rows)).not.toContain(input.body);
    const actions = await db.query(
      'SELECT details::text FROM audit_events WHERE clinic_id=$1',
      [f.clinicId],
    );
    expect(JSON.stringify(actions.rows)).not.toContain(input.body);
  });
  test('نقل الملكية يحجب العقد عن المالكين ويمنع الوصول مع رد إداري محمي بالمستحق', async () => {
    const b = await booking();
    await review(b.id);
    const before = await detail(b.id);
    await db.query('UPDATE pets SET owner_id=$2 WHERE id=$1', [
      before.booking.pet_id,
      f.accounts.other!.id,
    ]);
    expect((await owner.get(root + `boarding/${b.id}`)).status()).toBe(404);
    expect((await other.get(root + `boarding/${b.id}`)).status()).toBe(403);
    const mine = await (await owner.get(root + 'me/services')).json();
    expect(mine.boarding.some((x: { id: string }) => x.id === b.id)).toBe(
      false,
    );
    await bad(owner, `sandbox/boarding/${b.id}/cancel`, {}, 404);
    await bad(manager, `${base(b.id)}/transition`, {
      status: 'checked_in',
      version: 2,
    });
    // Fault injection in the disposable E2E DB: an inconsistent imported hold must not permit an overdrawn refund.
    const hold = (
      await db.query(
        "INSERT INTO sandbox_payouts(kind,party_id,amount_minor,created_by) VALUES('clinic',$1,999999999999,$2) RETURNING id",
        [f.clinicId, f.accounts.manager!.id],
      )
    ).rows[0];
    try {
      await bad(manager, `${base(b.id)}/cancel`);
      expect(
        (
          await db.query(
            'SELECT count(*)::int n FROM journals WHERE source_key=$1',
            [`boarding-cancel:${b.id}`],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await post(manager, `admin/sandbox/payouts/${hold.id}/cancel`);
    }
    await post(manager, `${base(b.id)}/cancel`);
    await post(manager, `${base(b.id)}/cancel`);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`boarding-cancel:${b.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  test('سحب اعتماد المراجع يمنع الوصول والمحاسب لا يقرأ الحجوزات الصحية', async () => {
    const b = await booking();
    await review(b.id);
    await db.query(
      "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1 AND kind='doctor'",
      [f.accounts.doctor!.id],
    );
    try {
      await bad(
        manager,
        `${base(b.id)}/transition`,
        { status: 'checked_in', version: 2 },
        403,
      );
      expect((await doctor.get(root + `boarding/${b.id}`)).status()).toBe(403);
    } finally {
      await db.query(
        "UPDATE professional_profiles SET status='verified' WHERE user_id=$1 AND kind='doctor'",
        [f.accounts.doctor!.id],
      );
    }
    expect((await accountant.get(root + `boarding/${b.id}`)).status()).toBe(
      403,
    );
    expect(
      (await accountant.get(root + `clinics/${f.clinicId}/boarding`)).status(),
    ).toBe(403);
    const management = await accountant.get(
      root + `clinics/${f.clinicId}/services/management`,
    );
    expect(management.status()).toBe(200);
    expect((await management.json()).boarding).toEqual([]);
    await transition(b.id, 'checked_in');
  });
  test('واجهة العيادة تنشئ وحدة إقامة بشروط من الهاتف', async ({ browser }) => {
    uiPet = await pet(owner, 'حيوان رحلة الفندق بالهاتف');
    const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(c, 'manager');
    const page = await c.newPage();
    await page.goto(`${origin}/clinic/${f.clinicId}/boarding`);
    const form = page.locator('form').filter({
      has: page.getByRole('button', {
        name: 'حفظ وحدة الإقامة',
        exact: true,
      }),
    });
    await form.getByLabel('اسم الوحدة').fill('وحدة رحلة الفندق من الهاتف');
    await form.getByLabel('سعر الليلة بالوحدات الصغرى IQD').fill('7001');
    await form.getByLabel('الوزن الأقصى بالغرام، اختياري').fill('8000');
    await form.getByLabel('يلزم تدقيق وثائق اللقاح').check();
    await form
      .getByLabel('متطلبات صحية إضافية')
      .fill('وثائق لقاح ومراجعة قبول يدوية قبل الوصول');
    await form
      .getByRole('button', { name: 'حفظ وحدة الإقامة', exact: true })
      .click();
    await expect(form.getByRole('status')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await c.close();
  });
  test('المالك يحجز وحدة الفندق من الهاتف ويتابع الإيصال الخاص', async ({
    browser,
  }) => {
    const o = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(o, 'owner');
    const p = await o.newPage();
    await p.goto(origin + '/services');
    const card = p.locator('article').filter({
      has: p.getByRole('heading', {
        name: 'وحدة رحلة الفندق من الهاتف',
        exact: true,
      }),
    });
    await card.getByLabel('الحيوان للإقامة').selectOption(uiPet);
    await card.getByLabel('الوصول', { exact: true }).fill(day());
    await card.getByLabel('المغادرة', { exact: true }).fill(day(2));
    await card.getByRole('checkbox').check();
    await card.getByRole('button', { name: 'تأكيد إقامة اختبارية' }).click();
    await expect(card.getByRole('status')).toBeVisible();
    const mine = await (await owner.get(root + 'me/services')).json();
    uiBooking = mine.boarding.find(
      (x: { pet_id: string }) => x.pet_id === uiPet,
    ).id;
    await p.goto(`${origin}/boarding/${uiBooking}`);
    await expect(
      p.getByRole('heading', { name: 'متابعة الإقامة والقبول' }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page: p }).analyze()).violations).toEqual(
      [],
    );
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync('docs/evidence', { recursive: true });
    await p
      .locator('.medical-passport')
      .screenshot({ path: 'docs/evidence/boarding-booking-390.png' });
    await o.close();
  });
  test('الطبيب يراجع القبول الصحي من الهاتف دون كشفه للاستقبال', async ({
    browser,
  }) => {
    const d = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(d, 'doctor');
    const page = await d.newPage();
    await page.goto(`${origin}/boarding/${uiBooking}`);
    await page.getByLabel('الوزن المراجع بالغرام').fill('6000');
    await page.getByLabel('راجعت وثائق اللقاح المطلوبة').check();
    await page
      .getByLabel('ملاحظة الطبيب')
      .fill('قبول خاص اصطناعي يظهر للطبيب والمالك فقط');
    await page
      .getByRole('button', { name: 'تسجيل مراجعة القبول', exact: true })
      .click();
    await expect(
      page.getByText('قبول الإقامة ·', { exact: false }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: 'مراجعات القبول', exact: true }),
      })
      .screenshot({ path: 'docs/evidence/boarding-admission-390.png' });
    await d.close();
  });
  test('الفريق يسجل حادثاً والطبيب يحله ثم يغادر الحيوان ويطبع الإيصال', async ({
    browser,
  }) => {
    const d = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(d, 'doctor');
    const page = await d.newPage();
    const m = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(m, 'manager');
    const p = await m.newPage();
    await p.goto(`${origin}/boarding/${uiBooking}`);
    await expect(
      p.getByText('قبول خاص اصطناعي يظهر للطبيب والمالك فقط'),
    ).toHaveCount(0);
    await p
      .getByRole('button', {
        name: 'تسجيل وصول الحيوان بعد المراجعة',
        exact: true,
      })
      .click();
    await expect(p.getByText('حاضر', { exact: true })).toBeVisible();
    const form = p.locator('form').filter({
      has: p.getByRole('button', { name: 'تسجيل حادث إقامة', exact: true }),
    });
    await form.getByLabel('درجة المتابعة').selectOption('urgent');
    await form
      .getByLabel('تفاصيل الحادث')
      .fill('متابعة عاجلة اصطناعية للطبيب أثناء الإقامة');
    await form.getByRole('button', { name: 'تسجيل حادث إقامة' }).click();
    await expect(
      p.getByRole('heading', { name: 'حادث · عاجل', exact: true }),
    ).toBeVisible();
    await p
      .getByRole('button', { name: 'تأكيد المغادرة وإتمام العقد', exact: true })
      .click();
    await expect(
      p
        .locator('form')
        .filter({
          has: p.getByRole('button', {
            name: 'تأكيد المغادرة وإتمام العقد',
            exact: true,
          }),
        })
        .getByRole('alert'),
    ).toContainText('عالج الحادث العاجل');
    await page.goto(`${origin}/boarding/${uiBooking}`);
    await page
      .getByLabel('تفاصيل الحل')
      .fill('تقييم وحل اصطناعي محفوظ من الطبيب');
    await page
      .getByRole('button', { name: 'توثيق حل الحادث', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'حل موثق · عاجل', exact: true }),
    ).toBeVisible();
    await p.reload();
    await p
      .getByRole('button', { name: 'تأكيد المغادرة وإتمام العقد', exact: true })
      .click();
    await expect(p.getByText('مكتمل', { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page: p }).analyze()).violations).toEqual(
      [],
    );
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await p
      .locator('section')
      .filter({
        has: p.getByRole('heading', {
          name: 'سجل الحوادث والمتابعة',
          exact: true,
        }),
      })
      .screenshot({ path: 'docs/evidence/boarding-incidents-390.png' });
    const pdf = await p.pdf();
    expect(pdf.byteLength).toBeGreaterThan(1000);
    await d.close();
    await m.close();
  });
});
