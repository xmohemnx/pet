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
    accounts: Record<string, { id: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext;
let pet: string,
  petB: string,
  foreignPet: string,
  dog: string,
  offer: string,
  room: string,
  roomB: string;
const future = (minutes: number) =>
  new Date(Date.now() + minutes * 60000).toISOString();
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function slot(
  minutes: number,
  staff = f.accounts.manager!.id,
  resource = room,
  service = offer,
) {
  const start = future(minutes);
  return post(manager, `clinics/${f.clinicId}/grooming-slots`, {
    serviceId: service,
    staffId: staff,
    resourceId: resource,
    startsAt: start,
    endsAt: new Date(Date.parse(start) + 90 * 60000).toISOString(),
  });
}
function input(
  slotId: string,
  petId = pet,
  extra: Record<string, unknown> = {},
) {
  return {
    slotId,
    petId,
    addonCodes: [],
    priceMinor: '10000',
    photosConsent: false,
    idempotencyKey: randomUUID(),
    ...extra,
  };
}
async function cookies(context: BrowserContext, role = 'owner') {
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
test.describe.serial('خدمة التجميل وصلاحياتها وسعة طبية مشتركة', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-grooming-${randomUUID()}.json`;
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
    await db.query(
      "UPDATE clinic_memberships SET capabilities=capabilities||ARRAY['service_staff'] WHERE clinic_id=$1 AND user_id=$2",
      [f.clinicId, f.accounts.doctor!.id],
    );
    for (const [name, c, species] of [
      ['حيوان تجميل أول', owner, 'cat'],
      ['حيوان تجميل ثان', owner, 'cat'],
      ['حيوان تجميل عائلة أخرى', other, 'cat'],
      ['كلب غير مؤهل', owner, 'dog'],
    ] as const) {
      const p = await post(c, 'pets', { name, species, sex: 'unknown' });
      if (name === 'حيوان تجميل أول') pet = p.id;
      else if (name === 'حيوان تجميل ثان') petB = p.id;
      else if (species === 'dog') dog = p.id;
      else foreignPet = p.id;
    }
    const rooms = await post(manager, `clinics/${f.clinicId}/resources`, {
      branchId: f.branchId,
      name: 'غرفة تجميل أولى',
    });
    room = rooms[0].id;
    roomB = (
      await post(manager, `clinics/${f.clinicId}/resources`, {
        branchId: f.branchId,
        name: 'غرفة تجميل ثانية',
      })
    ).find((r: { id: string }) => r.id !== room).id;
    offer = (
      await post(manager, `clinics/${f.clinicId}/grooming-services`, {
        branchId: f.branchId,
        name: 'تجميل قطط الاختبار',
        description: 'خدمة اصطناعية بلا رعاية فعلية',
        species: ['cat'],
        priceMinor: '10000',
        minutes: 60,
        addons: [
          {
            code: 'BRUSH',
            name: 'تمشيط إضافي',
            priceMinor: '3333',
            minutes: 15,
          },
        ],
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
  test('بنطاق الفرع والموظف ونوع الحيوان وسعر الخادم، ولا إدارة لعيادة أخرى', async () => {
    expect(
      (await other.get(root + `clinics/${f.clinicId}/grooming`)).status(),
    ).toBe(403);
    const bad = await owner.post(
      root + `clinics/${f.clinicId}/grooming-services`,
      {
        data: {
          branchId: f.branchId,
          name: 'دخيل',
          description: '',
          species: ['cat'],
          priceMinor: '10000',
          minutes: 60,
          addons: [],
        },
      },
    );
    expect(bad.status()).toBe(403);
    expect(
      (
        await manager.post(root + `clinics/${f.clinicId}/grooming-slots`, {
          data: {
            serviceId: offer,
            staffId: f.accounts.other!.id,
            resourceId: room,
            startsAt: future(300),
            endsAt: future(400),
          },
        })
      ).status(),
    ).toBe(403);
    const sl = await slot(300);
    await post(
      manager,
      `clinics/${f.clinicId}/grooming-slots/${sl.id}/availability`,
      { active: false, version: 1 },
    );
    expect(
      (
        await owner.post(root + 'sandbox/grooming', { data: input(sl.id) })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(
          root + `clinics/${f.clinicId}/grooming-slots/${sl.id}/availability`,
          { data: { active: true, version: 1 } },
        )
      ).status(),
    ).toBe(409);
    await post(
      manager,
      `clinics/${f.clinicId}/grooming-slots/${sl.id}/availability`,
      { active: true, version: 2 },
    );
    await post(
      manager,
      `clinics/${f.clinicId}/grooming-services/${offer}/availability`,
      { active: false, version: 1 },
    );
    expect(
      (
        await owner.post(root + 'sandbox/grooming', { data: input(sl.id) })
      ).status(),
    ).toBe(409);
    await post(
      manager,
      `clinics/${f.clinicId}/grooming-services/${offer}/availability`,
      { active: true, version: 2 },
    );
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(sl.id, foreignPet),
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.post(root + 'sandbox/grooming', { data: input(sl.id, dog) })
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(sl.id, pet, { priceMinor: '1' }),
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(sl.id, pet, { addonCodes: ['UNKNOWN'] }),
        })
      ).status(),
    ).toBe(400);
    expect((await owner.get(root + 'me/grooming')).ok()).toBe(true);
  });
  test('حجز متزامن مرة واحدة وإلغاء يرد المبلغ مرة واحدة ويعيد السعة', async () => {
    const sl = await slot(500),
      requests = [input(sl.id), input(sl.id, foreignPet)],
      contexts = [owner, other],
      results = await Promise.all(
        contexts.map((c, n) =>
          c.post(root + 'sandbox/grooming', { data: requests[n] }),
        ),
      );
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    const winner = results.findIndex((r) => r.status() === 201),
      b = await results[winner]!.json(),
      c = contexts[winner]!;
    expect((await post(c, 'sandbox/grooming', requests[winner])).id).toBe(b.id);
    expect(
      (
        await c.post(root + 'sandbox/grooming', {
          data: { ...requests[winner], photosConsent: true },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await stranger.post(
          root + `clinics/${f.clinicId}/grooming/${b.id}/transition`,
          { data: { status: 'in_progress' } },
        )
      ).status(),
    ).toBe(403);
    await post(c, `sandbox/grooming/${b.id}/cancel`);
    await post(c, `sandbox/grooming/${b.id}/cancel`);
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`grooming-cancel:${b.id}`],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query(
          'SELECT active FROM clinic_booking_occupancy WHERE source_id=$1',
          [b.id],
        )
      ).rows[0].active,
    ).toBe(false);
    const again = await post(owner, 'sandbox/grooming', input(sl.id));
    await post(owner, `sandbox/grooming/${again.id}/cancel`);
  });
  test('منع تعارض الموظف والغرفة والحيوان بين التجميل والزيارة الطبية في الاتجاهين', async () => {
    const start = future(3 * 1440),
      medical = (
        await post(manager, `clinics/${f.clinicId}/services`, {
          name: 'رعاية لاختبار السعة المشتركة',
          durationMinutes: 60,
          requiresResource: true,
        })
      ).id;
    const medslot = await post(doctor, `clinics/${f.clinicId}/slots`, {
      serviceId: medical,
      branchId: f.branchId,
      startsAt: start,
      resourceId: room,
    });
    async function exact(staff: string, resource: string) {
      return post(manager, `clinics/${f.clinicId}/grooming-slots`, {
        serviceId: offer,
        staffId: staff,
        resourceId: resource,
        startsAt: start,
        endsAt: new Date(Date.parse(start) + 90 * 60000).toISOString(),
      });
    }
    const sl = await exact(f.accounts.doctor!.id, room),
      b = await post(owner, 'sandbox/grooming', input(sl.id));
    expect(
      (
        await owner.post(root + 'appointments', {
          data: {
            petId: pet,
            slotId: medslot.id,
            idempotencyKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(409);
    await post(owner, `sandbox/grooming/${b.id}/cancel`);
    const appointment = await post(owner, 'appointments', {
      petId: pet,
      slotId: medslot.id,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(sl.id, petB),
        })
      ).status(),
    ).toBe(409);
    const roomConflict = await exact(f.accounts.manager!.id, room);
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(roomConflict.id, petB),
        })
      ).status(),
    ).toBe(409);
    const staffConflict = await exact(f.accounts.doctor!.id, roomB);
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(staffConflict.id, petB),
        })
      ).status(),
    ).toBe(409);
    const petConflict = await exact(f.accounts.manager!.id, roomB);
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(petConflict.id, pet),
        })
      ).status(),
    ).toBe(409);
    await post(owner, `appointments/${appointment.id}/cancel`);
    const freed = await post(
      owner,
      'sandbox/grooming',
      input(petConflict.id, pet),
    );
    await post(owner, `sandbox/grooming/${freed.id}/cancel`);
  });
  test('إتمام بصور خاصة وموافقة قابلة للسحب وتقييم شراء وإيراد غير مكرر', async () => {
    const sl = await slot(15),
      i = input(sl.id, pet, {
        addonCodes: ['BRUSH'],
        priceMinor: '13333',
        photosConsent: true,
      }),
      b = await post(owner, 'sandbox/grooming', i);
    expect(
      new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime(),
    ).toBe(75 * 60000);
    expect(
      (
        await owner.post(
          root + `clinics/${f.clinicId}/grooming/${b.id}/transition`,
          { data: { status: 'completed' } },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await manager.post(
          root + `clinics/${f.clinicId}/grooming/${b.id}/transition`,
          { data: { status: 'completed' } },
        )
      ).status(),
    ).toBe(409);
    await post(manager, `clinics/${f.clinicId}/grooming/${b.id}/transition`, {
      status: 'in_progress',
    });
    const bytes = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=teal:s=48x48',
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        'pipe:1',
      ]),
      asset = (
        await post(manager, 'media', { dataBase64: bytes.toString('base64') })
      ).id;
    await post(manager, `clinics/${f.clinicId}/grooming/${b.id}/transition`, {
      status: 'completed',
      photos: [asset],
    });
    await post(manager, `clinics/${f.clinicId}/grooming/${b.id}/transition`, {
      status: 'completed',
      photos: [asset],
    });
    expect((await owner.get(root + `media/${asset}/file`)).status()).toBe(200);
    expect((await other.get(root + `media/${asset}/file`)).status()).toBe(404);
    await post(manager, 'social/profile', {
      displayName: 'موظف تجميل اختباري',
      bio: '',
      privacy: 'public',
    });
    expect(
      (
        await manager.post(root + 'social/posts', {
          data: {
            kind: 'post',
            visibility: 'public',
            body: 'يجب منع نشر الصورة الخاصة',
            assetId: asset,
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + 'social/posts', {
          data: {
            kind: 'post',
            visibility: 'public',
            body: 'منع الصورة الخاصة في الألبوم',
            assetIds: [asset],
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + 'social/profile', {
          data: {
            displayName: 'موظف تجميل اختباري',
            bio: '',
            privacy: 'public',
            avatarAssetId: asset,
          },
        })
      ).status(),
    ).toBe(409);
    const referencePost = await post(manager, 'social/posts', {
      kind: 'post',
      visibility: 'public',
      body: 'اختبار حدود وسيط الألبوم',
    });
    await expect(
      db.query(
        'INSERT INTO social_post_media(post_id,asset_id,position) VALUES($1,$2,0)',
        [referencePost.id, asset],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(
        'UPDATE social_profiles SET avatar_asset_id=$1 WHERE user_id=$2',
        [asset, f.accounts.manager!.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const bannerData = {
      title: 'بنر حدود الخصوصية · اختبار محلي',
      body: 'اختبار فقط',
      assetId: asset,
      imageAlt: 'صورة اختبار للخصوصية',
      href: '/care',
      position: 0,
      published: false,
      startsAt: null,
      endsAt: null,
      publicationConsent: true,
    };
    expect(
      (
        await manager.post(root + 'admin/banners', { data: bannerData })
      ).status(),
    ).toBe(400);
    const bannerAsset = (
      await post(manager, 'media', { dataBase64: bytes.toString('base64') })
    ).id;
    const banner = await post(manager, 'admin/banners', {
      ...bannerData,
      assetId: bannerAsset,
    });
    await expect(
      db.query(
        'INSERT INTO grooming_photos(booking_id,asset_id) VALUES($1,$2)',
        [b.id, bannerAsset],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await manager.delete(root + `admin/banners/${banner.id}`, {
          data: { version: 1 },
        })
      ).status(),
    ).toBe(200);
    const albumAsset = (
      await post(manager, 'media', { dataBase64: bytes.toString('base64') })
    ).id;
    await db.query(
      'INSERT INTO social_post_media(post_id,asset_id,position) VALUES($1,$2,0)',
      [referencePost.id, albumAsset],
    );
    await expect(
      db.query(
        'INSERT INTO grooming_photos(booking_id,asset_id) VALUES($1,$2)',
        [b.id, albumAsset],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const avatarAsset = (
      await post(manager, 'media', { dataBase64: bytes.toString('base64') })
    ).id;
    await post(manager, 'social/profile', {
      displayName: 'موظف تجميل اختباري',
      bio: '',
      privacy: 'public',
      avatarAssetId: avatarAsset,
    });
    await expect(
      db.query(
        'INSERT INTO grooming_photos(booking_id,asset_id) VALUES($1,$2)',
        [b.id, avatarAsset],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('UPDATE grooming_bookings SET total_minor=1 WHERE id=$1', [
        b.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM journals WHERE source_key=$1',
          [`grooming-complete:${b.id}`],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await owner.post(root + `sandbox/grooming/${b.id}/cancel`)).status(),
    ).toBe(409);
    await post(owner, `grooming/${b.id}/review`, {
      rating: 5,
      body: 'تقييم خدمة تجميل اصطناعية',
    });
    expect(
      (
        await owner.post(root + `grooming/${b.id}/review`, {
          data: { rating: 4, body: 'تقييم مكرر يجب رفضه' },
        })
      ).status(),
    ).toBe(409);
    await post(owner, `grooming/${b.id}/withdraw-photos`);
    expect((await owner.get(root + `media/${asset}/file`)).status()).toBe(404);
    const mine = await (await owner.get(root + 'me/grooming')).json();
    expect(mine.find((x: { id: string }) => x.id === b.id).photos).toEqual([]);
  });
  test('نقل الملكية يمنع البدء وتلغى صلاحية العضو المسحوب ولا تكشف الصور دون موافقة', async () => {
    const assigned = await slot(800, f.accounts.doctor!.id, roomB);
    await db.query(
      "UPDATE clinic_memberships SET capabilities=array_remove(capabilities,'service_staff') WHERE user_id=$1 AND clinic_id=$2",
      [f.accounts.doctor!.id, f.clinicId],
    );
    expect(
      (
        await owner.post(root + 'sandbox/grooming', {
          data: input(assigned.id, petB),
        })
      ).status(),
    ).toBe(403);
    await db.query(
      "UPDATE clinic_memberships SET capabilities=capabilities||ARRAY['service_staff'] WHERE user_id=$1 AND clinic_id=$2",
      [f.accounts.doctor!.id, f.clinicId],
    );
    const sl = await slot(20),
      b = await post(owner, 'sandbox/grooming', input(sl.id, pet));
    expect(
      (
        await doctor.post(
          root + `clinics/${f.clinicId}/grooming/${b.id}/transition`,
          { data: { status: 'in_progress' } },
        )
      ).status(),
    ).toBe(403);
    await post(manager, `clinics/${f.clinicId}/grooming/${b.id}/transition`, {
      status: 'in_progress',
    });
    expect(
      (
        await manager.post(
          root + `clinics/${f.clinicId}/grooming/${b.id}/transition`,
          { data: { status: 'completed', photos: [randomUUID()] } },
        )
      ).status(),
    ).toBe(400);
    await post(manager, `clinics/${f.clinicId}/grooming/${b.id}/transition`, {
      status: 'completed',
    });
    const newPet = (
        await post(owner, 'pets', {
          name: 'نقل ملكية قبل التجميل',
          species: 'cat',
          sex: 'unknown',
        })
      ).id,
      changeSlot = await slot(25, f.accounts.doctor!.id, roomB),
      change = await post(
        owner,
        'sandbox/grooming',
        input(changeSlot.id, newPet),
      );
    const email = (
      await db.query('SELECT email FROM auth_users WHERE id=$1', [
        f.accounts.other!.id,
      ])
    ).rows[0].email;
    const transfer = await post(owner, `pets/${newPet}/transfer`, { email });
    await post(other, `pet-transfers/${transfer.id}/accept`);
    expect(
      (
        await manager.post(
          root + `clinics/${f.clinicId}/grooming/${change.id}/transition`,
          { data: { status: 'in_progress' } },
        )
      ).status(),
    ).toBe(404);
    await post(manager, `sandbox/grooming/${change.id}/cancel`);
  });
  test('المتصفح ينشئ الخدمة والموعد ثم يحجزها ويُلغيها من الهاتف', async ({
    page,
    context,
  }) => {
    await cookies(context, 'manager');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${f.clinicId}/grooming`);
    await page
      .getByRole('textbox', { name: 'اسم خدمة التجميل', exact: true })
      .fill('تجميل من المتصفح');
    await page
      .getByRole('textbox', {
        name: 'سعر التجميل بوحدات IQD الصغرى',
        exact: true,
      })
      .fill('15000');
    await page.getByRole('checkbox', { name: 'قط', exact: true }).check();
    await page
      .getByRole('button', { name: 'حفظ خدمة التجميل', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'تجميل من المتصفح', exact: true }),
    ).toBeVisible();
    const start = new Date(Date.now() + 4 * 86400000 + 3 * 3600000);
    await page
      .getByLabel('بداية موعد التجميل بتوقيت بغداد', { exact: true })
      .fill(start.toISOString().slice(0, 16));
    await page
      .getByLabel('نهاية موعد التجميل بتوقيت بغداد', { exact: true })
      .fill(new Date(start.getTime() + 90 * 60000).toISOString().slice(0, 16));
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith('/grooming-slots') && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'إضافة موعد تجميل', exact: true })
      .click();
    expect((await response).status()).toBe(201);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    mkdirSync('docs/evidence', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/clinic-grooming-390.png',
      fullPage: true,
    });
    await context.clearCookies();
    await cookies(context);
    await page.goto('/grooming');
    const section = page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: 'تجميل من المتصفح',
        exact: true,
      }),
    });
    await section
      .getByRole('combobox', {
        name: 'حيوان لخدمة تجميل من المتصفح',
        exact: true,
      })
      .selectOption(petB);
    const choices = section.getByRole('combobox', {
      name: 'موعد تجميل من المتصفح',
      exact: true,
    });
    await choices.selectOption({ index: 1 });
    await section.getByRole('checkbox', { name: /أوافق على التحصيل/ }).check();
    await section
      .getByRole('button', {
        name: 'حجز تجميل من المتصفح اختبارياً',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'تجميل من المتصفح · حيوان تجميل ثان',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/evidence/grooming-booking-390.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'إلغاء حجز حيوان تجميل ثان', exact: true })
      .click();
    await expect(
      page.getByRole('article').filter({
        has: page.getByRole('heading', {
          name: 'تجميل من المتصفح · حيوان تجميل ثان',
          exact: true,
        }),
      }),
    ).toContainText('ملغى');
  });
});
