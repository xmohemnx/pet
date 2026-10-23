import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IdentityMe } from '@petra/contracts';
const origin = 'http://127.0.0.1:3100';
let fixture: {
  accounts: Record<string, { cookie: string }>;
  clinicId: string;
  branchId: string;
};
const capture = process.env.PETRA_CAPTURE_WORKSPACES === 'true';
const proof =
  process.env.PETRA_WORKSPACE_PROOF_DIR ?? '.impeccable/review/workspaces';
const artifacts: string[] = [];
async function login(context: BrowserContext, role: string, persona: string) {
  await context.clearCookies();
  await context.addCookies(
    fixture.accounts[role]!.cookie.split('; ').map((part) => {
      const i = part.indexOf('=');
      return {
        name: part.slice(0, i),
        value: part.slice(i + 1),
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
  const workspace = me.workspaces.find(
    (w) =>
      w.persona === persona &&
      (persona !== 'clinic_member' || w.clinicId === fixture.clinicId),
  );
  expect(workspace).toBeTruthy();
  expect(
    (
      await context.request.post(origin + '/api/v1/me/active-workspace', {
        headers: { Origin: origin },
        data: { workspaceId: workspace!.id },
      })
    ).status(),
  ).toBe(201);
}
async function post(context: BrowserContext, path: string, data: unknown) {
  const response = await context.request.post(origin + '/api/v1/' + path, {
    headers: { Origin: origin },
    data,
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function inspect(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 760 ? 1000 : 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${name}-${width}`,
    ).toBe(true);
    if (width === 1440 || width === 390) {
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (capture) {
        await page.evaluate(() => scrollTo(0, 0));
        const path = `${proof}/${name}-${width}.png`;
        await page.screenshot({ path, fullPage: true });
        artifacts.push(path);
      }
    }
  }
}
test.beforeAll(() => {
  const file = `/tmp/petra-workspaces-${randomUUID()}.json`;
  try {
    execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
      env: process.env,
      stdio: 'pipe',
    });
    fixture = JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(file, { force: true });
  }
  if (capture) mkdirSync(proof, { recursive: true });
});
test.afterAll(() => {
  if (capture)
    writeFileSync(
      `${proof}/manifest.json`,
      JSON.stringify(
        {
          sourceTree: execFileSync('git', ['write-tree'], {
            encoding: 'utf8',
          }).trim(),
          fixtures: 'Synthetic local E2E test accounts, not production records',
          artifacts,
        },
        null,
        2,
      ) + '\n',
    );
});
test('مساحات العمل: حالات فارغة ومملوءة ومهام فعلية دون كسر الصلاحيات', async ({
  page,
  context,
}) => {
  test.setTimeout(300000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(context, 'owner', 'customer');
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'رعاية رفاقك', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'لنبدأ بالتعرّف إلى رفيقك' }),
  ).toBeVisible();
  await inspect(page, 'customer-empty');
  await page
    .getByRole('button', { name: 'إنشاء أول ملف', exact: true })
    .click();
  await expect(page.locator('#new-companion')).toBeVisible();
  await expect(page.locator('#new-companion input').first()).toBeFocused();
  const pet = await post(context, 'pets', {
    name: 'لوزة · اختبار محلي',
    species: 'cat',
    sex: 'female',
  });
  await page.goto('/app');
  await expect(
    page.getByRole('link', { name: /لوزة · اختبار محلي/ }),
  ).toHaveAttribute('href', `/care/pets/${pet.id}`);
  await inspect(page, 'customer');
  await login(context, 'doctor', 'doctor');
  await page.goto('/doctor');
  await expect(
    page.getByRole('button', { name: 'اليوم 0', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await inspect(page, 'doctor-empty');
  await page
    .getByRole('button', { name: 'نشر وقت للحجز', exact: true })
    .click();
  await expect(page.locator('#publish-time')).toHaveAttribute('open', '');
  await expect(
    page.getByRole('combobox', { name: 'العيادة', exact: true }),
  ).toBeFocused();
  await inspect(page, 'doctor-publisher');
  await login(context, 'manager', 'clinic_member');
  await page.goto(`/clinic/${fixture.clinicId}`);
  await expect(
    page.getByRole('heading', { name: 'لا مواعيد في جدول اليوم' }),
  ).toBeVisible();
  await inspect(page, 'clinic-empty');
  await page.getByRole('link', { name: 'الفريق والفروع', exact: true }).click();
  await expect(page.locator('#clinic-administration')).toHaveAttribute(
    'open',
    '',
  );
  await page
    .getByLabel('اسم الفرع', { exact: true })
    .fill('فرع واجهة · اختبار محلي');
  await page.getByLabel('المدينة', { exact: true }).fill('بغداد');
  await page.getByRole('button', { name: 'إضافة فرع', exact: true }).click();
  await expect(
    page.getByText('حُفظ الفرع الجديد.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'الفريق والفروع', exact: true }).click();
  await expect(
    page.getByText('فرع واجهة · اختبار محلي', { exact: true }),
  ).toBeVisible();
  await inspect(page, 'clinic-administration');
  const service = await post(context, `clinics/${fixture.clinicId}/services`, {
    name: 'كشف · اختبار محلي',
    durationMinutes: 30,
  });
  await login(context, 'doctor', 'doctor');
  const startsAt = new Date(Date.now() + 3600000).toISOString();
  const slot = await post(context, `clinics/${fixture.clinicId}/slots`, {
    serviceId: service.id,
    branchId: fixture.branchId,
    startsAt,
  });
  await login(context, 'owner', 'customer');
  await post(context, 'appointments', {
    petId: pet.id,
    slotId: slot.id,
    idempotencyKey: randomUUID(),
  });
  await login(context, 'doctor', 'doctor');
  await page.goto('/doctor');
  await page.getByRole('button', { name: /القادمة 1/, exact: true }).click();
  await expect(page.locator('.doctor-visit-row')).toContainText(
    'لوزة · اختبار محلي',
  );
  await page
    .getByRole('button', { name: /كل الزيارات 1/, exact: true })
    .click();
  await expect(page.locator('.doctor-visit-row')).toHaveCount(1);
  await inspect(page, 'doctor');
  await login(context, 'manager', 'clinic_member');
  await page.goto(`/clinic/${fixture.clinicId}`);
  // Capture today's actual schedule; at the Baghdad midnight boundary tomorrow may own the booking.
  await inspect(page, 'clinic');
  await login(context, 'accountant', 'clinic_member');
  await page.goto(`/clinic/${fixture.clinicId}`);
  await expect(
    page
      .getByRole('navigation', { name: 'أقسام عمل العيادة' })
      .getByRole('link', { name: /المالية والمحاسبة/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'أقسام عمل العيادة' })
      .getByRole('link', { name: /المواعيد والاستقبال/ }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('#petra-workspace-navigation')
      .getByRole('link', { name: 'تقويم العيادة', exact: true }),
  ).toHaveCount(0);
  await login(context, 'driver', 'driver');
  await page.goto('/driver');
  await inspect(page, 'driver-empty');
  await page
    .getByRole('button', { name: 'إعداد المركبة والتوفر', exact: true })
    .click();
  await expect(page.getByLabel('رقم اللوحة', { exact: true })).toBeFocused();
  await page.getByLabel('رقم اللوحة', { exact: true }).fill('LOCAL-UI-TEST');
  await page
    .getByLabel('وصف المركبة والتجهيز', { exact: true })
    .fill('مركبة اختبار محلي فقط');
  const city = 'بغداد-' + randomUUID().slice(0, 8);
  await page.getByLabel('مدينة العمل', { exact: true }).fill(city);
  await page.getByLabel('انتهاء الوثيقة', { exact: true }).fill('2030-01-01');
  await page.getByLabel('متاح لقبول رحلات', { exact: true }).check();
  await page
    .getByRole('button', { name: 'حفظ المركبة والتوفر', exact: true })
    .click();
  await expect(page.locator('.driver-readiness')).toContainText(
    'LOCAL-UI-TEST',
  );
  await inspect(page, 'driver-configuration');
  await login(context, 'owner', 'customer');
  const ride = await post(context, 'sandbox/rides', {
    petId: pet.id,
    city,
    originLabel: 'بداية · اختبار محلي',
    destinationLabel: 'وجهة · اختبار محلي',
    originLat: 33.3152,
    originLng: 44.3661,
    destinationLat: 33.3115,
    destinationLng: 44.4009,
    policyAccepted: true,
    autoDispatch: false,
    idempotencyKey: randomUUID(),
  });
  await login(context, 'driver', 'driver');
  await page.goto('/driver');
  await page.getByRole('button', { name: 'قبول الرحلة', exact: true }).click();
  await expect(page.locator('.driver-current .ride-card')).toHaveCount(1);
  await expect(page.locator('.driver-current')).toContainText(
    'بداية · اختبار محلي',
  );
  await page.getByRole('button', { name: 'بدأت التوجه', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'وصلت إلى العميل', exact: true }),
  ).toBeVisible();
  const actualRide = await (
    await context.request.get(origin + '/api/v1/me/rides')
  ).json();
  expect(actualRide.find((r: { id: string }) => r.id === ride.id).status).toBe(
    'driver_en_route',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  const quickNavigation = await page
    .getByRole('navigation', { name: 'الوصول السريع على الهاتف' })
    .boundingBox();
  const routeBox = await page
    .locator('.driver-current .ride-route')
    .boundingBox();
  const transition = page.getByRole('button', {
    name: 'وصلت إلى العميل',
    exact: true,
  });
  const transitionBox = await transition.boundingBox();
  expect(routeBox!.y + routeBox!.height).toBeLessThan(quickNavigation!.y);
  expect(transitionBox!.y + transitionBox!.height).toBeLessThan(
    quickNavigation!.y,
  );
  await page.getByRole('button', { name: /السجل 0/, exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(transition).toBeFocused();
  expect(
    await page.evaluate(() =>
      Boolean(
        document
          .querySelector('.driver-current')!
          .compareDocumentPosition(document.querySelector('.driver-offers')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  await inspect(page, 'driver');
  await page.getByRole('button', { name: /السجل 0/, exact: true }).click();
  await expect(page.locator('.driver-current .ride-card')).toHaveCount(0);
  await page.getByRole('button', { name: /الجارية 1/, exact: true }).click();
  await expect(page.locator('.driver-current .ride-card')).toHaveCount(1);
});
