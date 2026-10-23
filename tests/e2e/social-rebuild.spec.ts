import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: {
  accounts: Record<string, { id: string; cookie: string }>;
  clinicId: string;
};
const clients: Record<string, APIRequestContext> = {};
let photos: string[], album: string, handle: string;
async function post(role: string, path: string, data: unknown = {}) {
  const r = await clients[role]!.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
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
test.describe.serial('شريحة السوشل: ألبوم وموجز وملف وتفاعل وخصوصية', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-social-rebuild-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    for (const role of ['owner', 'other', 'doctor'])
      clients[role] = await factory.newContext({
        extraHTTPHeaders: {
          Origin: origin,
          Cookie: fixture.accounts[role]!.cookie,
        },
      });
    handle = `social_${randomUUID().slice(0, 8)}`;
    await post('owner', 'social/profile', {
      displayName: 'ليان — حساب اختبار',
      handle,
      bio: 'يوميات رفيقتي لولو، بيانات محلية للاختبار',
      privacy: 'public',
    });
    await post('other', 'social/profile', {
      displayName: 'سارة — حساب اختبار',
      bio: '',
      privacy: 'public',
    });
    await post('doctor', 'social/profile', {
      displayName: 'طبيب — حساب اختبار',
      bio: '',
      privacy: 'private',
    });
    photos = [];
    for (const image of ['companion.png', 'companions.png'])
      photos.push(
        (
          await post('owner', 'media', {
            dataBase64: readFileSync(
              `apps/web/public/images/${image}`,
            ).toString('base64'),
          })
        ).id,
      );
  });
  test.afterAll(async () => {
    await Promise.all(Object.values(clients).map((c) => c.dispose()));
    await db.end();
  });
  test('الألبوم يحفظ ترتيب الوسائط وإعادة المحاولة لا تنشئ منشوراً ثانياً', async () => {
    const payload = {
      body: 'ألبوم رفيقتي — اختبار محلي',
      visibility: 'public',
      kind: 'post',
      assetIds: photos,
      idempotencyKey: randomUUID(),
    };
    const created = await post('owner', 'social/posts', payload);
    album = created.id;
    expect((await post('owner', 'social/posts', payload)).id).toBe(album);
    expect(
      (
        await clients.owner!.post(root + 'social/posts', {
          data: { ...payload, body: 'نص مختلف' },
        })
      ).status(),
    ).toBe(409);
    const detail = await (
      await clients.other!.get(root + `social/posts/${album}`)
    ).json();
    expect(
      detail.post.media.map((a: { asset_id: string }) => a.asset_id),
    ).toEqual(photos);
    for (const id of photos)
      expect(
        (await clients.other!.get(root + `media/${id}/file`)).status(),
      ).toBe(200);
    expect(
      (
        await clients.owner!.post(root + 'social/posts', {
          data: {
            ...payload,
            idempotencyKey: randomUUID(),
            assetIds: [photos[0], photos[0]],
          },
        })
      ).status(),
    ).toBe(400);
  });
  test('المعرف فريد، ومرفق طبي أو خاص بالمحادثة أو غير جاهز لا يصبح اجتماعياً', async () => {
    expect(
      (
        await clients.other!.post(root + 'social/profile', {
          data: { displayName: 'متعارض', handle, bio: '', privacy: 'public' },
        })
      ).status(),
    ).toBe(409);
    const pet = await post('owner', 'pets', {
      name: 'حيوان خصوصية الاختبار',
      species: 'cat',
      sex: 'female',
    });
    const dataBase64 = readFileSync(
      'apps/web/public/images/companion.png',
    ).toString('base64');
    const medical = await post('owner', 'media', { dataBase64, petId: pet.id });
    const chat = await post('owner', 'media', {
      dataBase64,
      chatPeerId: fixture.accounts.other!.id,
    });
    const pending = await post('owner', 'media', { dataBase64 });
    await db.query("UPDATE media_assets SET status='processing' WHERE id=$1", [
      pending.id,
    ]);
    for (const id of [medical.id, chat.id, pending.id]) {
      await expect(
        db.query(
          'INSERT INTO social_post_media(post_id,asset_id,position) VALUES($1,$2,2)',
          [album, id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query(
          'UPDATE social_profiles SET avatar_asset_id=$1 WHERE user_id=$2',
          [id, fixture.accounts.owner!.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (
          await clients.owner!.post(root + 'social/posts', {
            data: {
              body: 'محاولة ممنوعة',
              visibility: 'public',
              kind: 'post',
              assetIds: [photos[0], id],
            },
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await clients.owner!.post(root + 'social/profile', {
            data: {
              displayName: 'ليان — حساب اختبار',
              bio: '',
              privacy: 'public',
              avatarAssetId: id,
            },
          })
        ).status(),
      ).toBe(400);
    }
    expect(
      (
        await clients.other!.post(root + 'social/posts', {
          data: {
            body: 'وسيط لا أملكه',
            visibility: 'public',
            kind: 'post',
            assetIds: [photos[1]],
          },
        })
      ).status(),
    ).toBe(400);
    await db.query("UPDATE media_assets SET status='ready' WHERE id=$1", [
      pending.id,
    ]);
  });
  test('الخاص والحظر يسحبان الألبوم والملف وكل صور الألبوم عبر API وروابط مباشرة', async () => {
    await post('owner', 'social/profile', {
      displayName: 'ليان — حساب اختبار',
      bio: 'PRIVATE-BIO-CANARY',
      privacy: 'private',
    });
    expect(
      (await clients.other!.get(root + `social/posts/${album}`)).status(),
    ).toBe(404);
    const profile = await (
      await clients.other!.get(root + `social/profiles/${handle}`)
    ).json();
    expect(profile.canView).toBe(false);
    expect(profile.profile.bio).toBe('');
    for (const id of photos)
      expect(
        (await clients.other!.get(root + `media/${id}/file`)).status(),
      ).toBe(404);
    const people = await (
      await clients.other!.get(root + 'social/people')
    ).json();
    expect(
      people.find((p: { handle: string }) => p.handle === handle).bio,
    ).toBe('');
    await post('other', `social/users/${fixture.accounts.owner!.id}/follow`);
    const pendingFeed = await (
      await clients.other!.get(root + 'social/timeline?scope=following')
    ).json();
    expect(pendingFeed.items.some((p: { id: string }) => p.id === album)).toBe(
      false,
    );
    await post(
      'owner',
      `social/users/${fixture.accounts.other!.id}/accept-follow`,
    );
    const acceptedFeed = await (
      await clients.other!.get(root + 'social/timeline?scope=following')
    ).json();
    expect(acceptedFeed.items.some((p: { id: string }) => p.id === album)).toBe(
      true,
    );
    expect(
      (await clients.other!.get(root + `social/posts/${album}`)).status(),
    ).toBe(200);
    await post('owner', `social/users/${fixture.accounts.other!.id}/block`);
    for (const path of [
      `social/posts/${album}`,
      `social/profiles/${handle}`,
      `social/messages/${fixture.accounts.owner!.id}`,
      ...photos.map((id) => `media/${id}/file`),
    ])
      expect((await clients.other!.get(root + path)).status()).toBe(404);
    expect(
      (
        await clients.owner!.delete(
          root + `social/users/${fixture.accounts.other!.id}/block`,
        )
      ).status(),
    ).toBe(200);
    await post('owner', 'social/profile', {
      displayName: 'ليان — حساب اختبار',
      bio: 'يوميات رفيقتي لولو — اختبار محلي',
      privacy: 'public',
    });
  });
  test('مؤشر الموجز لا يسقط أو يكرر منشوراً عند تساوي الوقت', async () => {
    const term = `CURSOR-${randomUUID()}`;
    await db.query(
      "INSERT INTO social_posts(user_id,body,visibility,kind,created_at) SELECT $1,$2||n::text,'public','post','2026-01-01T00:00:00.123456Z' FROM generate_series(1,32)n",
      [fixture.accounts.owner!.id, term],
    );
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ q: term });
      if (cursor) params.set('cursor', cursor);
      const response = await clients.owner!.get(
        root + `social/timeline?${params}`,
      );
      expect(response.status()).toBe(200);
      const result = await response.json();
      ids.push(...result.items.map((p: { id: string }) => p.id));
      cursor = result.nextCursor;
      expect(ids.length).toBeLessThanOrEqual(32);
    } while (cursor);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    expect(
      (
        await clients.owner!.get(root + 'social/timeline?cursor=invalid')
      ).status(),
    ).toBe(400);
  });
  test('نشر صورتين من المتصفح ثم إعجاب وحفظ وتعليق وملف تبقى بعد refresh', async ({
    page,
    context,
  }) => {
    await cookies(context, 'owner');
    // The preceding media boundary checks deliberately use this actor's upload quota.
    // Start the separate UI scenario in a fresh admission window in the isolated fixture DB.
    await db.query(
      "UPDATE media_upload_limits SET window_started_at=now()-interval '61 seconds' WHERE user_id=$1",
      [fixture.accounts.owner!.id],
    );
    await db.query(
      "DELETE FROM action_limits WHERE actor_id=$1 AND action='media'",
      [fixture.accounts.owner!.id],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/social/create');
    await expect(page.locator('input[type=file]')).toBeEnabled();
    await page
      .locator('input[type=file]')
      .setInputFiles([
        'apps/web/public/images/companion.png',
        'apps/web/public/images/companions.png',
      ]);
    await expect(
      page.getByRole('img', { name: 'صورة مختارة للنشر', exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole('button', { name: 'التالي: كتابة الحكاية', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'حكاية المنشور', exact: true })
      .fill('حكاية مصورة محفوظة من واجهة الاختبار');
    await page
      .getByRole('button', { name: 'نشر الحكاية', exact: true })
      .click();
    await expect(page).toHaveURL(/\/social\/posts\/[a-f0-9-]+$/);
    await page
      .getByRole('button', { name: 'الصورة التالية', exact: true })
      .click();
    await expect(page.getByRole('img', { name: /صورة 2 من 2/ })).toBeVisible();
    await page.getByRole('button', { name: 'إعجاب', exact: true }).click();
    await page
      .getByRole('button', { name: 'حفظ المنشور', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'تعليقك', exact: true })
      .fill('تعليق محفوظ من المتصفح');
    await page
      .getByRole('button', { name: 'إرسال التعليق', exact: true })
      .click();
    await expect(
      page.getByText('ليان — حساب اختبار · تعليق محفوظ من المتصفح', {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'إلغاء الإعجاب', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'إلغاء الحفظ', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.social-post-header .social-account').click();
    await expect(page).toHaveURL(new RegExp(`/social/u/${handle}$`));
    await expect(
      page.getByRole('heading', { name: 'ليان — حساب اختبار', exact: true }),
    ).toBeVisible();
    await page
      .getByText('تعديل الاسم والمعرّف والصورة', { exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'نبذة', exact: true })
      .fill('نبذة وصورة محفوظتان من صفحة الملف الجديد');
    await page
      .getByRole('combobox', { name: 'الصورة الشخصية', exact: true })
      .selectOption(photos[0]!);
    await page
      .getByRole('button', { name: 'حفظ الملف الشخصي', exact: true })
      .click();
    await expect(page.getByText('تم الحفظ', { exact: true })).toBeVisible();
    await page.reload();
    await page
      .getByText('تعديل الاسم والمعرّف والصورة', { exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'نبذة', exact: true }),
    ).toHaveValue('نبذة وصورة محفوظتان من صفحة الملف الجديد');
    const savedProfile = await (
      await clients.owner!.get(root + 'social/profile')
    ).json();
    expect(savedProfile.avatar_asset_id).toBe(photos[0]);
  });
  test('فشل الشبكة يعيد التفاعل إلى حالته ولا يدّعي الحفظ', async ({
    page,
    context,
  }) => {
    await cookies(context, 'other');
    await page.goto(`/social/posts/${album}`);
    const like = page.getByRole('button', { name: 'إعجاب', exact: true });
    await context.setOffline(true);
    try {
      await like.click();
      await expect(
        page.locator('.social-post').getByRole('alert'),
      ).toContainText(/تعذر|fetch|Failed/i);
      await expect(like).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await context.setOffline(false);
    }
    const result = await (
      await clients.other!.get(root + `social/posts/${album}`)
    ).json();
    expect(result.post.liked).toBe(false);
  });
  test('صندوق Direct المستقل يحفظ الرسالة ويعرضها مرة واحدة بعد إعادة الفتح', async ({
    page,
    context,
  }) => {
    const greeting = 'تحية خاصة من سارة — اختبار الصندوق الجديد';
    await post('other', `social/messages/${fixture.accounts.owner!.id}`, {
      body: greeting,
      idempotencyKey: randomUUID(),
    });
    await cookies(context, 'owner');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/social/inbox');
    await page
      .locator('.social-thread')
      .filter({ hasText: 'سارة — حساب اختبار' })
      .click();
    await expect(
      page
        .locator('.social-chat-messages')
        .getByText(greeting, { exact: true }),
    ).toBeVisible();
    const reply = 'رد محفوظ من صندوق الرسائل الجديد';
    await page
      .getByRole('textbox', { name: 'نص الرسالة', exact: true })
      .fill(reply);
    await page
      .getByRole('button', { name: 'إرسال الرسالة', exact: true })
      .click();
    await expect(
      page.locator('.social-chat-messages').getByText(reply, { exact: true }),
    ).toHaveCount(1);
    await page.reload();
    await expect(
      page.locator('.social-chat-messages').getByText(reply, { exact: true }),
    ).toHaveCount(1);
    const messages = await (
      await clients.other!.get(
        root + `social/messages/${fixture.accounts.owner!.id}`,
      )
    ).json();
    expect(
      messages.filter((m: { body: string }) => m.body === reply),
    ).toHaveLength(1);
  });
  test('مشاهد القصة يسجل المشاهدة ثم يزيل الصورة عند انتهاء الصلاحية', async ({
    page,
    context,
  }) => {
    const asset = await post('other', 'media', {
      dataBase64: readFileSync('apps/web/public/images/care.png').toString(
        'base64',
      ),
    });
    const story = await post('other', 'social/posts', {
      body: 'قصة اختبار مؤقتة',
      kind: 'story',
      visibility: 'public',
      assetId: asset.id,
    });
    await cookies(context, 'owner');
    await page.goto(`/social/stories?start=${story.id}`);
    await page
      .getByRole('button', { name: 'إيقاف القصة مؤقتاً', exact: true })
      .click();
    await expect(
      page.getByRole('img', { name: 'قصة سارة — حساب اختبار', exact: true }),
    ).toBeVisible();
    const viewers = await (
      await clients.other!.get(root + `social/posts/${story.id}/viewers`)
    ).json();
    expect(
      viewers.some(
        (v: { display_name: string }) =>
          v.display_name === 'ليان — حساب اختبار',
      ),
    ).toBe(true);
    await db.query(
      "UPDATE social_posts SET expires_at=now()-interval '1 second' WHERE id=$1",
      [story.id],
    );
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'لا قصص متاحة الآن.', exact: true }),
    ).toBeVisible();
    expect(
      (await clients.owner!.get(root + `social/posts/${story.id}`)).status(),
    ).toBe(404);
    expect(
      (await clients.owner!.get(root + `media/${asset.id}/file`)).status(),
    ).toBe(404);
  });
  test('مشاهد الريل يشغل فيديو جاهزاً واحداً ويوقفه عند مغادرة مساحة العرض', async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const video = execFileSync('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-loop',
      '1',
      '-i',
      'apps/web/public/images/companion.png',
      '-t',
      '3',
      '-vf',
      'scale=360:640:force_original_aspect_ratio=increase,crop=360:640',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ]);
    const asset = await post('other', 'media', {
      dataBase64: video.toString('base64'),
    });
    await expect
      .poll(
        async () =>
          (await (await clients.other!.get(root + 'media')).json()).find(
            (a: { id: string }) => a.id === asset.id,
          )?.status,
        { timeout: 30000 },
      )
      .toBe('ready');
    const reel = await post('other', 'social/posts', {
      body: 'فيديو اختبار من صورة الهوية المفهومية',
      kind: 'reel',
      visibility: 'public',
      assetId: asset.id,
    });
    await cookies(context, 'owner');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`/social/reels/${reel.id}`);
    const element = page.locator('video');
    await expect(element).toHaveCount(1);
    await expect
      .poll(() => element.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    expect(await element.evaluate((v) => (v as HTMLVideoElement).muted)).toBe(
      true,
    );
    await page.setViewportSize({ width: 390, height: 300 });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() => element.evaluate((v) => (v as HTMLVideoElement).paused))
      .toBe(true);
  });
  test('الموجز والملف والاستوديو وصندوق الرسائل تستوفي RTL وkeyboard والوصول', async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await cookies(context, 'owner');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const route of [
      '/social',
      `/social/u/${handle}`,
      '/social/create',
      '/social/inbox',
      '/social/reels',
      '/social/stories',
    ]) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} ${width}`,
        ).toBe(true);
      }
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(scan.violations, route).toEqual([]);
    }
    await page.goto('/social');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'انتقل إلى المحتوى', exact: true }),
    ).toBeFocused();
  });
});
