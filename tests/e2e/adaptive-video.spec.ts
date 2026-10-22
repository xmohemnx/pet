import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const root = 'http://127.0.0.1:4100',
  api = root + '/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let f: { accounts: Record<string, { id: string; cookie: string }> },
  owner: APIRequestContext,
  viewer: APIRequestContext,
  asset: string,
  otherAsset: string,
  master: string,
  playlist: string,
  segment: string,
  postId: string;
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(api + path, { data });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
const paths = (text: string) =>
  text.split('\n').filter((line) => line.startsWith('/api/v1/'));
test.describe
  .serial('Adaptive recorded video with per-segment authorization', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-hls-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, viewer] = await Promise.all(
      ['owner', 'other'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    for (const [c, name] of [
      [owner, 'ناشر فيديو متكيف'],
      [viewer, 'مشاهد فيديو متكيف'],
    ] as const)
      await post(c, 'social/profile', {
        displayName: name,
        bio: 'ملف اصطناعي لاختبار البث',
        privacy: 'public',
      });
    const video = execFileSync('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=640x360:r=24:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-metadata',
      'title=synthetic-source-metadata',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ]);
    asset = (
      await post(owner, 'media', { dataBase64: video.toString('base64') })
    ).id;
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT status FROM media_assets WHERE id=$1', [
              asset,
            ])
          ).rows[0].status,
        { timeout: 20000 },
      )
      .toBe('ready');
    postId = (
      await post(owner, 'social/posts', {
        body: 'فيديو متكيف اختباري خاص بالمتابعين',
        kind: 'post',
        visibility: 'followers',
        assetId: asset,
      })
    ).id;
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), viewer?.dispose()]);
    await db.end();
  });
  test('worker generates two bounded renditions and valid H264 segments without source metadata', async () => {
    const setting = await (await owner.get(api + `media/${asset}/hls`)).json();
    expect(setting.available).toBe(true);
    master = setting.manifest;
    const manifest = await owner.get(root + master);
    expect(manifest.headers()['content-type']).toContain(
      'application/vnd.apple.mpegurl',
    );
    const levels = paths(await manifest.text());
    expect(levels).toHaveLength(2);
    expect(new Set(levels).size).toBe(2);
    playlist = levels[0]!;
    const low = await owner.get(root + playlist);
    expect(await low.text()).toContain('#EXT-X-ENDLIST');
    segment = paths(await low.text())[0]!;
    expect(segment).toBeTruthy();
    const r = await owner.get(root + segment);
    expect(r.status()).toBe(200);
    expect(r.headers()['cache-control']).toBe('private, no-store');
    const output = `/tmp/petra-segment-${randomUUID()}.ts`;
    try {
      writeFileSync(output, await r.body(), { mode: 0o600 });
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,height:format_tags',
            '-of',
            'json',
            output,
          ],
          { encoding: 'utf8' },
        ),
      );
      expect(
        probe.streams.some(
          (s: { codec_name: string; height?: number }) =>
            s.codec_name === 'h264' && s.height! <= 240,
        ),
      ).toBe(true);
      expect(JSON.stringify(probe)).not.toContain('synthetic-source-metadata');
    } finally {
      rmSync(output, { force: true });
    }
    const rows = (
      await db.query(
        'SELECT kind,byte_count,storage_key FROM media_streams WHERE asset_id=$1',
        [asset],
      )
    ).rows;
    expect(rows.filter((r) => r.kind === 'master')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'playlist')).toHaveLength(2);
    expect(rows.reduce((sum, r) => sum + r.byte_count, 0)).toBeLessThan(
      16 * 1024 * 1024,
    );
    expect(JSON.stringify(rows)).not.toContain('.env');
  });
  test('every manifest and segment requires authorization, follows current policy and cannot change asset identity', async () => {
    const anonymous = await factory.newContext();
    try {
      for (const path of [master, playlist, segment])
        expect((await anonymous.get(root + path)).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
    for (const path of [master, playlist, segment])
      expect((await viewer.get(root + path)).status()).toBe(404);
    await post(viewer, `social/users/${f.accounts.owner!.id}/follow`);
    await post(owner, `social/users/${f.accounts.other!.id}/accept-follow`);
    for (const path of [master, playlist, segment])
      expect((await viewer.get(root + path)).status()).toBe(200);
    const image = execFileSync('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=30x30',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    otherAsset = (
      await post(owner, 'media', { dataBase64: image.toString('base64') })
    ).id;
    expect(
      (await owner.get(root + segment.replace(asset, otherAsset))).status(),
    ).toBe(404);
    expect((await owner.get(api + `media/${otherAsset}/hls`)).status()).toBe(
      404,
    );
    const id = segment.split('/').at(-1);
    await expect(
      db.query('UPDATE media_streams SET asset_id=$2 WHERE id=$1', [
        id,
        otherAsset,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('browser loads the adaptive playlist, decodes segments, selects a rendition and supports MP4 fallback', async ({
    page,
    context,
  }) => {
    await context.addCookies(
      f.accounts.owner!.cookie.split('; ').map((c) => {
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/social');
    const loaded = page.waitForResponse(
      (r) => r.url().includes(master) && r.status() === 200,
    );
    await page
      .getByRole('button', {
        name: 'اختيار تشغيل الفيديو المتكيف',
        exact: true,
      })
      .click();
    const video = page.locator('video[aria-label="فيديو المنشور"]');
    // Native HLS honors preload=none and starts fetching only after the explicit play action.
    const playing = video.evaluate((v) => (v as HTMLVideoElement).play());
    await loaded;
    await playing;
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.1);
    if (await page.getByLabel('جودة فيديو المنشور', { exact: true }).count())
      await page
        .getByLabel('جودة فيديو المنشور', { exact: true })
        .selectOption('0');
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/evidence/adaptive-video-390.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'العودة إلى MP4', exact: true })
      .click();
    await expect(video).toHaveAttribute('src', `/api/v1/media/${asset}/file`);
  });
  test('unpublishing revokes all derivatives and backup includes every ready stream file', async () => {
    await owner.delete(api + `social/posts/${postId}`);
    for (const path of [master, playlist, segment])
      expect((await viewer.get(root + path)).status()).toBe(404);
    const result = JSON.parse(
      execFileSync(process.execPath, ['scripts/verify-backup.mjs'], {
        env: process.env,
        stdio: 'pipe',
        timeout: 80000,
      }).toString(),
    );
    expect(result.status).toBe('verified');
    expect(result.tables).toBe(141);
    expect(result.protectionTriggers).toBe(73);
    const expected = (
      await db.query(
        "SELECT (SELECT count(*) FROM media_assets WHERE status='ready')+(SELECT count(*) FROM media_streams s JOIN media_assets a ON a.id=s.asset_id WHERE a.status='ready') n",
      )
    ).rows[0].n;
    expect(result.readyMedia).toBe(Number(expected));
  });
});
