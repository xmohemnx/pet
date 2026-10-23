import { test, expect, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IdentityMe, MediaAsset } from '@petra/contracts';

test('دليل بصري جديد من commit نظيف وبيانات اختبار محفوظة فعلياً', async ({
  browser,
}) => {
  test.skip(
    process.env.PETRA_CAPTURE_SOCIAL_PROOF !== 'true',
    'Opt-in release evidence; run on a committed implementation',
  );
  test.setTimeout(180000);
  const dirty = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'apps',
      'packages',
      'infra',
      'scripts',
      'tests',
    ],
    { encoding: 'utf8' },
  ).trim();
  expect(
    dirty,
    'Commit the implementation and tests before capturing release evidence',
  ).toBe('');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    branch = execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim();
  const directory = `docs/evidence/social-rebuild/${commit.slice(0, 8)}`;
  mkdirSync(directory, { recursive: true });
  const file = `/tmp/petra-social-proof-${randomUUID()}.json`;
  let fixture: {
    accounts: Record<string, { id: string; cookie: string }>;
    clinicId: string;
  };
  try {
    execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
      env: process.env,
      stdio: 'pipe',
    });
    fixture = JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(file, { force: true });
  }
  const contexts: Record<string, BrowserContext> = {},
    root = 'http://127.0.0.1:4100/api/v1/';
  async function contextFor(role: string) {
    if (contexts[role]) return contexts[role];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    if (role !== 'public')
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
    contexts[role] = context;
    return context;
  }
  async function post(role: string, path: string, data: unknown = {}) {
    const response = await (
      await contextFor(role)
    ).request.post(root + path, {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data,
    });
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
    return response.json();
  }
  async function image(role: string, name: string) {
    return (
      await post(role, 'media', {
        dataBase64: readFileSync(`apps/web/public/images/${name}.png`).toString(
          'base64',
        ),
      })
    ).id as string;
  }
  const stamp = randomUUID().slice(0, 8),
    handle = `layan_${stamp}`;
  const photoA = await image('owner', 'companion'),
    photoB = await image('owner', 'companions'),
    photoC = await image('other', 'essentials'),
    photoD = await image('doctor', 'care');
  for (const [role, displayName, slug, avatar] of [
    ['owner', 'ليان · اختبار', handle, photoA],
    ['other', 'عمر · اختبار', `omar_${stamp}`, photoC],
    ['doctor', 'سارة · اختبار', `sara_${stamp}`, photoD],
  ] as const)
    await post(role, 'social/profile', {
      displayName,
      handle: slug,
      bio: 'حساب محلي وبيانات اختبار لإثبات واجهات Petra؛ لا يمثل مستخدماً حقيقياً.',
      privacy: 'public',
      avatarAssetId: avatar,
    });
  await post('doctor', 'social/posts', {
    body: 'الرعاية تبدأ بالاهتمام بالتفاصيل الصغيرة. هذه حكاية اختبار من بيئة محلية.',
    kind: 'post',
    visibility: 'public',
    assetIds: [photoD],
  });
  await post('other', 'social/posts', {
    body: 'كل ما يحتاجه يوم رفيقنا الصغير. منشور اختبار محلي، وليس إعلان بيع.',
    kind: 'post',
    visibility: 'public',
    assetIds: [photoC],
  });
  await post('owner', 'social/posts', {
    body: 'من يختار بقعة الشمس أولاً؟ لولو، دائماً. يوميات صغيرة تستحق أن نحتفظ بها. — منشور اختبار',
    kind: 'post',
    visibility: 'public',
    assetIds: [photoA, photoB],
    idempotencyKey: randomUUID(),
  });
  const story = await post('owner', 'social/posts', {
    body: 'لأنهم جزء من العائلة. — قصة اختبار',
    kind: 'story',
    visibility: 'public',
    assetId: photoB,
  });
  await post('doctor', 'social/posts', {
    body: 'لحظة طمأنينة. — قصة اختبار',
    kind: 'story',
    visibility: 'public',
    assetId: photoD,
  });
  await post('other', `social/users/${fixture.accounts.owner!.id}/follow`);
  await post('owner', `social/users/${fixture.accounts.other!.id}/follow`);
  await post('other', `social/messages/${fixture.accounts.owner!.id}`, {
    body: 'مرحباً ليان، كيف كانت زيارة لولو اليوم؟ — رسالة اختبار',
    idempotencyKey: randomUUID(),
  });
  await post('owner', `social/messages/${fixture.accounts.other!.id}`, {
    body: 'كانت بخير، شكراً لسؤالك! رفيقتنا تحبّ الاهتمام. — رسالة اختبار',
    idempotencyKey: randomUUID(),
  });
  await post('other', `social/messages/${fixture.accounts.owner!.id}`, {
    body: 'يسعدني سماع ذلك. ننتظر حكاياتها الجديدة. — رسالة اختبار',
    idempotencyKey: randomUUID(),
  });
  await post('manager', `clinics/${fixture.clinicId}/services`, {
    name: 'فحص بيطري شامل · خدمة اختبار',
    durationMinutes: 30,
  });
  const bytes = execFileSync('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-loop',
    '1',
    '-i',
    'apps/web/public/images/companion.png',
    '-t',
    '4',
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
  const movie = await post('other', 'media', {
    dataBase64: bytes.toString('base64'),
  });
  await expect
    .poll(
      async () => {
        const response = await (
          await contextFor('other')
        ).request.get(root + 'media');
        return ((await response.json()) as MediaAsset[]).find(
          (a) => a.id === movie.id,
        )?.status;
      },
      { timeout: 30000 },
    )
    .toBe('ready');
  const reel = await post('other', 'social/posts', {
    body: 'فيديو اختبار مُعدّ من صورة الهوية المفهومية لإثبات تشغيل المشاهد.',
    kind: 'reel',
    visibility: 'public',
    assetId: movie.id,
  });
  const screens = [
    {
      file: '01-home-1440.png',
      route: '/',
      width: 1440,
      role: 'public',
      title: 'الرئيسية على الحاسوب',
    },
    {
      file: '02-home-390.png',
      route: '/',
      width: 390,
      role: 'public',
      title: 'الرئيسية على الهاتف',
    },
    {
      file: '03-feed-1440.png',
      route: '/social',
      width: 1440,
      role: 'owner',
      title: 'موجز المجتمع على الحاسوب',
    },
    {
      file: '04-feed-390.png',
      route: '/social',
      width: 390,
      role: 'owner',
      title: 'موجز المجتمع على الهاتف',
    },
    {
      file: '05-reel-390.png',
      route: `/social/reels/${reel.id}`,
      width: 390,
      role: 'owner',
      title: 'مشاهد الريلز',
    },
    {
      file: '06-story-390.png',
      route: `/social/stories?start=${story.id}`,
      width: 390,
      role: 'owner',
      title: 'مشاهد القصص',
    },
    {
      file: '07-profile-1440.png',
      route: `/social/u/${handle}`,
      width: 1440,
      role: 'owner',
      title: 'الملف الشخصي على الحاسوب',
    },
    {
      file: '08-profile-390.png',
      route: `/social/u/${handle}`,
      width: 390,
      role: 'owner',
      title: 'الملف الشخصي على الهاتف',
    },
    {
      file: '09-inbox-1440.png',
      route: `/social/inbox/${fixture.accounts.other!.id}`,
      width: 1440,
      role: 'owner',
      title: 'Direct على الحاسوب',
    },
    {
      file: '10-inbox-390.png',
      route: `/social/inbox/${fixture.accounts.other!.id}`,
      width: 390,
      role: 'owner',
      title: 'Direct على الهاتف',
    },
    {
      file: '11-clinic-1440.png',
      route: `/clinic/${fixture.clinicId}`,
      width: 1440,
      role: 'manager',
      title: 'لوحة العيادة',
    },
    {
      file: '12-studio-390.png',
      route: '/social/create',
      width: 390,
      role: 'owner',
      title: 'استوديو إنشاء المحتوى',
    },
  ];
  const evidence = [];
  for (const screen of screens) {
    const context = await contextFor(screen.role);
    if (screen.role === 'manager') {
      const response = await context.request.get(root + 'me'),
        me = (await response.json()) as IdentityMe;
      const workspace = me.workspaces.find(
        (w) => w.persona === 'clinic_member' && w.clinicId === fixture.clinicId,
      );
      expect(workspace).toBeTruthy();
      await post('manager', 'me/active-workspace', {
        workspaceId: workspace!.id,
      });
    }
    const page = await context.newPage();
    await page.setViewportSize({
      width: screen.width,
      height: screen.width === 390 ? 844 : 1000,
    });
    await page.addInitScript(() => {
      const target = window as Window & {
        petraVitals?: {
          lcp: number | null;
          cls: number;
          interaction: number | null;
          events: number;
        };
      };
      target.petraVitals = { lcp: null, cls: 0, interaction: null, events: 0 };
      for (const type of [
        'largest-contentful-paint',
        'layout-shift',
        'event',
      ]) {
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const e = entry as PerformanceEntry & {
                value?: number;
                hadRecentInput?: boolean;
                interactionId?: number;
              };
              const v = target.petraVitals!;
              if (type === 'largest-contentful-paint') v.lcp = e.startTime;
              if (type === 'layout-shift' && !e.hadRecentInput)
                v.cls += e.value ?? 0;
              if (type === 'event' && e.interactionId) {
                v.events++;
                v.interaction = Math.max(v.interaction ?? 0, e.duration);
              }
            }
          }).observe({
            type,
            buffered: true,
            ...(type === 'event' ? { durationThreshold: 16 } : {}),
          });
        } catch {
          /* Unsupported metrics remain null, never invented. */
        }
      }
    });
    const response = await page.goto(screen.route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (screen.file.includes('story'))
      await page
        .getByRole('button', { name: 'إيقاف القصة مؤقتاً', exact: true })
        .click();
    for (const image of await page.locator('main img').all()) {
      if (!(await image.isVisible())) continue;
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (i: HTMLImageElement) => i.complete && i.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    if (screen.file.includes('reel')) {
      const video = page.locator('video');
      await video.evaluate(async (v) => {
        const element = v as HTMLVideoElement;
        element.muted = true;
        await element.play();
      });
      await expect
        .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
        .toBeGreaterThanOrEqual(2);
      await video.evaluate((v) => (v as HTMLVideoElement).pause());
    }
    await page.evaluate(() => scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      screen.file,
    ).toBe(true);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({
      path: `${directory}/${screen.file}`,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
    const viewportFile = screen.file.replace('.png', '-viewport.png');
    await page.screenshot({
      path: `${directory}/${viewportFile}`,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
    });
    evidence.push({
      ...screen,
      viewportFile,
      heading: await page.locator('h1').innerText(),
      capturedAt: new Date().toISOString(),
      capturedAtBaghdad: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Baghdad',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date()),
      metrics: await page.evaluate(
        () => (window as Window & { petraVitals?: unknown }).petraVitals,
      ),
    });
    await page.close();
  }
  const context = await contextFor('public'),
    page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/demo/social-directions');
  for (const [i, name] of [
    'يوميات الرفاق',
    'حكاية اليوم',
    'دوائر الرفقة',
  ].entries()) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.social-concept-bar > span')).toHaveText(name);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${directory}/direction-${i + 1}-1440.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.close();
  const noDemo = await (
    await contextFor('public')
  ).request.get('http://127.0.0.1:3200/demo/social-directions');
  expect(noDemo.status()).toBe(404);
  writeFileSync(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        commit,
        branch,
        browser: browser.version(),
        sourceClean: true,
        timezone: 'Asia/Baghdad',
        environment:
          'isolated local E2E database, actual API records and test accounts',
        mediaProvenance:
          'Existing conceptual Petra brand images per docs/ASSET_CREDITS.md. Test reel encoded from one existing conceptual image; not real customer footage.',
        performanceCaveat:
          'Warm local laboratory navigation, not production field metrics. interaction is longest observed event duration in this capture; null means no qualifying sample, not INP=0. CLS is observed capture-window total, not a field percentile.',
        screens: evidence,
      },
      null,
      2,
    ) + '\n',
  );
  await Promise.all(Object.values(contexts).map((c) => c.close()));
  console.log(
    `Captured ${screens.length} working screens and 3 explicitly labelled direction sketches from ${commit}`,
  );
});
