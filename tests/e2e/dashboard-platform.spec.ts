import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { IdentityMe, ProfessionalPortfolio } from '@petra/contracts';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let f: {
  clinicId: string;
  clinicB: string;
  branchId: string;
  accounts: Record<string, { id: string; cookie: string }>;
};
let manager: APIRequestContext,
  owner: APIRequestContext,
  other: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext;
let banner: string,
  asset: string,
  verification: string,
  category: string,
  product: string,
  appointment: string,
  report: string;
const proof =
  process.env.PETRA_DASHBOARD_PROOF_DIR ?? '.impeccable/review/dashboards';
const capture = process.env.PETRA_CAPTURE_DASHBOARDS === 'true';
const artifacts: string[] = [];
const bannerInput = {
  title: 'رعاية أقرب لرفيقك · اختبار محلي',
  body: 'اكتشف خدمات العيادات واحجز الموعد المناسب. هذا بنر اختبار محلي تديره الإدارة.',
  assetId: null as string | null,
  imageAlt: '',
  href: '/care/directory',
  position: 2,
  published: false,
  startsAt: null as string | null,
  endsAt: null as string | null,
  publicationConsent: true,
};
async function create(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), path + ': ' + (await r.text())).toBe(201);
  return r.json();
}
async function login(context: BrowserContext, role: string, persona: string) {
  await context.clearCookies();
  await context.addCookies(
    f.accounts[role]!.cookie.split('; ').map((c) => {
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
  const me: IdentityMe = await (
    await context.request.get(origin + '/api/v1/me')
  ).json();
  const w = me.workspaces.find(
    (w) =>
      w.persona === persona &&
      (persona !== 'clinic_member' || w.clinicId === f.clinicId),
  );
  expect(w).toBeTruthy();
  expect(
    (
      await context.request.post(origin + '/api/v1/me/active-workspace', {
        headers: { Origin: origin },
        data: { workspaceId: w!.id },
      })
    ).status(),
  ).toBe(201);
}
async function inspect(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 760 ? 1000 : 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name + '-' + width,
    ).toBe(true);
    if (width === 1440 || width === 390) {
      const violations = (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations;
      expect(violations, name + '-' + width).toEqual([]);
      if (capture) {
        await page.evaluate(() => scrollTo(0, 0));
        const path = `${proof}/${name}-${width}.png`;
        await page.screenshot({ path, fullPage: true });
        artifacts.push(path);
      }
    }
  }
}
test.describe.serial('خمسة داشبوردات وبنرات وتوثيق وأقسام وملفات نتائج', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-dashboard-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [manager, owner, other, doctor, stranger] = await Promise.all(
      ['manager', 'owner', 'other', 'doctor', 'stranger'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    if (capture) mkdirSync(proof, { recursive: true });
  });
  test.afterAll(async () => {
    await Promise.all([
      manager?.dispose(),
      owner?.dispose(),
      other?.dispose(),
      doctor?.dispose(),
      stranger?.dispose(),
    ]);
    if (product)
      await db.query(
        'UPDATE products SET active=false,version=version+1 WHERE id=$1',
        [product],
      );
    await db.end();
    if (capture)
      writeFileSync(
        `${proof}/manifest.json`,
        JSON.stringify(
          {
            sourceTree: execFileSync('git', ['write-tree'], {
              encoding: 'utf8',
            }).trim(),
            fixture:
              'Synthetic isolated local E2E accounts; no production records',
            artifacts,
          },
          null,
          2,
        ) + '\n',
      );
  });
  test('عامل الوسائط يتجاهل نوع الصورة المعلقة ولا يتوقف', async () => {
    const id = (
      await db.query(
        "INSERT INTO media_assets(owner_id,kind,status,mime,byte_count,storage_key) VALUES($1,'image','pending','image/webp',100,$2) RETURNING id",
        [f.accounts.manager!.id, randomUUID() + '.upload'],
      )
    ).rows[0].id;
    try {
      const result = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import {processMedia} from './apps/api/dist/apps/api/src/media/service.js'; import {database} from './apps/api/dist/apps/api/src/database.js'; try {process.stdout.write(JSON.stringify(await processMedia()));} finally {await database.end();}",
        ],
        {
          env: process.env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      expect(JSON.parse(result)).toBe(false);
      expect(
        (await db.query('SELECT status FROM media_assets WHERE id=$1', [id]))
          .rows[0].status,
      ).toBe('pending');
    } finally {
      await db.query('DELETE FROM media_assets WHERE id=$1', [id]);
    }
  });
  test('صلاحيات الداشبوردات تعزل الأنواع والعيادات والمدير', async () => {
    for (const [client, kind] of [
      [owner, 'customer'],
      [doctor, 'doctor'],
      [manager, 'clinic'],
    ] as const) {
      const r = await client.get(
        root +
          `me/dashboard?kind=${kind}${kind === 'clinic' ? `&clinicId=${f.clinicId}` : ''}`,
      );
      expect(r.status(), await r.text()).toBe(200);
      expect((await r.json()).kind).toBe(kind);
    }
    expect((await owner.get(root + 'me/dashboard?kind=doctor')).status()).toBe(
      403,
    );
    expect(
      (
        await other.get(
          root + `me/dashboard?kind=clinic&clinicId=${f.clinicId}`,
        )
      ).status(),
    ).toBe(403);
    expect((await owner.get(root + 'admin/dashboard')).status()).toBe(403);
    const admin = await manager.get(root + 'admin/dashboard');
    expect(admin.status(), await admin.text()).toBe(200);
    expect((await admin.json()).counts.users).toBeGreaterThan(0);
  });
  test('بنرات المدير: مسودة ونشر وجدولة وصور خاصة وإصدارات', async () => {
    expect(
      (
        await owner.post(root + 'admin/banners', { data: bannerInput })
      ).status(),
    ).toBe(403);
    const image = readFileSync('apps/web/public/images/companion.png');
    asset = (
      await create(manager, 'media', { dataBase64: image.toString('base64') })
    ).id;
    const privateImage = await create(owner, 'media', {
      dataBase64: image.toString('base64'),
    });
    expect(
      (
        await manager.post(root + 'admin/banners', {
          data: {
            ...bannerInput,
            assetId: privateImage.id,
            imageAlt: 'صورة غير مملوكة',
          },
        })
      ).status(),
    ).toBe(400);
    banner = (
      await create(manager, 'admin/banners', {
        ...bannerInput,
        assetId: asset,
        imageAlt: 'صورة هوية مفهومية لرفيق؛ بنر اختبار محلي',
      })
    ).id;
    expect(
      (await (await owner.get(root + 'site/banners')).json()).some(
        (b: { id: string }) => b.id === banner,
      ),
    ).toBe(false);
    expect((await owner.get(root + `media/${asset}/file`)).status()).toBe(404);
    const update = {
      ...bannerInput,
      assetId: asset,
      imageAlt: 'صورة هوية مفهومية لرفيق؛ بنر اختبار محلي',
      published: true,
    };
    let r = await manager.patch(root + `admin/banners/${banner}`, {
      data: { version: 1, banner: update },
    });
    expect(r.status(), await r.text()).toBe(200);
    expect((await owner.get(root + `media/${asset}/file`)).status()).toBe(200);
    expect(
      (
        await manager.patch(root + `admin/banners/${banner}`, {
          data: { version: 1, banner: update },
        })
      ).status(),
    ).toBe(409);
    r = await manager.patch(root + `admin/banners/${banner}`, {
      data: {
        version: 2,
        banner: {
          ...update,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    });
    expect(r.status()).toBe(200);
    expect(
      (await (await owner.get(root + 'site/banners')).json()).some(
        (b: { id: string }) => b.id === banner,
      ),
    ).toBe(false);
    expect((await owner.get(root + `media/${asset}/file`)).status()).toBe(404);
    expect(
      (
        await manager.patch(root + `admin/banners/${banner}`, {
          data: { version: 3, banner: update },
        })
      ).status(),
    ).toBe(200);
  });
  test('توثيق الهوية بمراجع مستقل وإصدار دون ترخيص مهني تلقائي', async () => {
    const request = await create(owner, 'me/verifications', {
      reference: 'LOCAL-ID-REVIEW مرجع توثيق اصطناعي فقط',
    });
    verification = request.id;
    expect(
      (
        await owner.post(root + 'me/verifications', {
          data: { reference: 'طلب مكرر توثيق تجريبي' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.post(
          root + `admin/verifications/${verification}/decision`,
          {
            data: {
              version: 1,
              decision: 'verified',
              reason: 'سبب اختبار محلي مستقل',
            },
          },
        )
      ).status(),
    ).toBe(403);
    await create(manager, `admin/verifications/${verification}/decision`, {
      version: 1,
      decision: 'verified',
      reason: 'مراجعة توثيق هوية اختبار محلي',
    });
    expect(
      (await (await owner.get(root + 'me/dashboard?kind=customer')).json())
        .verified,
    ).toBe(true);
    expect((await owner.get(root + 'doctor/appointments')).status()).toBe(403);
    expect(
      (
        await manager.post(
          root + `admin/verifications/${verification}/decision`,
          {
            data: {
              version: 1,
              decision: 'revoked',
              reason: 'إصدار قديم لا يجوز اعتماده',
            },
          },
        )
      ).status(),
    ).toBe(409);
    const own = await create(manager, 'me/verifications', {
      reference: 'مرجع خاص بالمدير لا يراجعه بنفسه',
    });
    expect(
      (
        await manager.post(root + `admin/verifications/${own.id}/decision`, {
          data: {
            version: 1,
            decision: 'verified',
            reason: 'محاولة مراجعة ذاتية ممنوعة',
          },
        })
      ).status(),
    ).toBe(403);
  });
  test('إضافة وتعديل وترتيب وحذف أقسام مع عزل العيادة وحماية المنتجات', async () => {
    const base = `clinics/${f.clinicId}`;
    category = (
      await create(manager, `${base}/categories`, {
        name: 'أغذية رفاقك · اختبار',
        parentId: null,
        idempotencyKey: randomUUID(),
      })
    ).id;
    const r = await manager.patch(root + `${base}/categories/${category}`, {
      data: { version: 1, name: 'أغذية وعناية · اختبار', sortOrder: 1 },
    });
    expect(r.status(), await r.text()).toBe(200);
    expect(
      (
        await other.patch(root + `${base}/categories/${category}`, {
          data: { version: 2, name: 'تعديل ممنوع' },
        })
      ).status(),
    ).toBe(403);
    product = (
      await create(manager, `${base}/products`, {
        name: 'منتج أغذية · اختبار محلي',
        sku: randomUUID(),
        priceMinor: '1000000',
        costMinor: '500000',
      })
    ).id;
    const pv = (
      await db.query('SELECT version FROM products WHERE id=$1', [product])
    ).rows[0].version;
    await create(manager, `${base}/products/${product}/classification`, {
      version: pv,
      categoryId: category,
      tags: [],
    });
    expect(
      (
        await manager.delete(root + `${base}/categories/${category}`, {
          data: { version: 2 },
        })
      ).status(),
    ).toBe(409);
    const empty = await create(manager, `${base}/categories`, {
      name: 'قسم فارغ للحذف',
      parentId: null,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await manager.delete(root + `${base}/categories/${empty.id}`, {
          data: { version: 1 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await manager.get(root + `${base}/categories`)).json()).some(
        (c: { id: string }) => c.id === empty.id,
      ),
    ).toBe(false);
    const cats = await (
      await owner.get(root + 'marketplace/categories')
    ).json();
    expect(cats.some((c: { id: string }) => c.id === category)).toBe(true);
    const result = await (
      await owner.get(root + `marketplace/search?q=&categoryId=${category}`)
    ).json();
    expect(result.map((p: { id: string }) => p.id)).toEqual([product]);
  });
  test('نتائج مهنية مرتبطة بزيارة موقعة ومراجعة مع أرقام وخصوصية', async () => {
    const pet = await create(owner, 'pets', {
      name: 'رفيق · بيانات اختبار محلي',
      species: 'cat',
      breed: 'محلي',
      birthDate: '2024-01-01',
      sex: 'female',
      weightGrams: 3000,
      allergies: 'معلومات خاصة لا تظهر في البورتفوليو',
    });
    await create(owner, `pets/${pet.id}/consents`, {
      clinicId: f.clinicId,
      doctorId: f.accounts.doctor!.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const service = await create(manager, `clinics/${f.clinicId}/services`, {
      name: 'إجراء مهني · اختبار فقط',
      durationMinutes: 30,
    });
    const slot = await create(doctor, `clinics/${f.clinicId}/slots`, {
      serviceId: service.id,
      branchId: f.branchId,
      startsAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const visit = await create(owner, 'appointments', {
      petId: pet.id,
      slotId: slot.id,
      idempotencyKey: randomUUID(),
    });
    appointment = visit.id;
    const payload = {
      appointmentId: appointment,
      procedureKind: 'surgery',
      publicTitle: 'عملية موثقة · اختبار محلي',
      outcome: 'successful',
      charitable: true,
      evidenceReference: 'PRIVATE-EVIDENCE-ONLY-LOCAL',
      publicationConsent: true,
    };
    expect(
      (
        await doctor.post(root + 'doctor/portfolio-reports', { data: payload })
      ).status(),
    ).toBe(404);
    const encounter = await create(
      doctor,
      `appointments/${appointment}/encounter`,
      {
        version: 0,
        content: {
          complaint: 'اختبار',
          subjective: 'خاص',
          objective: 'خاص',
          assessment: 'اختبار',
          plan: 'اختبار',
          prescriptions: [],
          vaccines: [],
          labs: [],
          followUps: [],
        },
      },
    );
    // Advance only this isolated fixture, preserving the application's future-signing guard.
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '1 hour',ends_at=now()-interval '30 minutes' WHERE id=$1",
      [appointment],
    );
    await create(doctor, `encounters/${encounter.id}/sign`, {
      version: encounter.version,
    });
    expect(
      (
        await stranger.post(root + 'doctor/portfolio-reports', {
          data: payload,
        })
      ).status(),
    ).toBe(404);
    report = (await create(doctor, 'doctor/portfolio-reports', payload)).id;
    let profile: ProfessionalPortfolio = await (
      await owner.get(
        root + `professional-profiles/doctor/${f.accounts.doctor!.id}`,
      )
    ).json();
    expect(profile.statistics.total).toBe(0);
    expect(profile.completedVisits).toBe(1);
    expect(
      (
        await doctor.post(root + `admin/portfolio-reports/${report}/decision`, {
          data: {
            version: 1,
            decision: 'approved',
            reason: 'محاولة اعتماد ذاتي ممنوعة',
          },
        })
      ).status(),
    ).toBe(403);
    await create(manager, `admin/portfolio-reports/${report}/decision`, {
      version: 1,
      decision: 'approved',
      reason: 'مراجعة مستقلة لنتيجة اختبار محلي',
    });
    profile = await (
      await owner.get(
        root + `professional-profiles/doctor/${f.accounts.doctor!.id}`,
      )
    ).json();
    expect(profile.statistics).toEqual({
      total: 1,
      surgeries: 1,
      successful: 1,
      unsuccessful: 0,
      pending: 0,
      charitable: 1,
    });
    for (const [index, outcome] of ['unsuccessful', 'pending'].entries()) {
      const anotherSlot = await create(doctor, `clinics/${f.clinicId}/slots`, {
        serviceId: service.id,
        branchId: f.branchId,
        startsAt: new Date(Date.now() + (index + 2) * 3600000).toISOString(),
      });
      const anotherVisit = await create(owner, 'appointments', {
        petId: pet.id,
        slotId: anotherSlot.id,
        idempotencyKey: randomUUID(),
      });
      const anotherEncounter = await create(
        doctor,
        `appointments/${anotherVisit.id}/encounter`,
        {
          version: 0,
          content: {
            complaint: 'اختبار نتائج',
            subjective: 'خاص',
            objective: 'خاص',
            assessment: 'اختبار',
            plan: 'اختبار',
            prescriptions: [],
            vaccines: [],
            labs: [],
            followUps: [],
          },
        },
      );
      await db.query(
        "UPDATE appointments SET starts_at=now()-interval '1 hour',ends_at=now()-interval '30 minutes' WHERE id=$1",
        [anotherVisit.id],
      );
      await create(doctor, `encounters/${anotherEncounter.id}/sign`, {
        version: anotherEncounter.version,
      });
      const next = await create(doctor, 'doctor/portfolio-reports', {
        ...payload,
        appointmentId: anotherVisit.id,
        procedureKind: index === 0 ? 'surgery' : 'treatment',
        publicTitle:
          index === 0
            ? 'عملية بنتيجة غير ناجحة · اختبار محلي'
            : 'علاج قيد المتابعة · اختبار محلي',
        outcome,
        charitable: false,
      });
      await create(manager, `admin/portfolio-reports/${next.id}/decision`, {
        version: 1,
        decision: 'approved',
        reason: 'مراجعة نتيجة مستقلة في الاختبار المحلي',
      });
    }
    profile = await (
      await owner.get(
        root + `professional-profiles/doctor/${f.accounts.doctor!.id}`,
      )
    ).json();
    expect(profile.statistics).toEqual({
      total: 3,
      surgeries: 2,
      successful: 1,
      unsuccessful: 1,
      pending: 1,
      charitable: 1,
    });
    expect(JSON.stringify(profile)).not.toMatch(
      /PRIVATE-EVIDENCE|pet_id|appointment_id|subjective|allergies/,
    );
    const clinic = await (
      await owner.get(root + `professional-profiles/clinic/${f.clinicId}`)
    ).json();
    expect(clinic.statistics).toEqual(profile.statistics);
    expect(
      (
        await doctor.post(root + 'doctor/portfolio-reports', { data: payload })
      ).status(),
    ).toBe(409);
  });
  test('نماذج الواجهة تحفظ البنرات وتراجع الهوية والنتيجة المهنية', async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    const a = (
      await db.query(
        'SELECT a.*,s.service_id FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE a.id=$1',
        [appointment],
      )
    ).rows[0];
    const slot = await create(doctor, `clinics/${f.clinicId}/slots`, {
      serviceId: a.service_id,
      branchId: f.branchId,
      startsAt: new Date(Date.now() + 5 * 3600000).toISOString(),
    });
    const visit = await create(owner, 'appointments', {
      petId: a.pet_id,
      slotId: slot.id,
      idempotencyKey: randomUUID(),
    });
    const e = await create(doctor, `appointments/${visit.id}/encounter`, {
      version: 0,
      content: {
        complaint: 'اختبار النموذج',
        subjective: 'خاص',
        objective: 'خاص',
        assessment: 'اختبار',
        plan: 'اختبار',
        prescriptions: [],
        vaccines: [],
        labs: [],
        followUps: [],
      },
    });
    await db.query(
      "UPDATE appointments SET starts_at=now()-interval '1 hour',ends_at=now()-interval '30 minutes' WHERE id=$1",
      [visit.id],
    );
    await create(doctor, `encounters/${e.id}/sign`, { version: e.version });
    await login(context, 'doctor', 'doctor');
    await page.goto('/doctor/portfolio');
    await page
      .getByRole('combobox', { name: 'الزيارة المكتملة', exact: true })
      .selectOption(visit.id);
    await page
      .getByRole('combobox', { name: 'نوع الإجراء', exact: true })
      .selectOption('treatment');
    await page
      .locator('input[name="title"]')
      .fill('إجراء من النموذج · اختبار محلي');
    await page
      .locator('textarea[name="evidence"]')
      .fill('PRIVATE-FORM-EVIDENCE-LOCAL');
    await page.locator('input[name="consent"]').check();
    await page
      .getByRole('button', { name: 'إرسال النتيجة للمراجعة', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'إجراء من النموذج · اختبار محلي',
        exact: true,
      }),
    ).toBeVisible();
    const identity = await create(doctor, 'me/verifications', {
      reference: 'مرجع توثيق الطبيب من اختبار واجهة المراجع',
    });
    await create(manager, `clinics/${f.clinicId}/warehouses`, {
      name: 'مخزن الفرع · اختبار واجهة',
      branchId: f.branchId,
    });
    await login(context, 'manager', 'platform_admin');
    await page.goto('/admin/control');
    await page
      .getByLabel('عنوان البنر', { exact: true })
      .fill('مسودة من واجهة الإدارة · اختبار');
    await page
      .getByLabel('وصف البنر', { exact: true })
      .fill('هذا بنر مسودة للتحقق من إنشاء وحذف المحتوى فعلياً.');
    await page.locator('input[name="consent"]').check();
    await page.getByRole('button', { name: 'حفظ البنر', exact: true }).click();
    const draft = page.locator('.banner-management-list article').filter({
      has: page.getByRole('heading', {
        name: 'مسودة من واجهة الإدارة · اختبار',
        exact: true,
      }),
    });
    await expect(draft).toBeVisible();
    await draft
      .getByRole('button', { name: 'تعديل البنر', exact: true })
      .click();
    await page
      .getByLabel('عنوان البنر', { exact: true })
      .fill('مسودة معدلة من الواجهة · اختبار');
    await page.locator('input[name="consent"]').check();
    await page
      .getByRole('button', { name: 'حفظ تعديلات البنر', exact: true })
      .click();
    const edited = page.locator('.banner-management-list article').filter({
      has: page.getByRole('heading', {
        name: 'مسودة معدلة من الواجهة · اختبار',
        exact: true,
      }),
    });
    await expect(edited).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await edited
      .getByRole('button', { name: 'حذف البنر', exact: true })
      .click();
    await expect(edited).toHaveCount(0);
    const identityRow = page
      .locator('#identities .admin-review-row')
      .filter({ hasText: 'مرجع توثيق الطبيب من اختبار واجهة المراجع' });
    await identityRow
      .getByLabel('سبب قرار توثيق الهوية', { exact: true })
      .fill('توثيق هوية الطبيب في اختبار واجهة مستقلة');
    await identityRow
      .getByRole('button', { name: 'حفظ قرار توثيق الهوية', exact: true })
      .click();
    await expect(identityRow).toContainText('هوية موثقة');
    expect(
      (await (await doctor.get(root + 'me/verifications')).json()).find(
        (v: { id: string }) => v.id === identity.id,
      ).status,
    ).toBe('verified');
    const reportRow = page.locator('#reports .admin-review-row').filter({
      has: page.getByRole('heading', {
        name: 'إجراء من النموذج · اختبار محلي',
        exact: true,
      }),
    });
    await reportRow
      .getByLabel('سبب قرار النتيجة', { exact: true })
      .fill('مراجعة مستقلة من واجهة الإدارة لاختبار النشر');
    await reportRow
      .getByRole('button', { name: 'حفظ قرار النتيجة المهنية', exact: true })
      .click();
    await expect(
      reportRow.getByRole('combobox', {
        name: 'قرار مراجعة النتيجة',
        exact: true,
      }),
    ).toHaveValue('revoked');
    const profile = await (
      await owner.get(
        root + `professional-profiles/doctor/${f.accounts.doctor!.id}`,
      )
    ).json();
    expect(profile.statistics.total).toBe(4);
    expect(profile.identityVerified).toBe(true);
    expect(JSON.stringify(profile)).not.toContain('PRIVATE-FORM-EVIDENCE');
    const managerVerification = (
      await (await manager.get(root + 'me/verifications')).json()
    ).find((v: { status: string }) => v.status === 'pending');
    await create(
      other,
      `admin/verifications/${managerVerification.id}/decision`,
      {
        version: managerVerification.version,
        decision: 'verified',
        reason: 'مراجع إداري مستقل يتحقق من حساب مسؤول العيادة',
      },
    );
    expect(
      (
        await (
          await owner.get(root + `professional-profiles/clinic/${f.clinicId}`)
        ).json()
      ).identityVerified,
    ).toBe(true);
    const driver = await factory.newContext({
      extraHTTPHeaders: { Origin: origin, Cookie: f.accounts.driver!.cookie },
    });
    try {
      const city = 'بغداد-' + randomUUID().slice(0, 8);
      const dv = await create(driver, 'me/verifications', {
        reference: 'مرجع هوية سائق تجريبي من الاختبار المحلي',
      });
      await create(manager, `admin/verifications/${dv.id}/decision`, {
        version: dv.version,
        decision: 'verified',
        reason: 'مراجعة هوية سائق اختبار محلي مستقلة',
      });
      await create(driver, 'driver/vehicle', {
        plate: 'LOCAL-DASHBOARD',
        description: 'مركبة مجهزة · اختبار محلي',
        city,
        expiresOn: '2030-01-01',
        available: true,
      });
      const ride = await create(owner, 'sandbox/rides', {
        petId: a.pet_id,
        city,
        originLabel: 'بداية · اختبار محلي',
        destinationLabel: 'العيادة · اختبار محلي',
        originLat: 33.3152,
        originLng: 44.3661,
        destinationLat: 33.3115,
        destinationLng: 44.4009,
        policyAccepted: true,
        autoDispatch: false,
        idempotencyKey: randomUUID(),
      });
      await create(driver, `rides/${ride.id}/claim`);
    } finally {
      await driver.dispose();
    }
  });
  test('واجهات حقيقية للداشبوردات الخمسة والتوثيق والمتجر والملفات', async ({
    page,
    context,
  }) => {
    test.setTimeout(300000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const views = [
      ['owner', 'customer', '/app', 'customer'],
      ['doctor', 'doctor', '/doctor', 'doctor'],
      ['doctor', 'doctor', '/doctor/portfolio', 'portfolio-editor'],
      ['manager', 'clinic_member', `/clinic/${f.clinicId}`, 'clinic'],
      ['driver', 'driver', '/driver', 'driver'],
      ['manager', 'platform_admin', '/admin', 'admin'],
      ['manager', 'platform_admin', '/admin/control', 'admin-control'],
      [
        'manager',
        'clinic_member',
        `/clinic/${f.clinicId}/store`,
        'clinic-store',
      ],
      ['owner', 'customer', '/account/verification', 'verification'],
      [
        'owner',
        'customer',
        `/professional-profiles/doctor/${f.accounts.doctor!.id}`,
        'doctor-profile',
      ],
      [
        'owner',
        'customer',
        `/professional-profiles/clinic/${f.clinicId}`,
        'clinic-profile',
      ],
      ['owner', 'customer', '/marketplace', 'departments'],
      [
        'owner',
        'customer',
        `/marketplace/stores/${f.clinicId}`,
        'clinic-customer-store',
      ],
    ] as const;
    for (const [role, persona, path, name] of views) {
      await login(context, role, persona);
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      if (['customer', 'doctor', 'clinic', 'driver'].includes(name)) {
        await expect(page.locator('.dashboard-summary dl')).toBeVisible();
      }
      if (name === 'customer')
        await expect(
          page.getByRole('heading', { name: bannerInput.title }),
        ).toBeVisible();
      if (name === 'departments') {
        await page
          .getByLabel('البحث في المنتجات', { exact: true })
          .fill('عبارة لا تطابق المنتج');
        await page
          .getByRole('button', { name: 'أغذية وعناية · اختبار', exact: false })
          .click();
        await expect(
          page.getByLabel('البحث في المنتجات', { exact: true }),
        ).toHaveValue('');
        await expect(page.locator('.market-products')).toContainText(
          'منتج أغذية · اختبار محلي',
        );
      }
      await inspect(page, name);
    }
  });
  test('سحب التوثيق والنتيجة وحذف البنر يوقف النشر', async () => {
    await create(manager, `admin/verifications/${verification}/decision`, {
      version: 2,
      decision: 'revoked',
      reason: 'سحب توثيق تجريبي للتأكد من التحديث',
    });
    expect(
      (await (await owner.get(root + 'me/dashboard?kind=customer')).json())
        .verified,
    ).toBe(false);
    await create(manager, `admin/portfolio-reports/${report}/decision`, {
      version: 2,
      decision: 'revoked',
      reason: 'سحب اعتماد تقرير الاختبار من النشر',
    });
    expect(
      (
        await (
          await owner.get(
            root + `professional-profiles/doctor/${f.accounts.doctor!.id}`,
          )
        ).json()
      ).statistics.total,
    ).toBe(3);
    expect(
      (
        await manager.delete(root + `admin/banners/${banner}`, {
          data: { version: 4 },
        })
      ).status(),
    ).toBe(200);
    expect((await owner.get(root + `media/${asset}/file`)).status()).toBe(404);
  });
});
