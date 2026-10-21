import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
  clinicId: string;
  branchId: string;
  accounts: Record<string, { id: string; cookie: string; email: string }>;
};
let owner: APIRequestContext,
  other: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext,
  manager: APIRequestContext;
let pet: string,
  otherPet: string,
  petB: string,
  service: string,
  room: string,
  roomB: string,
  rule: string,
  firstSlot: string,
  appointment: string,
  winningDoctor: APIRequestContext,
  requester: APIRequestContext,
  winningDoctorId: string;
const future = (days: number, hour = 6) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
async function get(c: APIRequestContext, path: string) {
  return c.get(root + path);
}
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  return c.post(root + path, { data });
}
async function create(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await post(c, path, data);
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function browserCookies(context: BrowserContext, role: string) {
  await context.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((c) => {
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
test.describe.serial('الرعاية المتبقية: دوام وغرف وحضور وQR وتقويم', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-planning-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-care-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, doctor, stranger, manager] = await Promise.all(
      ['owner', 'other', 'doctor', 'stranger', 'manager'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: fixture.accounts[role]!.cookie,
          },
        }),
      ),
    );
    pet = (
      await create(owner, 'pets', {
        name: 'لوز الدوام',
        species: 'cat',
        sex: 'female',
        allergies: 'MEDICAL-PRIVATE-CANARY',
        microchip: 'PRIVATE-CHIP-CANARY',
      })
    ).id;
    petB = (
      await create(owner, 'pets', {
        name: 'رفيق آخر',
        species: 'dog',
        sex: 'male',
      })
    ).id;
    otherPet = (
      await create(other, 'pets', {
        name: 'حيوان عائلة أخرى',
        species: 'cat',
        sex: 'unknown',
      })
    ).id;
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
  test('الخدمات والفاصل وغرف العلاج بنطاق عيادة وفرع، والدوام لا يقبل صلاحيات دخيلة', async () => {
    const resources = await create(
      manager,
      `clinics/${fixture.clinicId}/resources`,
      { branchId: fixture.branchId, name: 'غرفة الرعاية' },
    );
    room = resources[0].id;
    roomB = (
      await create(manager, `clinics/${fixture.clinicId}/resources`, {
        branchId: fixture.branchId,
        name: 'غرفة ثانية',
      })
    ).find((r: { id: string }) => r.id !== room).id;
    expect(
      (
        await post(owner, `clinics/${fixture.clinicId}/resources`, {
          branchId: fixture.branchId,
          name: 'غرفة دخيلة',
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(manager, `clinics/${fixture.clinicId}/resources`, {
          branchId: randomUUID(),
          name: 'فرع مزور',
        })
      ).status(),
    ).toBe(400);
    service = (
      await create(manager, `clinics/${fixture.clinicId}/services`, {
        name: 'فحص غرفة مع فاصل',
        durationMinutes: 30,
        bufferMinutes: 15,
        priceMinor: '25000500',
        requiresResource: true,
      })
    ).id;
    expect(
      (
        await post(doctor, `clinics/${fixture.clinicId}/slots`, {
          serviceId: service,
          branchId: fixture.branchId,
          startsAt: future(20),
        })
      ).status(),
    ).toBe(400);
    const day = new Date(Date.parse(future(8)) + 3 * 3600000).getUTCDay();
    const input = {
      branchId: fixture.branchId,
      serviceId: service,
      resourceId: room,
      weekday: day,
      startMinute: 540,
      endMinute: 720,
    };
    rule = (
      await create(
        doctor,
        `doctor/clinics/${fixture.clinicId}/working-hours`,
        input,
      )
    ).id;
    expect(
      (
        await post(
          owner,
          `doctor/clinics/${fixture.clinicId}/working-hours`,
          input,
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(doctor, `doctor/clinics/${fixture.clinicId}/working-hours`, {
          ...input,
          doctorId: fixture.accounts.stranger.id,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await stranger.delete(
          `${root}doctor/clinics/${fixture.clinicId}/working-hours/${rule}`,
        )
      ).status(),
    ).toBe(404);
  });
  test('الدوام يولد أوقات بغداد مرة واحدة والإجازة تلغي المتاح وتحظر إعادة حجزه', async () => {
    const span = {
      from: future(8).slice(0, 10),
      through: future(14).slice(0, 10),
    };
    expect(
      (
        await create(
          doctor,
          `doctor/clinics/${fixture.clinicId}/working-hours/${rule}/generate`,
          span,
        )
      ).created,
    ).toBe(4);
    expect(
      (
        await create(
          doctor,
          `doctor/clinics/${fixture.clinicId}/working-hours/${rule}/generate`,
          span,
        )
      ).created,
    ).toBe(0);
    const slots = (
      await db.query(
        'SELECT * FROM appointment_slots WHERE working_hours_id=$1 ORDER BY starts_at',
        [rule],
      )
    ).rows;
    firstSlot = slots[0].id;
    expect(new Date(slots[0].starts_at).getUTCHours()).toBe(6);
    const off = await create(
      doctor,
      `doctor/clinics/${fixture.clinicId}/time-off`,
      {
        startsAt: new Date(slots[0].starts_at).toISOString(),
        endsAt: new Date(
          new Date(slots[0].ends_at).getTime() + 15 * 60000,
        ).toISOString(),
        reason: 'إجازة تشغيل اختبار',
      },
    );
    expect(
      (
        await post(owner, 'appointments', {
          petId: pet,
          slotId: firstSlot,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await (
          await get(
            owner,
            `care/slots?doctorId=${fixture.accounts.doctor.id}&clinicId=${fixture.clinicId}`,
          )
        ).json()
      ).some((s: { id: string }) => s.id === firstSlot),
    ).toBe(false);
    expect(
      (
        await post(doctor, `clinics/${fixture.clinicId}/slots`, {
          serviceId: service,
          branchId: fixture.branchId,
          resourceId: room,
          startsAt: new Date(slots[0].starts_at).toISOString(),
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.delete(
          `${root}clinics/${fixture.clinicId}/time-off/${off.id}`,
        )
      ).status(),
    ).toBe(200);
  });
  test('سباق طبيبين على الغرفة يفوز مرة واحدة، وفاصل الطبيب والغرفة محفوظان في DB', async () => {
    const startsAt = future(20);
    const a = await create(doctor, `clinics/${fixture.clinicId}/slots`, {
      serviceId: service,
      branchId: fixture.branchId,
      resourceId: room,
      startsAt,
    });
    const b = await create(stranger, `clinics/${fixture.clinicId}/slots`, {
      serviceId: service,
      branchId: fixture.branchId,
      resourceId: room,
      startsAt,
    });
    const results = await Promise.all([
      post(owner, 'appointments', {
        petId: pet,
        slotId: a.id,
        idempotencyKey: randomUUID(),
      }),
      post(other, 'appointments', {
        petId: otherPet,
        slotId: b.id,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    const win = results[0]!.status() === 201 ? 0 : 1;
    const booked = await results[win]!.json();
    appointment = booked.id;
    winningDoctor = win === 0 ? doctor : stranger;
    requester = win === 0 ? owner : other;
    winningDoctorId =
      win === 0 ? fixture.accounts.doctor.id : fixture.accounts.stranger.id;
    expect(booked.service_price_minor).toBe('25000500');
    const overlap = await create(
      winningDoctor,
      `clinics/${fixture.clinicId}/slots`,
      {
        serviceId: service,
        branchId: fixture.branchId,
        resourceId: roomB,
        startsAt: new Date(Date.parse(startsAt) + 30 * 60000).toISOString(),
      },
    );
    expect(
      (
        await post(owner, 'appointments', {
          petId: petB,
          slotId: overlap.id,
          idempotencyKey: randomUUID(),
        })
      ).status(),
    ).toBe(409);
    const following = await create(
      winningDoctor,
      `clinics/${fixture.clinicId}/slots`,
      {
        serviceId: service,
        branchId: fixture.branchId,
        resourceId: room,
        startsAt: new Date(Date.parse(startsAt) + 45 * 60000).toISOString(),
      },
    );
    await create(owner, 'appointments', {
      petId: petB,
      slotId: following.id,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await post(manager, `clinics/${fixture.clinicId}/closures`, {
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 3600000).toISOString(),
          reason: 'إغلاق يتعارض مع الحجوزات',
        })
      ).status(),
    ).toBe(409);
    const row = (
      await db.query(
        'SELECT ends_at,occupied_until FROM appointments WHERE id=$1',
        [appointment],
      )
    ).rows[0];
    expect(
      new Date(row.occupied_until).getTime() - new Date(row.ends_at).getTime(),
    ).toBe(15 * 60000);
  });
  test('الحضور وبدء الزيارة للطبيب المسند، ومنع إلغاء زيارة بدأت أو غياب قبل نهاية الموعد', async () => {
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '5 minutes',ends_at=now()+interval '25 minutes' WHERE id=$1",
      [appointment],
    );
    expect(
      (
        await post(requester, `appointments/${appointment}/attendance`, {
          state: 'checked_in',
          version: 1,
        })
      ).status(),
    ).toBe(403);
    const checked = await create(
      manager,
      `appointments/${appointment}/attendance`,
      { state: 'checked_in', version: 1 },
    );
    expect(checked.version).toBe(2);
    expect(
      (
        await create(manager, `appointments/${appointment}/attendance`, {
          state: 'checked_in',
          version: 1,
        })
      ).version,
    ).toBe(2);
    expect(
      (
        await post(manager, `appointments/${appointment}/attendance`, {
          state: 'in_progress',
          version: 2,
        })
      ).status(),
    ).toBe(403);
    const progress = await create(
      winningDoctor,
      `appointments/${appointment}/attendance`,
      { state: 'in_progress', version: 2 },
    );
    expect(progress.attendance_state).toBe('in_progress');
    expect(
      (await post(requester, `appointments/${appointment}/cancel`)).status(),
    ).toBe(409);
    expect(
      (
        await post(manager, `appointments/${appointment}/attendance`, {
          state: 'no_show',
          version: 3,
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await db.query(
          'SELECT state FROM appointment_state_history WHERE appointment_id=$1 ORDER BY created_at',
          [appointment],
        )
      ).rows.map((r) => r.state),
    ).toEqual(['checked_in', 'in_progress']);
  });
  test('عدم الحضور محفوظ بعد النهاية ولا يفتح سجلًا طبيًا، والاستقبال لا يرى الملاحظات', async () => {
    const s = await create(doctor, `clinics/${fixture.clinicId}/slots`, {
      serviceId: service,
      branchId: fixture.branchId,
      resourceId: roomB,
      startsAt: future(22),
    });
    const a = await create(owner, 'appointments', {
      petId: pet,
      slotId: s.id,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await post(manager, `appointments/${a.id}/attendance`, {
          state: 'no_show',
          version: 1,
        })
      ).status(),
    ).toBe(409);
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '2 hours',ends_at=now()-interval '90 minutes' WHERE id=$1",
      [a.id],
    );
    expect(
      (
        await create(manager, `appointments/${a.id}/attendance`, {
          state: 'no_show',
          version: 1,
        })
      ).status,
    ).toBe('no_show');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Baghdad',
    }).format(new Date());
    const response = await get(
      manager,
      `clinics/${fixture.clinicId}/calendar?date=${today}`,
    );
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain('MEDICAL-PRIVATE-CANARY');
    expect(
      (
        await get(other, `clinics/${fixture.clinicId}/calendar?date=${today}`)
      ).status(),
    ).toBe(403);
  });
  test('بطاقة السلامة موافقة صريحة وحقول محدودة وtoken مخزن كهاش وقابل للإلغاء', async () => {
    const payload = {
      publishConsent: true,
      contactName: 'جهة سلامة اختبار',
      contactPhone: '+9647700000000',
      message: 'رقم اصطناعي للاختبار',
      expiresAt: future(30),
    };
    expect(
      (
        await post(owner, `pets/${pet}/safety-cards`, {
          ...payload,
          publishConsent: false,
        })
      ).status(),
    ).toBe(400);
    expect(
      (await post(other, `pets/${pet}/safety-cards`, payload)).status(),
    ).toBe(404);
    const card = await create(owner, `pets/${pet}/safety-cards`, payload);
    const stored = (
      await db.query('SELECT token_hash FROM pet_safety_cards WHERE id=$1', [
        card.id,
      ])
    ).rows[0].token_hash;
    expect(stored).toBe(createHash('sha256').update(card.token).digest('hex'));
    expect(stored).not.toBe(card.token);
    const anonymous = await factory.newContext();
    try {
      const r = await get(anonymous, `public/safety/${card.token}`);
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(Object.keys(body).sort()).toEqual([
        'contact_name',
        'contact_phone',
        'expires_at',
        'message',
        'pet_name',
        'species',
      ]);
      expect(JSON.stringify(body)).not.toContain('CANARY');
      expect(
        (
          await owner.delete(`${root}pets/${pet}/safety-cards/${card.id}`)
        ).status(),
      ).toBe(200);
      expect(
        (await get(anonymous, `public/safety/${card.token}`)).status(),
      ).toBe(404);
      const old = await create(owner, `pets/${petB}/safety-cards`, payload);
      await db.query('UPDATE pets SET owner_id=$2 WHERE id=$1', [
        petB,
        fixture.accounts.other.id,
      ]);
      expect(
        (await get(anonymous, `public/safety/${old.token}`)).status(),
      ).toBe(404);
      await db.query('UPDATE pets SET owner_id=$2 WHERE id=$1', [
        petB,
        fixture.accounts.owner.id,
      ]);
      expect(
        (await get(anonymous, `public/safety/${old.token}`)).status(),
      ).toBe(404);
    } finally {
      await anonymous.dispose();
    }
  });
  test('الدليل معتمد ولا يكشف بريدًا، والتقييم لزيارة مكتملة حقيقية فقط', async () => {
    for (const c of [doctor, stranger])
      await create(c, 'doctor/public-profile', {
        specialty: 'طب رعاية اختبار',
        bio: 'ملف مهني اصطناعي',
        languages: ['العربية'],
      });
    const rows = await (
      await get(owner, 'care/directory?specialty=طب%20رعاية%20اختبار')
    ).json();
    expect(rows.some((d: { id: string }) => d.id === winningDoctorId)).toBe(
      true,
    );
    expect(JSON.stringify(rows)).not.toContain(fixture.accounts.doctor.email);
    expect(
      (
        await post(requester, `appointments/${appointment}/review`, {
          rating: 5,
          body: 'تقييم قبل الإكمال غير مسموح',
        })
      ).status(),
    ).toBe(404);
    const a = (
      await db.query('SELECT pet_id FROM appointments WHERE id=$1', [
        appointment,
      ])
    ).rows[0];
    await create(requester, `pets/${a.pet_id}/consents`, {
      doctorId: winningDoctorId,
      clinicId: fixture.clinicId,
      expiresAt: future(10),
    });
    const e = await create(
      winningDoctor,
      `appointments/${appointment}/encounter`,
      {
        version: 0,
        content: {
          complaint: 'اختبار رعاية',
          subjective: '',
          objective: '',
          assessment: 'اختبار فقط',
          plan: 'متابعة اختبار',
          prescriptions: [],
          vaccines: [
            {
              name: 'لقاح اختبار غير حقيقي',
              administeredOn: new Date().toISOString().slice(0, 10),
              batch: 'TEST',
              nextDueOn: null,
            },
          ],
          labs: [],
          followUps: [],
        },
      },
    );
    await create(winningDoctor, `encounters/${e.id}/sign`, {
      version: e.version,
    });
    await create(requester, `appointments/${appointment}/review`, {
      rating: 5,
      body: 'تقييم زيارة اختبار مكتملة',
    });
    expect(
      (
        await post(requester, `appointments/${appointment}/review`, {
          rating: 5,
          body: 'تقييم مكرر',
        })
      ).status(),
    ).toBe(409);
    expect((await get(requester, `pets/${a.pet_id}/passport`)).status()).toBe(
      200,
    );
    expect((await get(manager, `pets/${a.pet_id}/passport`)).status()).toBe(
      404,
    );
  });
  test('التقويم يعزل الملاحظات والتذكير يؤجل أثناء عدم الإزعاج ولا يتكرر والمنتهي لا يحسم', async () => {
    const hour = (new Date().getUTCHours() + 3) % 24;
    await create(owner, 'me/notification-preferences', {
      inApp: true,
      quietStart: hour,
      quietEnd: (hour + 2) % 24,
    });
    const task = await create(owner, `pets/${pet}/tasks`, {
      title: 'متابعة شخصية اختبارية',
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await expect
      .poll(async () =>
        Number(
          (
            await db.query(
              'SELECT count(*) FROM deferred_notifications n JOIN outbox_messages o ON o.event_id=n.event_id JOIN care_reminder_dispatches d ON d.id=o.aggregate_id WHERE d.task_id=$1',
              [task.id],
            )
          ).rows[0].count,
        ),
      )
      .toBe(1);
    await create(owner, 'me/notification-preferences', {
      inApp: true,
      quietStart: null,
      quietEnd: null,
    });
    await expect
      .poll(async () =>
        Number(
          (
            await db.query(
              'SELECT count(*) FROM notifications n JOIN outbox_messages o ON o.event_id=n.event_id JOIN care_reminder_dispatches d ON d.id=o.aggregate_id WHERE d.task_id=$1',
              [task.id],
            )
          ).rows[0].count,
        ),
      )
      .toBe(1);
    const expired = await create(owner, `pets/${pet}/tasks`, {
      title: 'مهمة انتهت',
      dueAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    });
    expect(
      (
        await post(owner, `care/tasks/${expired.id}/resolve`, {
          status: 'completed',
        })
      ).status(),
    ).toBe(409);
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })
      .format(new Date())
      .slice(0, 7);
    const own = await (
      await get(owner, `me/care-calendar?month=${month}`)
    ).json();
    expect(
      own.tasks.some(
        (t: { id: string; status: string }) =>
          t.id === expired.id && t.status === 'expired',
      ),
    ).toBe(true);
    const denied = await (
      await get(other, `me/care-calendar?month=${month}`)
    ).json();
    expect(denied.tasks.some((t: { id: string }) => t.id === task.id)).toBe(
      false,
    );
  });
  test('الواجهات الجديدة RTL ووصولية وحفظ دوام وQR وطباعة PDF خاص', async ({
    browser,
  }) => {
    test.setTimeout(90000);
    mkdirSync('docs/evidence', { recursive: true });
    const contexts = await Promise.all(
      ['owner', 'doctor', 'manager'].map(async (role) => {
        const c = await browser.newContext();
        await browserCookies(c, role);
        return c;
      }),
    );
    try {
      const [op, dp, mp] = await Promise.all(contexts.map((c) => c.newPage()));
      const routes: [
        [typeof op, string],
        [typeof op, string],
        [typeof op, string],
        [typeof op, string],
      ] = [
        [op!, '/care/directory'],
        [op!, '/care/calendar'],
        [dp!, '/doctor/planning'],
        [mp!, `/clinic/${fixture.clinicId}/calendar`],
      ];
      for (const width of [320, 390, 1440])
        for (const [page, path] of routes) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(origin + path);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            path,
          ).toBe(true);
          if (width === 390) {
            expect(
              (
                await new AxeBuilder({ page })
                  .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                  .analyze()
              ).violations.map((v) => v.id),
            ).toEqual([]);
            await page.screenshot({
              path: `docs/evidence/care-${path.includes('planning') ? 'planning' : path.includes('clinic') ? 'reception' : path.endsWith('directory') ? 'directory' : 'calendar'}-390.png`,
              fullPage: true,
            });
          }
        }
      await dp!.getByLabel('التخصص المعلن').fill('اختبار الحفظ من الواجهة');
      await dp!
        .getByRole('button', { name: 'حفظ الملف المهني', exact: true })
        .click();
      await expect(dp!.getByRole('status')).toContainText('تم الحفظ');
      await dp!.reload();
      await expect(dp!.getByLabel('التخصص المعلن')).toHaveValue(
        'اختبار الحفظ من الواجهة',
      );
      await op!.goto(`${origin}/care/pets/${pet}/passport`);
      await expect(
        op!.getByRole('heading', { name: 'جواز الرعاية · لوز الدوام' }),
      ).toBeVisible();
      const pdf = await op!.pdf({ format: 'A4', printBackground: true });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.length).toBeGreaterThan(5000);
      await op!.goto(`${origin}/care/pets/${pet}`);
      const section = op!
        .getByRole('heading', { name: 'بطاقة سلامة وQR' })
        .locator('..');
      await section
        .getByLabel('اسم الاتصال الذي سيظهر للعموم')
        .fill('اتصال تجربة واجهة');
      await section
        .getByLabel('رقم الاتصال الذي سيظهر للعموم')
        .fill('+9647700000000');
      await section
        .getByLabel('انتهاء صلاحية البطاقة بتوقيت بغداد')
        .fill(future(15).slice(0, 16));
      await section.getByRole('checkbox').check();
      await section
        .getByRole('button', { name: 'إنشاء بطاقة السلامة', exact: true })
        .click();
      await expect(section.getByAltText('QR بطاقة السلامة')).toBeVisible();
      const link = await section.getByLabel('رابط بطاقة السلامة').inputValue();
      const anon = await browser.newPage();
      try {
        const response = await anon.goto(link);
        expect(response?.headers()['referrer-policy']).toBe('no-referrer');
        await expect(
          anon.getByRole('heading', { name: 'لوز الدوام', exact: true }),
        ).toBeVisible();
        expect(await anon.locator('body').innerText()).not.toContain('CANARY');
      } finally {
        await anon.close();
      }
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
});
