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
    accounts: Record<string, { id: string; email: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext;
let pet: string,
  pet2: string,
  foreignPet: string,
  dog: string,
  service: string,
  offer: string;
const future = (m: number) => new Date(Date.now() + m * 60000).toISOString();
const draft = {
  complaint: 'زيارة منزلية اصطناعية للاختبار',
  subjective: '',
  objective: '',
  assessment: 'تقييم fixture',
  plan: 'متابعة fixture',
  prescriptions: [],
  vaccines: [],
  labs: [],
  followUps: [],
};
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
const terms = (extra: Record<string, unknown> = {}) => ({
  branchId: f.branchId,
  serviceId: service,
  doctorId: f.accounts.doctor!.id,
  name: 'زيارة منزلية اختبارية',
  description: 'خدمة اصطناعية لاختبار الرحلة فقط',
  city: 'بغداد',
  district: 'المنصور',
  species: ['cat'],
  serviceMinor: '10001',
  travelMinor: '5000',
  travelMinutes: 30,
  ...extra,
});
const input = (slotId: string, extra: Record<string, unknown> = {}) => ({
  slotId,
  petId: pet,
  priceMinor: '15001',
  contactName: 'مستقبِل اصطناعي',
  phone: '07700000000',
  addressLine: 'عنوان خاص اصطناعي لاختبار الزيارة',
  notes: 'ملاحظات وصول اصطناعية',
  addressConsent: true,
  medicalConsent: true,
  areaConfirmed: true,
  idempotencyKey: randomUUID(),
  ...extra,
});
const slot = (m: number, id = offer) =>
  post(manager, `clinics/${f.clinicId}/home-visits/slots`, {
    offerId: id,
    startsAt: future(m),
  });
async function details(id: string, c = owner) {
  const r = await c.get(root + `home-visits/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
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
test.describe
  .serial('زيارة منزلية طبية وخصوصية العنوان والإشغال والتسوية', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-home-${randomUUID()}.json`;
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
    const pets: string[] = [];
    for (const [c, name, species] of [
      [owner, 'حيوان زيارة منزلية أول', 'cat'],
      [owner, 'حيوان زيارة منزلية ثان', 'cat'],
      [other, 'حيوان مالك آخر', 'cat'],
      [owner, 'كلب غير مؤهل', 'dog'],
    ] as const)
      pets.push((await post(c, 'pets', { name, species, sex: 'unknown' })).id);
    [pet, pet2, foreignPet, dog] = pets as [string, string, string, string];
    service = (
      await post(manager, `clinics/${f.clinicId}/services`, {
        name: 'خدمة منزلية للاختبار',
        durationMinutes: 30,
        bufferMinutes: 10,
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
  test('عروض ومواعيد بنطاق العيادة والفرع والطبيب المعتمد وبشروط ثابتة', async () => {
    const path = `clinics/${f.clinicId}/home-visits/offers`;
    await bad(owner, path, terms(), 403);
    await bad(other, path, terms(), 403);
    await bad(manager, path, terms({ branchId: f.branchB }), 404);
    await bad(manager, path, terms({ doctorId: f.accounts.other!.id }), 403);
    const roomService = (
      await post(manager, `clinics/${f.clinicId}/services`, {
        name: 'خدمة تحتاج غرفة',
        durationMinutes: 30,
        requiresResource: true,
      })
    ).id;
    await bad(manager, path, terms({ serviceId: roomService }), 404);
    await bad(
      manager,
      path,
      terms({ serviceMinor: '0', travelMinor: '0' }),
      400,
    );
    offer = (await post(manager, path, terms())).id;
    await expect(
      db.query(
        'UPDATE home_visit_offers SET service_minor=1,version=version+1 WHERE id=$1',
        [offer],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await post(manager, `${path}/${offer}/availability`, {
      version: 1,
      active: false,
    });
    await bad(
      manager,
      `clinics/${f.clinicId}/home-visits/slots`,
      { offerId: offer, startsAt: future(60) },
      404,
    );
    await post(manager, `${path}/${offer}/availability`, {
      version: 2,
      active: true,
    });
    await bad(
      manager,
      `clinics/${f.clinicId}/home-visits/slots`,
      { offerId: offer, startsAt: future(2) },
      400,
    );
    await bad(
      stranger,
      `clinics/${f.clinicId}/home-visits/slots`,
      { offerId: offer, startsAt: future(60) },
      403,
    );
    const a = await slot(500);
    const r = await post(manager, `clinics/${f.clinicId}/home-visits/slots`, {
      offerId: offer,
      startsAt: (
        await db.query('SELECT starts_at FROM appointment_slots WHERE id=$1', [
          a.id,
        ])
      ).rows[0].starts_at.toISOString(),
    });
    expect(r.id).toBe(a.id);
    expect(
      (await (await owner.get(root + 'care/slots')).json()).some(
        (s: { id: string }) => s.id === a.id,
      ),
    ).toBe(false);
    await bad(owner, 'appointments', {
      slotId: a.id,
      petId: pet,
      idempotencyKey: randomUUID(),
    });
  });
  test('سعر وموافقات وملكية ثم سباق حجز واحد وعنوان لا ينتقل إلى القوائم العامة', async () => {
    const sl = await slot(700),
      i = input(sl.id);
    await bad(
      owner,
      'sandbox/home-visits',
      { ...i, addressConsent: false },
      400,
    );
    await bad(
      owner,
      'sandbox/home-visits',
      { ...i, medicalConsent: false },
      400,
    );
    await bad(owner, 'sandbox/home-visits', { ...i, priceMinor: '1' });
    await bad(owner, 'sandbox/home-visits', { ...i, petId: foreignPet }, 404);
    await bad(owner, 'sandbox/home-visits', { ...i, petId: dog });
    const [a, b] = await Promise.all([
      post(owner, 'sandbox/home-visits', i),
      post(owner, 'sandbox/home-visits', i),
    ]);
    expect(a.id).toBe(b.id);
    await bad(owner, 'sandbox/home-visits', input(sl.id, { petId: pet2 }));
    await bad(owner, 'sandbox/home-visits', {
      ...i,
      addressLine: 'عنوان مختلف لنفس المفتاح',
    });
    const h = await details(a.id);
    expect(h).toMatchObject({
      total_minor: '15001',
      address_line: i.addressLine,
      status: 'confirmed',
      can_execute: true,
    });
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`home:${h.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
    const catalog = await (
      await owner.get(root + 'home-visits/catalog')
    ).json();
    expect(JSON.stringify(catalog)).not.toContain(i.addressLine);
    const doctorRows = await (
      await doctor.get(root + 'doctor/appointments')
    ).json();
    expect(JSON.stringify(doctorRows)).not.toContain(i.addressLine);
    const audit = await db.query(
      'SELECT details::text data FROM audit_events WHERE details::text LIKE $1',
      [`%${h.id}%`],
    );
    expect(JSON.stringify(audit.rows)).not.toContain(i.addressLine);
    const events = await db.query(
      'SELECT payload::text FROM outbox_messages WHERE aggregate_id=ANY($1::uuid[])',
      [[h.id, h.appointment_id]],
    );
    expect(JSON.stringify(events.rows)).not.toContain(i.addressLine);
    expect((await other.get(root + `home-visits/${h.id}`)).status()).toBe(403);
    expect((await stranger.get(root + `home-visits/${h.id}`)).status()).toBe(
      404,
    );
    expect((await details(h.id, doctor)).address_line).toBe(i.addressLine);
    expect((await details(h.id, manager)).address_line).toBe(i.addressLine);
    await bad(owner, `appointments/${h.appointment_id}/cancel`);
    await expect(
      db.query(
        "UPDATE appointments SET status='cancelled',version=version+1 WHERE id=$1",
        [h.appointment_id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await post(owner, `sandbox/home-visits/${h.id}/cancel`);
    await post(owner, `sandbox/home-visits/${h.id}/cancel`);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`home-cancel:${h.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  test('وقت الانتقال يمنع تداخل العيادة قبل وبعد المنزل، ويحمي الإجازة والحيوان', async () => {
    const home = await slot(1000);
    const at = (
      await db.query('SELECT starts_at FROM appointment_slots WHERE id=$1', [
        home.id,
      ])
    ).rows[0].starts_at.getTime();
    const clinical = await post(doctor, `clinics/${f.clinicId}/slots`, {
      serviceId: service,
      branchId: f.branchId,
      startsAt: new Date(at - 50 * 60000).toISOString(),
    });
    const old = await post(owner, 'appointments', {
      petId: pet2,
      slotId: clinical.id,
      idempotencyKey: randomUUID(),
    });
    await bad(owner, 'sandbox/home-visits', input(home.id));
    await post(owner, `appointments/${old.id}/cancel`);
    const h = await post(owner, 'sandbox/home-visits', input(home.id));
    const after = await post(doctor, `clinics/${f.clinicId}/slots`, {
      serviceId: service,
      branchId: f.branchId,
      startsAt: new Date(at + 45 * 60000).toISOString(),
    });
    await bad(owner, 'appointments', {
      petId: pet2,
      slotId: after.id,
      idempotencyKey: randomUUID(),
    });
    await bad(doctor, `doctor/clinics/${f.clinicId}/time-off`, {
      startsAt: new Date(at - 20 * 60000).toISOString(),
      endsAt: new Date(at - 5 * 60000).toISOString(),
      reason: 'إجازة تتداخل مع الانتقال',
    });
    const otherOffer = (
      await post(
        manager,
        `clinics/${f.clinicId}/home-visits/offers`,
        terms({ doctorId: f.accounts.stranger!.id }),
      )
    ).id;
    const otherSlot = await slot(1000, otherOffer);
    await bad(owner, 'sandbox/home-visits', input(otherSlot.id));
    await post(owner, `sandbox/home-visits/${h.id}/cancel`);
    const off = await post(doctor, `doctor/clinics/${f.clinicId}/time-off`, {
      startsAt: new Date(at - 20 * 60000).toISOString(),
      endsAt: new Date(at - 5 * 60000).toISOString(),
      reason: 'إجازة انتقال اصطناعية',
    });
    expect(
      (await (await owner.get(root + 'home-visits/catalog')).json()).slots.some(
        (s: { id: string }) => s.id === home.id,
      ),
    ).toBe(false);
    expect(
      (
        await doctor.delete(root + `clinics/${f.clinicId}/time-off/${off.id}`)
      ).status(),
    ).toBe(200);
  });
  test('سحب الموافقة أو نقل الملكية يحجب العنوان ويوقف التنفيذ مع مسار رد للمدير', async () => {
    const h = (
      await post(owner, 'sandbox/home-visits', input((await slot(1300)).id))
    ).id;
    await owner.delete(
      root + `pets/${pet}/consents/${f.clinicId}/${f.accounts.doctor!.id}`,
    );
    expect((await details(h, manager)).address_line).toBeNull();
    await bad(
      doctor,
      `home-visits/${h}/dispatch`,
      { version: 1, state: 'en_route' },
      403,
    );
    await post(manager, `sandbox/home-visits/${h}/cancel`);
    const p = (
      await post(owner, 'pets', {
        name: 'حيوان نقل زيارة منزلية',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
    const transferred = (
      await post(
        owner,
        'sandbox/home-visits',
        input((await slot(1500)).id, { petId: p }),
      )
    ).id;
    await db.query(
      'UPDATE pets SET owner_id=$2,version=version+1 WHERE id=$1',
      [p, f.accounts.other!.id],
    );
    expect(
      (await owner.get(root + `home-visits/${transferred}`)).status(),
    ).toBe(404);
    expect((await details(transferred, manager)).address_line).toBeNull();
    await bad(doctor, `home-visits/${transferred}/dispatch`, {
      version: 1,
      state: 'en_route',
    });
    await post(manager, `sandbox/home-visits/${transferred}/cancel`);
  });
  test('الإرسال والحضور والتوقيع الطبي فقط يتممان الإيراد مرة واحدة', async () => {
    const h = (
        await post(owner, 'sandbox/home-visits', input((await slot(20)).id))
      ).id,
      b = await details(h);
    await bad(
      manager,
      `home-visits/${h}/dispatch`,
      { version: 1, state: 'en_route' },
      403,
    );
    await bad(doctor, `home-visits/${h}/dispatch`, {
      version: 1,
      state: 'arrived',
    });
    await bad(doctor, `appointments/${b.appointment_id}/encounter`, {
      version: 0,
      content: draft,
    });
    await post(doctor, `home-visits/${h}/dispatch`, {
      version: 1,
      state: 'en_route',
    });
    await post(doctor, `home-visits/${h}/dispatch`, {
      version: 1,
      state: 'en_route',
    });
    await post(doctor, `home-visits/${h}/dispatch`, {
      version: 2,
      state: 'arrived',
    });
    await db.query(
      "UPDATE appointments SET starts_at=clock_timestamp()-interval '1 minute',ends_at=clock_timestamp()+interval '29 minutes' WHERE id=$1",
      [b.appointment_id],
    );
    let a = (
      await db.query('SELECT version FROM appointments WHERE id=$1', [
        b.appointment_id,
      ])
    ).rows[0];
    await bad(doctor, `appointments/${b.appointment_id}/attendance`, {
      state: 'no_show',
      version: a.version,
    });
    a = await post(doctor, `appointments/${b.appointment_id}/attendance`, {
      state: 'checked_in',
      version: a.version,
    });
    await post(doctor, `appointments/${b.appointment_id}/attendance`, {
      state: 'in_progress',
      version: a.version,
    });
    const e = await post(doctor, `appointments/${b.appointment_id}/encounter`, {
      version: 0,
      content: draft,
    });
    await bad(owner, `sandbox/home-visits/${h}/cancel`);
    await post(doctor, `encounters/${e.id}/sign`, { version: 1 });
    await bad(doctor, `encounters/${e.id}/sign`, { version: 1 });
    expect((await details(h)).status).toBe('completed');
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`home-complete:${h}`],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "SELECT sum(l.credit)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE j.source_key=$1 AND l.account_code='4100'",
          [`home-complete:${h}`],
        )
      ).rows[0].amount,
    ).toBe('15001');
    await expect(
      db.query(
        'UPDATE home_visit_bookings SET address_line=$2,version=version+1 WHERE id=$1',
        [h, 'تغيير محظور'],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('DELETE FROM home_visit_events WHERE booking_id=$1', [h]),
    ).rejects.toMatchObject({ code: '23514' });
    const plan = await post(manager, `clinics/${f.clinicId}/care-plans`, {
      serviceId: service,
      name: 'باقة لا تغطي المنزل المدفوع',
      priceMinor: '10000',
      uses: 1,
      validDays: 30,
    });
    const s = await post(owner, 'sandbox/subscriptions', {
      planId: plan.id,
      petId: pet,
      idempotencyKey: randomUUID(),
    });
    await bad(doctor, `subscriptions/${s.id}/redeem`, { encounterId: e.id });
  });
  test('إخفاء العرض أو سحب اعتماد الطبيب يمنع الجديد دون كشف خاص لغير المخول', async () => {
    const sl = await slot(1700);
    await post(
      manager,
      `clinics/${f.clinicId}/home-visits/offers/${offer}/availability`,
      { version: 3, active: false },
    );
    await bad(owner, 'sandbox/home-visits', input(sl.id));
    await post(
      manager,
      `clinics/${f.clinicId}/home-visits/offers/${offer}/availability`,
      { version: 4, active: true },
    );
    await db.query(
      "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1 AND kind='doctor'",
      [f.accounts.doctor!.id],
    );
    expect(
      (
        await (await owner.get(root + 'home-visits/catalog')).json()
      ).offers.some((o: { id: string }) => o.id === offer),
    ).toBe(false);
    await bad(owner, 'sandbox/home-visits', input(sl.id), 403);
    await db.query(
      "UPDATE professional_profiles SET status='verified' WHERE user_id=$1 AND kind='doctor'",
      [f.accounts.doctor!.id],
    );
    await db.query(
      "UPDATE clinic_memberships SET capabilities=ARRAY['clinic_accountant'] WHERE user_id=$1 AND clinic_id=$2",
      [f.accounts.stranger!.id, f.clinicId],
    );
    expect(
      (await stranger.get(root + `clinics/${f.clinicId}/home-visits`)).status(),
    ).toBe(403);
  });
  test('العيادة تنشر والمالك يحجز ويطبع إيصالاً خاصاً من الهاتف', async ({
    browser,
  }) => {
    const mc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(mc, 'manager');
    const mp = await mc.newPage();
    await mp.goto(origin + `/clinic/${f.clinicId}/home-visits`);
    const form = mp
      .getByRole('button', { name: 'نشر عرض الزيارة المنزلية', exact: true })
      .locator('..');
    await form
      .getByLabel('اسم العرض', { exact: true })
      .fill('زيارة منزلية للهاتف');
    await form
      .getByLabel('وصف الزيارة', { exact: true })
      .fill('عرض اصطناعي لاختبار الواجهة');
    await form
      .getByRole('combobox', { name: 'الفرع المسؤول' })
      .selectOption(f.branchId);
    await form
      .getByRole('combobox', { name: 'الخدمة الطبية المنزلية' })
      .selectOption(service);
    await form
      .getByRole('combobox', { name: 'الطبيب المسند' })
      .selectOption(f.accounts.doctor!.id);
    await form.getByLabel('مدينة المنطقة', { exact: true }).fill('بغداد');
    await form.getByLabel('الحي المشمول', { exact: true }).fill('المنصور');
    await form.getByLabel('قط', { exact: true }).check();
    await form
      .getByLabel('سعر الخدمة بوحدات IQD الصغرى', { exact: true })
      .fill('12000');
    await form
      .getByLabel('رسوم الانتقال بوحدات IQD الصغرى', { exact: true })
      .fill('3000');
    await form
      .getByRole('button', { name: 'نشر عرض الزيارة المنزلية', exact: true })
      .click();
    const publish = mp
      .getByRole('button', { name: 'نشر وقت زيارة منزلية للهاتف', exact: true })
      .locator('..');
    const t = new Date(Date.now() + 70 * 60000 + 3 * 3600000)
      .toISOString()
      .slice(0, 16);
    await publish
      .getByLabel('وقت الزيارة بتوقيت بغداد', { exact: true })
      .fill(t);
    await publish
      .getByRole('button', { name: 'نشر وقت زيارة منزلية للهاتف', exact: true })
      .click();
    await expect(publish.locator('..').getByRole('status')).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page: mp })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await mc.close();
    const oc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(oc, 'owner');
    const op = await oc.newPage();
    await op.goto(origin + '/home-visits');
    const card = op.getByRole('article').filter({
      has: op.getByRole('heading', {
        name: 'زيارة منزلية للهاتف',
        exact: true,
      }),
    });
    await card
      .getByRole('combobox', { name: 'الحيوان للزيارة المنزلية' })
      .selectOption(pet);
    const slots = card.getByRole('combobox', { name: 'موعد الزيارة المنزلية' });
    await slots.selectOption({ index: 1 });
    await card
      .getByLabel('اسم المستقبِل', { exact: true })
      .fill('مستقبل هاتف اصطناعي');
    await card.getByLabel('هاتف التواصل', { exact: true }).fill('07700000000');
    await card
      .getByLabel('العنوان الخاص للزيارة', { exact: true })
      .fill('عنوان هاتف خاص اصطناعي للمنصور');
    for (const checkbox of await card.locator('input[type=checkbox]').all())
      await checkbox.check();
    await card
      .getByRole('button', { name: 'حجز زيارة منزلية اختبارية', exact: true })
      .click();
    const booked = op.getByRole('article').filter({
      has: op.getByRole('heading', {
        name: 'زيارة منزلية للهاتف · حيوان زيارة منزلية أول',
        exact: true,
      }),
    });
    await expect(
      booked.getByText('العنوان الخاص: عنوان هاتف خاص اصطناعي للمنصور', {
        exact: true,
      }),
    ).toBeVisible();
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
    await booked.screenshot({
      path: 'docs/evidence/home-visit-booking-390.png',
    });
    await booked
      .getByRole('link', { name: 'عرض إيصال الزيارة وطباعته' })
      .click();
    await expect(op.getByRole('heading', { level: 1 })).toHaveText(
      'إيصال زيارة منزلية اختباري',
    );
    const pdf = await op.pdf();
    expect(pdf.byteLength).toBeGreaterThan(1000);
    await oc.close();
    const dc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await cookies(dc, 'doctor');
    const dp = await dc.newPage();
    await dp.goto(origin + `/clinic/${f.clinicId}/home-visits`);
    const dispatchCard = dp.getByRole('article').filter({
      has: dp.getByRole('heading', {
        name: 'زيارة منزلية للهاتف · حيوان زيارة منزلية أول',
        exact: true,
      }),
    });
    await dispatchCard
      .getByRole('button', { name: 'تأكيد الانطلاق للزيارة', exact: true })
      .click();
    await expect(
      dispatchCard.getByText('الطبيب في الطريق', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page: dp })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await dispatchCard.screenshot({
      path: 'docs/evidence/home-visit-dispatch-390.png',
    });
    await dc.close();
  });
});
