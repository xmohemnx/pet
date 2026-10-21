import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100',
  backend = 'http://127.0.0.1:4100/api/v1/';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let owner: APIRequestContext,
  other: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext,
  manager: APIRequestContext;
let fixture: {
  accounts: Record<string, { id: string; email: string; cookie: string }>;
  clinicId: string;
  branchId: string;
};
let petId: string,
  otherPet: string,
  serviceId: string,
  slotId: string,
  appointmentId: string,
  encounterId: string;
const input = {
  name: 'لوزة الرعاية',
  species: 'cat',
  sex: 'female',
  allergies: 'حساسية اختبار خصوصية فقط',
};
const content = {
  complaint: 'زيارة اختبار محلية',
  subjective: 'بيانات اصطناعية',
  objective: 'لا فحص حقيقي',
  assessment: 'توثيق اختبار فقط',
  plan: 'متابعة اختبار',
  prescriptions: [],
  vaccines: [
    {
      name: 'لقاح اختبار غير حقيقي',
      administeredOn: new Date().toISOString().slice(0, 10),
      batch: 'TEST-ONLY',
      nextDueOn: null,
    },
  ],
  labs: [{ test: 'فحص fixture', status: 'requested', result: '' }],
  followUps: [
    {
      title: 'متابعة اختبار الطبيب',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ],
};
async function post(c: APIRequestContext, path: string, data: unknown) {
  return c.post(`${backend}${path}`, { data });
}
async function get(c: APIRequestContext, path: string) {
  return c.get(`${backend}${path}`);
}
async function consent() {
  expect(
    (
      await post(owner, `pets/${petId}/consents`, {
        clinicId: fixture.clinicId,
        doctorId: fixture.accounts.doctor.id,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    ).status(),
  ).toBe(201);
}
async function publish(minutes: number, as = doctor) {
  const r = await post(as, `clinics/${fixture.clinicId}/slots`, {
    serviceId,
    branchId: fixture.branchId,
    startsAt: new Date(Date.now() + minutes * 60000).toISOString(),
  });
  expect(r.status()).toBe(201);
  return (await r.json()).id as string;
}
test.describe.serial('الرعاية الحقيقية: الخصوصية والحجز والزيارة', () => {
  test.beforeAll(async () => {
    const path = `/tmp/petra-care-fixture-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-care-test.mjs', path], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(path, 'utf8'));
    } finally {
      rmSync(path, { force: true });
    }
    const contexts = await Promise.all(
      ['owner', 'other', 'doctor', 'stranger', 'manager'].map((role) =>
        playwrightRequest.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    [owner, other, doctor, stranger, manager] = contexts;
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      other?.dispose(),
      doctor?.dispose(),
      stranger?.dispose(),
      manager?.dispose(),
    ]);
    await db.end();
  });
  test('الحيوان محفوظ، مع منع الاطلاع والتعديل العابر وتضارب النسخة', async () => {
    const r = await post(owner, 'pets', input);
    expect(r.status()).toBe(201);
    petId = (await r.json()).id;
    otherPet = (
      await (
        await post(other, 'pets', { ...input, name: 'حيوان المالك الآخر' })
      ).json()
    ).id;
    expect((await get(other, `pets/${petId}`)).status()).toBe(404);
    expect((await get(manager, `pets/${petId}`)).status()).toBe(404);
    expect(
      (
        await get(stranger, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await other.patch(`${backend}pets/${petId}`, {
          data: { pet: input, version: 1 },
        })
      ).status(),
    ).toBe(404);
    const detail = await (await get(owner, `pets/${petId}`)).json();
    expect(detail.pet.allergies).toBe(input.allergies);
    expect(
      (
        await owner.patch(`${backend}pets/${petId}`, {
          data: { pet: { ...input, breed: 'اختبار' }, version: 1 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await owner.patch(`${backend}pets/${petId}`, {
          data: { pet: input, version: 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await post(owner, 'pets', {
          ...input,
          owner_id: fixture.accounts.other.id,
        })
      ).status(),
    ).toBe(400);
  });
  test('الوصاية محدودة وقابلة للإلغاء؛ صلاحية الملف وحدها لا تكشف السجل', async () => {
    expect(
      (
        await post(owner, `pets/${petId}/guardians`, {
          email: fixture.accounts.other.email,
          scopes: ['profile'],
        })
      ).status(),
    ).toBe(201);
    const d = await (await get(other, `pets/${petId}`)).json();
    expect(d.pet.allergies).toBeUndefined();
    expect(d.encounters).toEqual([]);
    expect(d.tasks).toEqual([]);
    expect(
      (
        await post(other, `pets/${petId}/guardians`, {
          email: fixture.accounts.manager.email,
          scopes: ['profile'],
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(other, `pets/${petId}/consents`, {
          clinicId: fixture.clinicId,
          doctorId: fixture.accounts.doctor.id,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.delete(
          `${backend}pets/${petId}/guardians/${fixture.accounts.other.id}`,
        )
      ).status(),
    ).toBe(200);
    expect((await get(other, `pets/${petId}`)).status()).toBe(404);
  });
  test('الخدمات والأوقات بصلاحيات العيادة والطبيب المعتمد', async () => {
    expect(
      (
        await post(owner, `clinics/${fixture.clinicId}/services`, {
          name: 'كشف',
          durationMinutes: 30,
        })
      ).status(),
    ).toBe(403);
    const s = await post(manager, `clinics/${fixture.clinicId}/services`, {
      name: 'كشف الاختبار',
      durationMinutes: 30,
    });
    expect(s.status()).toBe(201);
    serviceId = (await s.json()).id;
    expect(
      (
        await post(owner, `clinics/${fixture.clinicId}/slots`, {
          serviceId,
          branchId: fixture.branchId,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).status(),
    ).toBe(403);
    slotId = await publish(60);
    const slots = await (await get(owner, 'care/slots')).json();
    expect(slots.some((s: { id: string }) => s.id === slotId)).toBe(true);
    await consent();
    // Consent alone is not a treatment relationship.
    expect(
      (
        await get(doctor, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
  });
  test('حجز متزامن يفوز به طلب واحد، وإعادة المحاولة لا تكرر الأثر', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      post(owner, 'appointments', { petId, slotId, idempotencyKey: key }),
      post(other, 'appointments', {
        petId: otherPet,
        slotId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    const winner = results[0]!.status() === 201 ? owner : other;
    // Keep the care journey on the owner pet regardless of which race request wins.
    if (winner === other) {
      const a = await results[1]!.json();
      expect(
        (await post(other, `appointments/${a.id}/cancel`, {})).status(),
      ).toBe(201);
      slotId = await publish(120);
      appointmentId = (
        await (
          await post(owner, 'appointments', {
            petId,
            slotId,
            idempotencyKey: randomUUID(),
          })
        ).json()
      ).id;
    } else {
      appointmentId = (await results[0]!.json()).id;
      const retry = await post(owner, 'appointments', {
        petId,
        slotId,
        idempotencyKey: key,
      });
      expect((await retry.json()).id).toBe(appointmentId);
      expect(
        (
          await post(owner, 'appointments', {
            petId: otherPet,
            slotId,
            idempotencyKey: key,
          })
        ).status(),
      ).toBe(404);
    }
    const count = await db.query(
      "SELECT count(*)::int n FROM outbox_messages WHERE aggregate_id=$1 AND event_type='AppointmentConfirmed'",
      [appointmentId],
    );
    expect(count.rows[0].n).toBe(1);
    const overlap = await publish(
      Number(
        (
          await db.query(
            'SELECT extract(epoch FROM(starts_at-now()))/60 minutes FROM appointments WHERE id=$1',
            [appointmentId],
          )
        ).rows[0].minutes,
      ) + 5,
    );
    expect(
      (await (await get(owner, 'care/slots')).json()).some(
        (s: { id: string }) => s.id === overlap,
      ),
    ).toBe(false);
    expect(
      (
        await post(other, 'appointments', {
          petId: otherPet,
          slotId: overlap,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
  });
  test('إعادة المحاولة المتزامنة تعيد الحجز نفسه، وتداخل الحيوان مرفوض عبر طبيبين', async () => {
    const sl = await publish(600),
      key = randomUUID();
    const payload = { petId, slotId: sl, idempotencyKey: key };
    const r = await Promise.all([
      post(owner, 'appointments', payload),
      post(owner, 'appointments', payload),
    ]);
    expect(r.map((x) => x.status())).toEqual([201, 201]);
    const [first, second] = await Promise.all(r.map((x) => x.json()));
    expect(first.id).toBe(second.id);
    const ownPet = (
      await (await post(owner, 'pets', { ...input, name: 'ملف آخر' })).json()
    ).id;
    expect(
      (
        await post(owner, 'appointments', { ...payload, petId: ownPet })
      ).status(),
    ).toBe(409);
    const otherDoctor = await publish(605, stranger);
    expect(
      (
        await post(owner, 'appointments', {
          petId,
          slotId: otherDoctor,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    const strangerPet = (
      await (
        await post(stranger, 'pets', { ...input, name: 'حيوان الطبيب الآخر' })
      ).json()
    ).id;
    expect(
      (
        await post(stranger, 'appointments', {
          petId: strangerPet,
          slotId: otherDoctor,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(201);
    expect(
      (await post(owner, `appointments/${first.id}/cancel`, {})).status(),
    ).toBe(201);
    const retry = await (await post(owner, 'appointments', payload)).json();
    expect(retry.id).toBe(first.id);
    expect(retry.status).toBe('cancelled');
  });
  test('الموافقة والانتساب يفحصان لكل طلب، والمسودة لا يراها المالك', async () => {
    expect(
      (
        await get(doctor, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(200);
    expect(
      (
        await get(stranger, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await get(manager, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(owner, `appointments/${appointmentId}/encounter`, {
          content,
          version: 0,
        })
      ).status(),
    ).toBe(404);
    const e = await post(doctor, `appointments/${appointmentId}/encounter`, {
      content,
      version: 0,
    });
    expect(e.status()).toBe(201);
    encounterId = (await e.json()).id;
    expect(
      (await (await get(owner, `pets/${petId}`)).json()).encounters,
    ).toEqual([]);
    expect(
      (
        await post(doctor, `encounters/${encounterId}/sign`, { version: 1 })
      ).status(),
    ).toBe(409);
    await owner.delete(
      `${backend}pets/${petId}/consents/${fixture.clinicId}/${fixture.accounts.doctor.id}`,
    );
    expect(
      (
        await get(doctor, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(doctor, `encounters/${encounterId}/sign`, { version: 1 })
      ).status(),
    ).toBe(403);
    await consent();
    await db.query(
      "UPDATE medical_consents SET expires_at=now()-interval '1 minute' WHERE pet_id=$1",
      [petId],
    );
    expect(
      (
        await get(doctor, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
    await consent();
    await db.query(
      "UPDATE doctor_affiliations SET status='revoked' WHERE doctor_id=$1 AND clinic_id=$2",
      [fixture.accounts.doctor.id, fixture.clinicId],
    );
    expect(
      (
        await get(doctor, `pets/${petId}?clinicId=${fixture.clinicId}`)
      ).status(),
    ).toBe(403);
    await db.query(
      "UPDATE doctor_affiliations SET status='approved' WHERE doctor_id=$1 AND clinic_id=$2",
      [fixture.accounts.doctor.id, fixture.clinicId],
    );
  });
  test('التوقيع ذري، الأصل محمي والإضافة مستقلة والمتابعة محفوظة', async () => {
    // Advance this isolated fixture's appointment, never the application clock.
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '1 hour',ends_at=now()-interval '30 minutes' WHERE id=$1",
      [appointmentId],
    );
    const results = await Promise.all([
      post(doctor, `encounters/${encounterId}/sign`, { version: 1 }),
      post(doctor, `encounters/${encounterId}/sign`, { version: 1 }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    const d = await (await get(owner, `pets/${petId}`)).json();
    expect(d.encounters).toHaveLength(1);
    expect(d.tasks).toHaveLength(1);
    expect(
      d.appointments.find((a: { id: string }) => a.id === appointmentId).status,
    ).toBe('completed');
    expect(d.encounters[0].content.vaccines[0].batch).toBe('TEST-ONLY');
    const labId = d.encounters[0].lab_orders[0].id;
    expect(d.encounters[0].lab_orders[0].status).toBe('requested');
    expect(
      (
        await post(owner, `encounters/${encounterId}/labs/${labId}/review`, {
          result: 'denied',
        })
      ).status(),
    ).toBe(404);
    const reviews = await Promise.all([
      post(doctor, `encounters/${encounterId}/labs/${labId}/review`, {
        result: 'نتيجة اختبار راجعها الطبيب',
      }),
      post(doctor, `encounters/${encounterId}/labs/${labId}/review`, {
        result: 'تكرار',
      }),
    ]);
    expect(reviews.map((r) => r.status()).sort()).toEqual([201, 409]);
    await expect(
      db.query("UPDATE medical_lab_orders SET result='overwrite' WHERE id=$1", [
        labId,
      ]),
    ).rejects.toThrow('immutable');
    expect(
      (await (await get(owner, `pets/${petId}`)).json()).encounters[0].content
        .labs[0].status,
    ).toBe('requested');
    expect(
      (await (await get(owner, `pets/${petId}`)).json()).encounters[0]
        .lab_orders[0].status,
    ).toBe('reviewed');

    expect(
      (
        await post(doctor, `appointments/${appointmentId}/encounter`, {
          content: { ...content, plan: 'attempted overwrite' },
          version: 2,
        })
      ).status(),
    ).toBe(409);
    await expect(
      db.query("UPDATE encounters SET content='{}' WHERE id=$1", [encounterId]),
    ).rejects.toThrow('immutable');
    await expect(
      db.query('DELETE FROM encounters WHERE id=$1', [encounterId]),
    ).rejects.toThrow('immutable');
    const add = await post(doctor, `encounters/${encounterId}/addenda`, {
      note: 'تصحيح اختبار يحفظ الأصل',
    });
    expect(add.status()).toBe(201);
    const addId = (await add.json()).id;
    await expect(
      db.query("UPDATE encounter_addenda SET note='changed' WHERE id=$1", [
        addId,
      ]),
    ).rejects.toThrow('immutable');
    const after = await (await get(owner, `pets/${petId}`)).json();
    expect(after.encounters[0].content.plan).toBe(content.plan);
    expect(after.encounters[0].addenda).toHaveLength(1);
    const resolved = await post(owner, `care/tasks/${d.tasks[0].id}/resolve`, {
      status: 'completed',
    });
    expect(resolved.status()).toBe(201);
    expect(
      (
        await post(owner, `care/tasks/${d.tasks[0].id}/resolve`, {
          status: 'skipped',
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await db.query(
          "SELECT 1 FROM audit_events WHERE action='medical.record_read' AND actor_id=$1 AND details->>'petId'=$2",
          [fixture.accounts.doctor.id, petId],
        )
      ).rowCount,
    ).toBeGreaterThan(0);
  });
  test('رحلة الواجهة: إضافة حيوان وحجز وموافقة وطبيب يوقع ثم متابعة المالك', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext(),
      doctorContext = await browser.newContext();
    for (const [ctx, role] of [
      [ownerContext, 'owner'],
      [doctorContext, 'doctor'],
    ] as const) {
      await ctx.addCookies(
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
    const page = await ownerContext.newPage(),
      dp = await doctorContext.newPage();
    await page.goto('/care');
    await page
      .getByRole('button', { name: 'إضافة حيوان', exact: true })
      .click();
    await page.getByLabel('اسم الحيوان', { exact: true }).fill('سماسم الواجهة');
    await page
      .getByRole('button', { name: 'إضافة الحيوان', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'سماسم الواجهة', exact: true }),
    ).toBeVisible();
    const uiPet = page.url().split('/').pop()!;
    const uiSlot = await publish(240);
    await page.reload();
    await page.getByText('حجز موعد جديد', { exact: true }).click();
    await page.getByLabel('الموعد (توقيت بغداد)').selectOption(uiSlot);
    await page
      .getByRole('button', { name: 'تأكيد الحجز', exact: true })
      .click();
    await expect(page.getByText('مؤكد', { exact: true })).toBeVisible();
    await page
      .getByLabel('أوافق على مشاركة الملف الطبي مع الطبيب المحدد.')
      .check();
    await page
      .getByRole('button', { name: 'منح الموافقة', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'سحب الموافقة', exact: true }),
    ).toBeVisible();
    const a = (
      await db.query('SELECT id FROM appointments WHERE pet_id=$1', [uiPet])
    ).rows[0];
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '2 hours',ends_at=now()-interval '90 minutes' WHERE id=$1",
      [a.id],
    );
    await dp.goto('/doctor');
    const row = dp.locator('.care-list-row').filter({
      has: dp.getByRole('heading', {
        name: 'سماسم الواجهة · كشف الاختبار',
        exact: true,
      }),
    });
    await row.getByRole('button', { name: 'فتح ملف الزيارة' }).click();
    await dp
      .getByLabel('سبب الزيارة', { exact: true })
      .fill('فحص واجهة اصطناعي');
    await dp
      .getByLabel('التقييم الطبي (A)', { exact: true })
      .fill('تقييم fixture فقط');
    await dp.getByLabel('الخطة (P)', { exact: true }).fill('خطة اختبار');
    await dp.getByRole('button', { name: 'إضافة متابعة', exact: true }).click();
    await dp
      .getByLabel('عنوان المتابعة 1', { exact: true })
      .fill('متابعة من الواجهة');
    await dp
      .getByLabel('وقت المتابعة بتوقيت بغداد 1', { exact: true })
      .fill('2027-01-10T12:00');
    await dp
      .getByRole('button', { name: 'حفظ مسودة الزيارة', exact: true })
      .click();
    await expect(
      dp.getByRole('button', { name: 'توقيع الزيارة وإنهاء الموعد' }),
    ).toBeVisible();
    await dp
      .getByLabel('راجعت المسودة المحفوظة وأوافق على توقيعها باسمي.')
      .check();
    await dp
      .getByRole('button', { name: 'توقيع الزيارة وإنهاء الموعد' })
      .click();
    await expect(
      dp.getByRole('button', { name: 'توقيع الإضافة', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('متابعة من الواجهة', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('فحص واجهة اصطناعي', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'تمت المهمة', exact: true }).click();
    await page.reload();
    await expect(
      page.getByText('مكتمل · حددها الطبيب', { exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await dp.setViewportSize({ width, height: 1000 });
      expect(
        await dp.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: dp }).analyze()).violations).toEqual(
      [],
    );
    await page.screenshot({
      path: 'docs/evidence/pet-care-phase02.png',
      fullPage: true,
    });
    await dp.screenshot({
      path: 'docs/evidence/doctor-visit-phase02.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: 'docs/evidence/pet-care-390-phase02.png',
      fullPage: true,
    });
    await ownerContext.close();
    await doctorContext.close();
  });
  test('سحب الموافقة يمنع إضافة بعد التوقيع، والأرشفة لا تدمر الزيارات', async () => {
    expect(
      (
        await post(owner, `pets/${petId}/guardians`, {
          email: fixture.accounts.other.email,
          scopes: ['profile', 'medical', 'booking'],
        })
      ).status(),
    ).toBe(201);
    const shared = await (await get(other, `pets/${petId}`)).json();
    expect(shared.encounters).toHaveLength(1);
    expect(shared.encounters[0].lab_orders[0].status).toBe('reviewed');
    const guardianSlot = await publish(720);
    const guardianBooking = await post(other, 'appointments', {
      petId,
      slotId: guardianSlot,
      idempotencyKey: randomUUID(),
    });
    expect(guardianBooking.status()).toBe(201);
    const ga = await guardianBooking.json();
    await owner.delete(
      `${backend}pets/${petId}/guardians/${fixture.accounts.other.id}`,
    );
    expect((await get(other, `pets/${petId}`)).status()).toBe(404);
    expect(
      (await post(other, `appointments/${ga.id}/cancel`, {})).status(),
    ).toBe(404);
    expect(
      (await post(owner, `appointments/${ga.id}/cancel`, {})).status(),
    ).toBe(201);

    await owner.delete(
      `${backend}pets/${petId}/consents/${fixture.clinicId}/${fixture.accounts.doctor.id}`,
    );
    expect(
      (
        await post(doctor, `encounters/${encounterId}/addenda`, {
          note: 'should fail',
        })
      ).status(),
    ).toBe(403);
    expect((await owner.delete(`${backend}pets/${petId}`)).status()).toBe(200);
    const d = await (await get(owner, `pets/${petId}`)).json();
    expect(d.pet.archived_at).not.toBeNull();
    expect(d.encounters).toHaveLength(1);
    const sl = await publish(480);
    expect(
      (
        await post(owner, 'appointments', {
          petId,
          slotId: sl,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
  });
});
