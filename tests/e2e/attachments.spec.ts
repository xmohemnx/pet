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
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const png = execFileSync('ffmpeg', [
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
let f: { accounts: Record<string, { id: string; cookie: string }> },
  sender: APIRequestContext,
  recipient: APIRequestContext,
  stranger: APIRequestContext;
let audio: string, image: string, wav: Buffer, message: string;
const note = {
  body: 'مقطع صوتي اختباري بوصف نصي',
  idempotencyKey: randomUUID(),
};
async function post(c: APIRequestContext, path: string, body: unknown) {
  const r = await c.post(root + path, { data: body });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
const peer = () => f.accounts.other!.id;
async function ready(id: string) {
  await expect
    .poll(async () => {
      const list = await (
        await sender.get(root + `media?chatPeerId=${peer()}`)
      ).json();
      return list.find((a: { id: string }) => a.id === id)?.status;
    })
    .toBe('ready');
}
test.describe
  .serial('Private chat images and real FFmpeg Opus conversion', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-attachments-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [sender, recipient, stranger] = await Promise.all(
      ['owner', 'other', 'doctor'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    for (const [c, name] of [
      [sender, 'مرسل صوت اختباري'],
      [recipient, 'قرين صوت اختباري'],
      [stranger, 'غريب صوت اختباري'],
    ] as const)
      await post(c, 'social/profile', {
        displayName: name,
        bio: 'ملف اختبار اصطناعي',
        privacy: 'public',
      });
    const source = `/tmp/petra-tone-${randomUUID()}.wav`;
    try {
      execFileSync(
        'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1',
          '-metadata',
          'title=synthetic-private-metadata',
          '-y',
          source,
        ],
        { stdio: 'pipe' },
      );
      wav = readFileSync(source);
    } finally {
      rmSync(source, { force: true });
    }
  });
  test.afterAll(async () => {
    await Promise.all([
      sender?.dispose(),
      recipient?.dispose(),
      stranger?.dispose(),
    ]);
    await db.end();
  });
  test('audio needs a permitted conversation and a real bounded container; medical scope cannot be mixed', async () => {
    for (const data of [
      {
        dataBase64: Buffer.from('<html>not audio</html>').toString('base64'),
        chatPeerId: peer(),
        kind: 'audio',
      },
      { dataBase64: wav.toString('base64'), kind: 'audio' },
      {
        dataBase64: wav.toString('base64'),
        chatPeerId: peer(),
        petId: randomUUID(),
        kind: 'audio',
      },
    ])
      expect(
        (
          await recipient.post(root + 'media', {
            data: {
              ...data,
              ...('chatPeerId' in data
                ? { chatPeerId: f.accounts.owner!.id }
                : {}),
            },
          })
        ).status(),
      ).toBe(400);
    await post(stranger, 'social/profile', {
      displayName: 'غريب صوت اختباري',
      bio: 'خاص دون متابعة',
      privacy: 'private',
    });
    expect(
      (
        await sender.post(root + 'media', {
          data: {
            dataBase64: png.toString('base64'),
            chatPeerId: f.accounts.doctor!.id,
          },
        })
      ).status(),
    ).toBe(403);
    await post(stranger, 'social/profile', {
      displayName: 'غريب صوت اختباري',
      bio: 'ملف اختبار',
      privacy: 'public',
    });
  });
  test('worker converts actual WAV into stripped mono Opus and no recipient can read an unsent asset', async () => {
    audio = (
      await post(sender, 'media', {
        dataBase64: wav.toString('base64'),
        chatPeerId: peer(),
        kind: 'audio',
      })
    ).id;
    await ready(audio);
    const response = await sender.get(root + `media/${audio}/file`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('audio/ogg');
    const bytes = await response.body();
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(bytes.includes(Buffer.from('synthetic-private-metadata'))).toBe(
      false,
    );
    const output = `/tmp/petra-opus-${randomUUID()}.ogg`;
    try {
      writeFileSync(output, bytes, { mode: 0o600 });
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,channels:format=duration',
            '-of',
            'json',
            output,
          ],
          { encoding: 'utf8' },
        ),
      );
      expect(probe.streams[0]).toMatchObject({
        codec_name: 'opus',
        channels: 1,
      });
      expect(Number(probe.format.duration)).toBeGreaterThan(0);
    } finally {
      rmSync(output, { force: true });
    }
    expect((await recipient.get(root + `media/${audio}/file`)).status()).toBe(
      404,
    );
    expect((await stranger.get(root + `media/${audio}/file`)).status()).toBe(
      404,
    );
    expect(
      (await (await sender.get(root + 'media')).json()).some(
        (a: { id: string }) => a.id === audio,
      ),
    ).toBe(false);
  });
  test('streamed WebM without a duration header is measured after bounded conversion', async () => {
    const source = `/tmp/petra-stream-${randomUUID()}.webm`;
    let stream: Buffer;
    try {
      execFileSync(
        'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1',
          '-c:a',
          'libopus',
          '-f',
          'webm',
          '-live',
          '1',
          '-y',
          source,
        ],
        { stdio: 'pipe' },
      );
      stream = readFileSync(source);
    } finally {
      rmSync(source, { force: true });
    }
    const a = await post(sender, 'media', {
      dataBase64: stream!.toString('base64'),
      chatPeerId: peer(),
      kind: 'audio',
    });
    await ready(a.id);
    expect((await sender.get(root + `media/${a.id}/file`)).status()).toBe(200);
  });
  test('message attachment is bound to sender and peer, replay includes attachment identity and raw SQL cannot republish', async () => {
    const payload = { ...note, assetId: audio };
    message = (await post(sender, `social/messages/${peer()}`, payload)).id;
    expect((await post(sender, `social/messages/${peer()}`, payload)).id).toBe(
      message,
    );
    image = (
      await post(sender, 'media', {
        dataBase64: png.toString('base64'),
        chatPeerId: peer(),
      })
    ).id;
    expect(
      (
        await sender.post(root + `social/messages/${peer()}`, {
          data: { ...payload, assetId: image },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await sender.post(root + `social/messages/${f.accounts.doctor!.id}`, {
          data: { ...payload, idempotencyKey: randomUUID() },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await recipient.post(root + `social/messages/${f.accounts.owner!.id}`, {
          data: { ...payload, idempotencyKey: randomUUID() },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await sender.post(root + 'social/posts', {
          data: {
            body: 'محاولة نشر مرفق خاص',
            visibility: 'public',
            kind: 'post',
            assetId: image,
          },
        })
      ).status(),
    ).toBe(400);
    await expect(
      db.query(
        "INSERT INTO social_posts(user_id,body,visibility,kind,asset_id) VALUES($1,'ممنوع','public','post',$2)",
        [f.accounts.owner!.id, image],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('UPDATE media_assets SET chat_peer_id=NULL WHERE id=$1', [
        image,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('UPDATE direct_messages SET asset_id=$2 WHERE id=$1', [
        message,
        image,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  test('only delivered attachments become readable; current privacy is rechecked on every request', async () => {
    const response = await recipient.get(root + `media/${audio}/file`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect((await recipient.get(root + `media/${image}/file`)).status()).toBe(
      404,
    );
    await post(sender, `social/messages/${peer()}`, {
      body: 'صورة محادثة خاصة',
      assetId: image,
      idempotencyKey: randomUUID(),
    });
    expect((await recipient.get(root + `media/${image}/file`)).status()).toBe(
      200,
    );
    await post(recipient, 'social/profile', {
      displayName: 'قرين صوت اختباري',
      bio: 'خاص',
      privacy: 'private',
    });
    expect((await recipient.get(root + `media/${audio}/file`)).status()).toBe(
      403,
    );
    await post(recipient, 'social/profile', {
      displayName: 'قرين صوت اختباري',
      bio: 'ملف اختبار',
      privacy: 'public',
    });
  });
  test('sender privacy and follow revocation deny every delivered video file and HLS resource', async () => {
    const [author, reader] = await Promise.all(
      ['manager', 'stranger'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    const targetPeer = f.accounts.stranger!.id;
    try {
      for (const [client, name] of [
        [author, 'مرسل تحقق الخصوصية'],
        [reader, 'مستلم تحقق الخصوصية'],
      ] as const)
        await post(client, 'social/profile', {
          displayName: name,
          bio: 'اختبار معزول',
          privacy: 'public',
        });
      const bytes = execFileSync('ffmpeg', [
        '-nostdin',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x240:r=24:d=1',
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
      const video = (
        await post(author, 'media', {
          dataBase64: bytes.toString('base64'),
          chatPeerId: targetPeer,
        })
      ).id;
      await expect
        .poll(
          async () =>
            (
              await db.query('SELECT status FROM media_assets WHERE id=$1', [
                video,
              ])
            ).rows[0]?.status,
        )
        .toBe('ready');
      await post(author, `social/messages/${targetPeer}`, {
        body: 'فيديو خاص للتحقق من سحب الخصوصية',
        assetId: video,
        idempotencyKey: randomUUID(),
      });
      const hls = await (await reader.get(root + `media/${video}/hls`)).json();
      expect(hls.available).toBe(true);
      const manifest = await reader.get(origin + hls.manifest);
      expect(manifest.status()).toBe(200);
      const playlist = (await manifest.text())
        .split('\n')
        .find((line) => line.startsWith('/api/v1/'))!;
      const list = await reader.get(origin + playlist);
      expect(list.status()).toBe(200);
      const segment = (await list.text())
        .split('\n')
        .find((line) => line.startsWith('/api/v1/'))!;
      const resources = [
        root + `media/${video}/file`,
        root + `media/${video}/hls`,
        origin + hls.manifest,
        origin + playlist,
        origin + segment,
      ];
      for (const resource of resources)
        expect((await reader.get(resource)).status()).toBe(200);
      await post(author, 'social/profile', {
        displayName: 'مرسل صوت اختباري',
        bio: 'خاص',
        privacy: 'private',
      });
      expect(
        (
          await reader.get(root + `social/messages/${f.accounts.manager!.id}`)
        ).status(),
      ).toBe(403);
      for (const resource of resources)
        expect((await reader.get(resource)).status()).toBe(403);
      expect((await author.get(root + `media/${video}/file`)).status()).toBe(
        200,
      );
      await post(reader, `social/users/${f.accounts.manager!.id}/follow`, {});
      await post(author, `social/users/${targetPeer}/accept-follow`, {});
      for (const resource of resources)
        expect((await reader.get(resource)).status()).toBe(200);
      expect(
        (
          await reader.delete(
            root + `social/users/${f.accounts.manager!.id}/follow`,
          )
        ).status(),
      ).toBe(200);
      for (const resource of resources)
        expect((await reader.get(resource)).status()).toBe(403);
      await post(author, 'social/profile', {
        displayName: 'مرسل صوت اختباري',
        bio: 'ملف اختبار',
        privacy: 'public',
      });
    } finally {
      await Promise.all([author.dispose(), reader.dispose()]);
    }
  });
  test('mobile UI uploads, selects and sends a conversation image, with accessible private audio playback', async ({
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
    await page.goto('/social/settings');
    await page
      .locator('.care-list-row')
      .filter({
        has: page.getByRole('heading', {
          name: 'قرين صوت اختباري',
          exact: true,
        }),
      })
      .getByRole('button', { name: 'مراسلة', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'رسائل · قرين صوت اختباري',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('audio[aria-label="مقطع صوتي خاص"]')).toHaveCount(
      1,
    );
    await page.getByText('صوت أو مرفق خاص للمحادثة', { exact: true }).click();
    await page.getByLabel('ملف المحادثة الخاص', { exact: true }).setInputFiles({
      name: 'private.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await page
      .getByRole('button', { name: 'رفع مرفق المحادثة', exact: true })
      .click();
    await expect(
      page.getByText('تم اختيار مرفق خاص للرسالة التالية.', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('نص الرسالة', { exact: true })
      .fill('إرسال صورة خاصة من واجهة الهاتف');
    await page
      .getByRole('button', { name: 'إرسال الرسالة', exact: true })
      .click();
    await expect(
      page.getByText('إرسال صورة خاصة من واجهة الهاتف', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('تم اختيار مرفق خاص للرسالة التالية.', { exact: true }),
    ).toHaveCount(0);
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
      path: 'docs/evidence/chat-attachments-390.png',
      fullPage: true,
    });
  });
  test('blocking revokes recipient file access while the sender retains its original', async () => {
    await post(recipient, `social/users/${f.accounts.owner!.id}/block`, {});
    expect((await recipient.get(root + `media/${audio}/file`)).status()).toBe(
      404,
    );
    expect((await recipient.get(root + `media/${image}/file`)).status()).toBe(
      404,
    );
    expect((await sender.get(root + `media/${audio}/file`)).status()).toBe(200);
  });
});
