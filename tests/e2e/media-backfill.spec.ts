import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
} from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const run = promisify(execFile);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const api = 'http://127.0.0.1:4100/api/v1/';
const root = process.env.PETRA_MEDIA_ROOT!;
let f: { accounts: Record<string, { id: string; cookie: string }> };
let owner: APIRequestContext, other: APIRequestContext;
let video: Buffer, legacy: string, medical: string;
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
async function backfill(...args: string[]) {
  const r = await run(process.execPath, ['scripts/backfill-hls.mjs', ...args], {
    env: process.env,
  });
  return JSON.parse(r.stdout);
}
async function insert(id: string, petId: string | null = null) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(join(root, `${id}.mp4`), video, { mode: 0o600, flag: 'wx' });
  await db.query(
    "INSERT INTO media_assets(id,owner_id,kind,status,mime,byte_count,storage_key,pet_id,chat_peer_id) VALUES($1,$2,'video','ready','video/mp4',$3,$4,$5,$6)",
    [
      id,
      f.accounts.owner!.id,
      video.length,
      `${id}.mp4`,
      petId,
      petId ? null : f.accounts.other!.id,
    ],
  );
}

test.describe
  .serial('Legacy HLS maintenance preserves originals and private access', () => {
  test.beforeAll(async () => {
    const fixture = `/tmp/petra-backfill-${randomUUID()}.json`;
    try {
      execFileSync(
        process.execPath,
        ['scripts/seed-platform-test.mjs', fixture],
        { env: process.env, stdio: 'pipe' },
      );
      f = JSON.parse(readFileSync(fixture, 'utf8'));
    } finally {
      rmSync(fixture, { force: true });
    }
    [owner, other] = await Promise.all(
      ['owner', 'other'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: 'http://127.0.0.1:3100',
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
    video = execFileSync('ffmpeg', [
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
    for (const c of [owner, other])
      expect(
        (
          await c.post(api + 'social/profile', {
            data: {
              displayName: 'اختبار تهيئة فيديو قديم',
              bio: '',
              privacy: 'public',
            },
          })
        ).status(),
      ).toBe(201);
    const pet = await owner.post(api + 'pets', {
      data: { name: 'حيوان اختبار', species: 'cat', sex: 'unknown' },
    });
    expect(pet.status()).toBe(201);
    legacy = randomUUID();
    medical = randomUUID();
    await insert(legacy);
    await insert(medical, (await pet.json()).id);
  });
  test.afterAll(async () => {
    await Promise.all([owner?.dispose(), other?.dispose()]);
    await db.end();
  });
  test('default dry run leaves database and original bytes intact and excludes medical video', async () => {
    const result = await backfill('--limit=100');
    expect(result.dryRun).toBe(true);
    expect(result.candidates).toBeGreaterThanOrEqual(1);
    expect(result.completed).toBe(0);
    expect(
      (
        await db.query('SELECT id FROM media_streams WHERE asset_id=ANY($1)', [
          [legacy, medical],
        ])
      ).rows,
    ).toEqual([]);
    expect(hash(readFileSync(join(root, `${legacy}.mp4`)))).toBe(hash(video));
    expect((await owner.get(api + `media/${legacy}/hls`)).status()).toBe(200);
    expect((await other.get(api + `media/${legacy}/hls`)).status()).toBe(404);
  });
  test('concurrent batches create one rendition set, preserve privacy, and safely repeat', async () => {
    const results = await Promise.all([
      backfill('--apply', '--limit=100'),
      backfill('--apply', '--limit=100'),
    ]);
    expect(results.reduce((sum, r) => sum + r.failed, 0)).toBe(0);
    const streams = (
      await db.query('SELECT kind,id FROM media_streams WHERE asset_id=$1', [
        legacy,
      ])
    ).rows;
    expect(streams.filter((s) => s.kind === 'master')).toHaveLength(1);
    expect(streams.filter((s) => s.kind === 'playlist')).toHaveLength(2);
    expect(
      (
        await db.query('SELECT id FROM media_streams WHERE asset_id=$1', [
          medical,
        ])
      ).rows,
    ).toEqual([]);
    for (const stream of streams) {
      const path = api + `media/${legacy}/streams/${stream.id}`;
      expect((await owner.get(path)).status()).toBe(200);
      expect((await other.get(path)).status()).toBe(404);
    }
    expect((await backfill('--apply', '--limit=100')).completed).toBe(0);
    expect(hash(readFileSync(join(root, `${legacy}.mp4`)))).toBe(hash(video));
    expect(
      (
        await db.query(
          'SELECT status,storage_key FROM media_assets WHERE id=$1',
          [legacy],
        )
      ).rows[0],
    ).toEqual({ status: 'ready', storage_key: `${legacy}.mp4` });
  });
  test('unreadable or symlinked sources keep MP4 playback and permit a repaired retry', async () => {
    const id = randomUUID();
    await insert(id);
    const path = join(root, `${id}.mp4`);
    writeFileSync(path, Buffer.from('unreadable legacy video'), {
      mode: 0o600,
    });
    await expect(backfill('--apply', '--limit=100')).rejects.toMatchObject({
      code: 1,
    });
    expect(readFileSync(path).toString()).toBe('unreadable legacy video');
    expect(
      (await db.query('SELECT id FROM media_streams WHERE asset_id=$1', [id]))
        .rows,
    ).toEqual([]);
    rmSync(path);
    symlinkSync(join(root, `${legacy}.mp4`), path);
    try {
      await expect(backfill('--apply', '--limit=100')).rejects.toMatchObject({
        code: 1,
      });
      expect(
        (await db.query('SELECT id FROM media_streams WHERE asset_id=$1', [id]))
          .rows,
      ).toEqual([]);
      expect(
        (await db.query('SELECT status FROM media_assets WHERE id=$1', [id]))
          .rows[0].status,
      ).toBe('ready');
    } finally {
      rmSync(path, { force: true });
      writeFileSync(path, video, { mode: 0o600, flag: 'wx' });
    }
    expect((await backfill('--apply', '--limit=100')).completed).toBe(1);
    expect((await owner.get(api + `media/${id}/file`)).status()).toBe(200);
    expect(hash(readFileSync(path))).toBe(hash(video));
    expect(
      readdirSync(root).filter((name) => name.startsWith('hls-backfill-')),
    ).toEqual([]);
  });
  test('invalid batch bounds are rejected before work', async () => {
    for (const arg of [
      '--limit=0',
      '--limit=101',
      '--limit=1.5',
      '--limit=NaN',
    ])
      await expect(backfill('--apply', arg)).rejects.toMatchObject({ code: 1 });
  });
});
