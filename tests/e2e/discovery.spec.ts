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
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: { accounts: Record<string, { id: string; cookie: string }> },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext;
let story: string, asset: string, post: string, lost: string, found: string;
async function create(c: APIRequestContext, p: string, data: unknown = {}) {
  const r = await c.post(root + p, { data });
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
test.describe.serial('بحث ومشاهدات ومميزة ومشاركة ومطابقة مفقود', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-discovery-${randomUUID()}.json`;
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
    await create(owner, 'social/profile', {
      displayName: 'رفيق القصص',
      bio: 'بيانات اختبار',
      privacy: 'private',
    });
    await create(other, 'social/profile', {
      displayName: 'قارئ القصص',
      bio: 'اختبار',
      privacy: 'public',
    });
    const bytes = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=orange:s=48x48',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    asset = (
      await create(owner, 'media', { dataBase64: bytes.toString('base64') })
    ).id;
    story = (
      await create(owner, 'social/posts', {
        body: 'قصة ذات خصوصية وذكرى اختبارية',
        kind: 'story',
        visibility: 'followers',
        assetId: asset,
      })
    ).id;
    post = (
      await create(owner, 'social/posts', {
        body: 'SEARCH-PRIVATE-CANARY حكاية رفيق',
        kind: 'post',
        visibility: 'public',
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), other?.dispose(), manager?.dispose()]);
    await db.end();
  });
  test('البحث والمشاركة ومشاهدة القصة تعيد فحص الخصوصية والمتابعة', async () => {
    expect(
      await (
        await other.get(root + 'social/feed?q=SEARCH-PRIVATE-CANARY')
      ).json(),
    ).toEqual([]);
    expect(
      (
        await other.post(root + `social/posts/${post}/share`, { data: {} })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.post(root + `social/posts/${story}/view`, { data: {} })
      ).status(),
    ).toBe(404);
    await create(other, `social/users/${fixture.accounts.owner!.id}/follow`);
    await create(
      owner,
      `social/users/${fixture.accounts.other!.id}/accept-follow`,
    );
    expect(
      (
        await (
          await other.get(root + 'social/feed?q=SEARCH-PRIVATE-CANARY')
        ).json()
      ).map((p: { id: string }) => p.id),
    ).toContain(post);
    expect((await create(other, `social/posts/${post}/share`)).path).toBe(
      `/social/posts/${post}`,
    );
    await Promise.all([
      create(other, `social/posts/${story}/view`),
      create(other, `social/posts/${story}/view`),
    ]);
    expect(
      await (await owner.get(root + `social/posts/${story}/viewers`)).json(),
    ).toHaveLength(1);
    expect(
      (await other.get(root + `social/posts/${story}/viewers`)).status(),
    ).toBe(404);
    expect(
      (
        await other.post(root + `social/posts/${story}/highlight`, {
          data: { title: 'ممنوع', consent: true },
        })
      ).status(),
    ).toBe(404);
  });
  test('القصة المميزة تبقى بموافقة؛ إزالتها أو الحظر يسحب عرض الوسيط بعد الانتهاء', async () => {
    expect(
      (
        await owner.post(root + `social/posts/${story}/highlight`, {
          data: { title: 'ذكرى', consent: false },
        })
      ).status(),
    ).toBe(400);
    await create(owner, `social/posts/${story}/highlight`, {
      title: 'ذكرى الرفيق',
      consent: true,
    });
    await db.query(
      "UPDATE social_posts SET expires_at=now()-interval '1 second' WHERE id=$1",
      [story],
    );
    expect(
      await (await other.get(root + 'social/feed?kind=story')).json(),
    ).toEqual([]);
    expect(
      (
        await (
          await other.get(
            root + `social/highlights/${fixture.accounts.owner!.id}`,
          )
        ).json()
      ).map((p: { id: string }) => p.id),
    ).toContain(story);
    expect((await other.get(root + `media/${asset}/file`)).status()).toBe(200);
    await create(owner, `social/users/${fixture.accounts.other!.id}/block`);
    expect(
      await (
        await other.get(
          root + `social/highlights/${fixture.accounts.owner!.id}`,
        )
      ).json(),
    ).toEqual([]);
    expect((await other.get(root + `media/${asset}/file`)).status()).toBe(404);
    await owner.delete(
      root + `social/users/${fixture.accounts.other!.id}/block`,
    );
    await create(other, `social/users/${fixture.accounts.owner!.id}/follow`);
    await create(
      owner,
      `social/users/${fixture.accounts.other!.id}/accept-follow`,
    );
    expect(
      (await owner.delete(root + `social/posts/${story}/highlight`)).status(),
    ).toBe(200);
    expect((await other.get(root + `media/${asset}/file`)).status()).toBe(404);
    expect((await other.get(root + `social/posts/${story}`)).status()).toBe(
      404,
    );
    await create(owner, `social/posts/${story}/highlight`, {
      title: 'ذكرى الرفيق',
      consent: true,
    });
  });
  test('مطابقة مفقود/معثور تقتصر على صاحب البلاغ والمدينة والنوع والمراجَع دون الموقع', async () => {
    const data = {
      kind: 'lost',
      title: 'قطة مفقودة اختبار',
      description: 'وصف مفقود اصطناعي',
      city: 'بغداد',
      species: 'cat',
      privateLocation: 'PRIVATE-LOST-LOCATION',
    };
    lost = (await create(owner, 'rescue/cases', data)).id;
    found = (
      await create(other, 'rescue/cases', {
        ...data,
        kind: 'found',
        title: 'قطة معثور عليها اختبار',
        privateLocation: 'PRIVATE-FOUND-LOCATION',
      })
    ).id;
    await create(manager, `admin/rescue/case/${found}`, { approved: true });
    const dog = (
      await create(other, 'rescue/cases', {
        ...data,
        kind: 'found',
        species: 'dog',
        title: 'كلب معثور اختبار',
      })
    ).id;
    await create(manager, `admin/rescue/case/${dog}`, { approved: true });
    expect(
      (await other.get(root + `rescue/cases/${lost}/matches`)).status(),
    ).toBe(404);
    const response = await owner.get(root + `rescue/cases/${lost}/matches`),
      results = await response.json();
    expect(results.map((c: { id: string }) => c.id)).toEqual([found]);
    expect(await response.text()).not.toContain('PRIVATE-');
    expect(results[0]).not.toHaveProperty('user_id');
    expect(results[0]).not.toHaveProperty('private_location');
  });
  test('واجهة البحث والذكرى والرابط المشترك والمطابقة تعمل على الهاتف', async ({
    page,
    context,
  }) => {
    await cookies(context, 'owner');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/social/settings');
    await page
      .getByRole('searchbox', { name: 'نص البحث في المنشورات', exact: true })
      .fill('SEARCH-PRIVATE-CANARY');
    await page
      .getByRole('button', { name: 'بحث المنشورات', exact: true })
      .click();
    await expect(
      page
        .locator('.social-body')
        .filter({ hasText: 'SEARCH-PRIVATE-CANARY حكاية رفيق' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'عرض القصص المميزة', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('link', { name: 'ذكرى الرفيق', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'رابط المشاركة', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'فتح المنشور المشترك', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'رفيق القصص', exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    mkdirSync('docs/evidence', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/shared-post-390.png',
      fullPage: true,
    });
    await page.goto('/adoption');
    await page
      .getByRole('button', { name: 'اقتراحات مفقود ومعثور', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'قطة معثور عليها اختبار',
        level: 4,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
});
