import { loadEnvFile } from 'node:process';
loadEnvFile(new URL('../.env', import.meta.url));
// Explicit local provider test. Credentials are generated outside Git and never printed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import pg from 'pg';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteBucketCommand,
} = require('@aws-sdk/client-s3');
const credentials = JSON.parse(
  readFileSync(
    new URL('../.data/provider-check/credentials.json', import.meta.url),
    'utf8',
  ),
);
Object.assign(process.env, {
  APP_ENV: 'local',
  MEDIA_STORAGE_BACKEND: 's3',
  PETRA_S3_ENDPOINT: 'http://127.0.0.1:4933',
  PETRA_S3_BUCKET: 'petra-private-test',
  PETRA_S3_ACCESS_KEY_ID: credentials.access,
  PETRA_S3_SECRET_ACCESS_KEY: credentials.secret,
  PETRA_MEDIA_ENCRYPTION_KEY: Buffer.from(
    credentials.encryption,
    'hex',
  ).toString('base64'),
  PETRA_CLAMAV_SOCKET: new URL(
    '../.data/provider-check/scan/clamd.sock',
    import.meta.url,
  ).pathname,
});
const { PrivateStorage } =
  await import('../apps/api/dist/apps/api/src/media/private-storage.js');
const { scanMedia, scannerVersion, UnsafeMediaError } =
  await import('../apps/api/dist/apps/api/src/media/antivirus.js');
const storage = new PrivateStorage(),
  checks = [],
  objects = [];
try {
  try {
    await storage.client.send(
      new CreateBucketCommand({ Bucket: storage.bucket }),
    );
  } catch (e) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(e.name))
      throw e;
  }
  await storage.privateBucket();
  checks.push('private-bucket-acl-policy');
  const path = `${randomUUID()}.webp`,
    payload = Buffer.from('Synthetic private media, never user data');
  objects.push(path);
  await storage.put(path, payload);
  assert.deepEqual(await storage.get(path, 1024), payload);
  const result = await storage.client.send(
    new GetObjectCommand({ Bucket: storage.bucket, Key: path }),
  );
  const ciphertext = Buffer.from(await result.Body.transformToByteArray());
  assert.equal(ciphertext.includes(payload), false);
  checks.push('encrypted-storage-roundtrip');
  const unsigned = await globalThis.fetch(
    `http://127.0.0.1:4933/${storage.bucket}/${path}`,
    { redirect: 'error' },
  );
  assert.ok([401, 403, 404].includes(unsigned.status));
  checks.push('anonymous-object-denied');
  const copy = `${randomUUID()}.webp`;
  objects.push(copy);
  await storage.client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: copy,
      Body: ciphertext,
    }),
  );
  await assert.rejects(storage.get(copy, 1024));
  checks.push('object-identity-authenticated');
  const tamper = Buffer.from(ciphertext);
  tamper[tamper.length - 1] ^= 1;
  await storage.client.send(
    new PutObjectCommand({ Bucket: storage.bucket, Key: copy, Body: tamper }),
  );
  await assert.rejects(storage.get(copy, 1024));
  checks.push('ciphertext-tampering-denied');
  await assert.rejects(storage.put(path, Buffer.from('Changed bytes')));
  checks.push('overwrite-denied');
  const version = await scannerVersion();
  assert.match(version, /^ClamAV /);
  await scanMedia(Buffer.from('Synthetic harmless scan test'));
  const eicar = Buffer.from(
    'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=',
    'base64',
  );
  await assert.rejects(scanMedia(eicar), UnsafeMediaError);
  checks.push('actual-clamav-clean-and-eicar');
  const originalSocket = process.env.PETRA_CLAMAV_SOCKET;
  process.env.PETRA_CLAMAV_SOCKET = '/tmp/petra-unavailable-scanner.sock';
  await assert.rejects(scanMedia(payload));
  process.env.PETRA_CLAMAV_SOCKET = originalSocket;
  checks.push('scanner-unavailable-fails-closed');
  await verifyPipeline();
  console.log(
    JSON.stringify({
      status: 'verified-local-providers',
      checks,
      notice:
        'Isolated service and media pipeline validation; production remains blocked.',
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'failed',
      checks,
      code: error instanceof Error ? error.name : 'UNKNOWN',
      message:
        'Local provider validation failed; inspect the named check without logging credentials.',
    }),
  );
  process.exitCode = 1;
} finally {
  for (const object of objects) await storage.delete(object).catch(() => {});
  await storage.client
    .send(new DeleteBucketCommand({ Bucket: storage.bucket }))
    .catch(() => {});
  storage.close();
}

async function verifyPipeline() {
  const base = new URL(process.env.DATABASE_URL);
  if (
    !['127.0.0.1', 'localhost'].includes(base.hostname) ||
    !/^\/petra_[a-z0-9_]+$/.test(base.pathname)
  )
    throw new Error('Local Petra database required');
  const name = `petra_e2e_${process.pid}`,
    owner = new pg.Client({ connectionString: base.toString() }),
    temporary = `/tmp/petra-provider-media-${process.pid}`,
    fixtureFile = `/tmp/petra-provider-fixture-${process.pid}.json`;
  await owner.connect();
  let created = false,
    db;
  try {
    await owner.query(`CREATE DATABASE "${name}"`);
    created = true;
    base.pathname = `/${name}`;
    Object.assign(process.env, {
      DATABASE_URL: base.toString(),
      APP_ORIGIN: 'http://127.0.0.1:3100',
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      PETRA_MEDIA_ROOT: temporary,
      MAIL_MODE: 'local',
    });
    for (const action of ['migrate', 'seed'])
      execFileSync(process.execPath, ['scripts/database.mjs', action], {
        env: process.env,
        stdio: 'pipe',
      });
    execFileSync(
      process.execPath,
      ['scripts/seed-platform-test.mjs', fixtureFile],
      { env: process.env, stdio: 'pipe' },
    );
    const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));
    rmSync(fixtureFile, { force: true });
    const { database } =
      await import('../apps/api/dist/apps/api/src/database.js');
    db = database;
    const { OrganizationService } =
      await import('../apps/api/dist/apps/api/src/organizations/service.js');
    const { CareService } =
      await import('../apps/api/dist/apps/api/src/care/service.js');
    const { CommunityService } =
      await import('../apps/api/dist/apps/api/src/community/service.js');
    const { MediaService, processMedia, processMediaGc } =
      await import('../apps/api/dist/apps/api/src/media/service.js');
    const { petInputSchema } =
      await import('../apps/api/dist/packages/contracts/src/index.js');
    const care = new CareService(new OrganizationService()),
      media = new MediaService(care),
      social = new CommunityService();
    const actor = fixture.accounts.owner.id,
      peer = fixture.accounts.other.id;
    for (const id of [actor, peer])
      await social.profile(id, {
        displayName: 'حساب اختبار مزود محلي',
        bio: 'بيانات اصطناعية فقط',
        privacy: 'public',
      });
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
    const chat = await media.upload(actor, {
      dataBase64: png.toString('base64'),
      chatPeerId: peer,
    });
    assert.equal(chat.status, 'ready');
    await assert.rejects(media.file(peer, chat.id));
    await social.conversation(
      actor,
      peer,
      'صورة S3 خاصة',
      randomUUID(),
      chat.id,
    );
    const picture = await media.file(peer, chat.id);
    assert.equal(picture.mime, 'image/webp');
    assert.equal(picture.bytes.subarray(0, 4).toString(), 'RIFF');
    checks.push('s3-chat-delivery-authorization');
    const pet = await care.savePet(
      actor,
      petInputSchema.parse({
        name: 'حيوان فحص تخزين',
        species: 'cat',
        sex: 'unknown',
      }),
    );
    const clinical = await media.upload(actor, {
      dataBase64: png.toString('base64'),
      petId: pet.id,
    });
    assert.equal((await media.file(actor, clinical.id)).mime, 'image/webp');
    await assert.rejects(media.file(peer, clinical.id));
    checks.push('s3-medical-attachment-isolation');
    const before = (await db.query('SELECT count(*)::int n FROM media_assets'))
      .rows[0].n;
    const eicar = Buffer.from(
      'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=',
      'base64',
    );
    await assert.rejects(
      media.upload(actor, {
        dataBase64: eicar.toString('base64'),
        chatPeerId: peer,
      }),
    );
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM media_assets')).rows[0].n,
      before,
    );
    checks.push('infected-upload-never-persisted');
    const audioFile = `${temporary}.wav`;
    let wav;
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
          '-y',
          audioFile,
        ],
        { stdio: 'pipe' },
      );
      wav = readFileSync(audioFile);
    } finally {
      rmSync(audioFile, { force: true });
    }
    const audio = await media.upload(actor, {
      dataBase64: wav.toString('base64'),
      chatPeerId: peer,
      kind: 'audio',
    });
    await processMedia();
    assert.equal(
      (await media.file(actor, audio.id)).bytes.subarray(0, 4).toString(),
      'OggS',
    );
    const video = execFileSync('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=640x360:r=24:d=1',
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
    const movie = await media.upload(actor, {
      dataBase64: video.toString('base64'),
      chatPeerId: peer,
    });
    await processMedia();
    assert.equal(
      (
        await db.query('SELECT status FROM media_assets WHERE id=$1', [
          movie.id,
        ])
      ).rows[0].status,
      'ready',
    );
    await social.conversation(
      actor,
      peer,
      'فيديو S3 خاص',
      randomUUID(),
      movie.id,
    );
    const stream = await media.hls(peer, movie.id);
    assert.equal(stream.available, true);
    const master = await media.stream(
      peer,
      movie.id,
      stream.manifest.split('/').at(-1),
    );
    assert.ok(master.bytes.toString().startsWith('#EXTM3U'));
    assert.ok(
      (
        await db.query(
          'SELECT storage_backend FROM media_streams WHERE asset_id=$1',
          [movie.id],
        )
      ).rows.every((r) => r.storage_backend === 's3'),
    );
    checks.push('s3-worker-opus-and-adaptive-video');
    const pending = await media.upload(actor, {
        dataBase64: wav.toString('base64'),
        chatPeerId: peer,
        kind: 'audio',
      }),
      socket = process.env.PETRA_CLAMAV_SOCKET;
    process.env.PETRA_CLAMAV_SOCKET = '/tmp/petra-unavailable-scanner.sock';
    try {
      await processMedia();
    } finally {
      process.env.PETRA_CLAMAV_SOCKET = socket;
    }
    assert.deepEqual(
      (
        await db.query(
          'SELECT status,processing_attempts FROM media_assets WHERE id=$1',
          [pending.id],
        )
      ).rows[0],
      { status: 'pending', processing_attempts: 1 },
    );
    checks.push('provider-outage-defers-processing');
    const backup = JSON.parse(
      execFileSync(process.execPath, ['scripts/verify-backup.mjs'], {
        env: process.env,
        stdio: 'pipe',
        timeout: 80000,
      }).toString(),
    );
    assert.equal(backup.status, 'verified');
    assert.equal(backup.tables, 141);
    assert.equal(backup.protectionTriggers, 73);
    assert.ok(backup.mediaFiles > backup.readyMedia);
    checks.push('encrypted-ready-and-pending-backup-restored');
    await db.query(
      'UPDATE media_assets SET processing_retry_at=now() WHERE id=$1',
      [pending.id],
    );
    await processMedia();
    assert.equal(
      (await media.file(actor, pending.id)).bytes.subarray(0, 4).toString(),
      'OggS',
    );
    await db.query('UPDATE media_gc_jobs SET available_at=now()');
    for (let n = 0; n < 3; n++) await processMediaGc();
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM media_gc_jobs WHERE status<>'complete'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await media.file(actor, audio.id)).mime, 'audio/ogg');
    checks.push('retired-raw-cleanup-preserves-ready-media');
    const remote = (
      await db.query(
        'SELECT storage_key FROM media_assets UNION SELECT storage_key FROM media_streams UNION SELECT storage_key FROM media_gc_jobs',
      )
    ).rows;
    for (const row of remote) objects.push(row.storage_key);
    const { privateStorage } =
      await import('../apps/api/dist/apps/api/src/media/private-storage.js');
    privateStorage().close();
  } finally {
    if (db) {
      try {
        const rows = (
          await db.query(
            'SELECT storage_key FROM media_assets UNION SELECT storage_key FROM media_streams UNION SELECT storage_key FROM media_gc_jobs',
          )
        ).rows;
        for (const row of rows) objects.push(row.storage_key);
      } catch {
        /* Cleanup can run before migration completion. */
      }
      await db.end();
    }
    if (created) await owner.query(`DROP DATABASE "${name}" WITH(FORCE)`);
    await owner.end();
    rmSync(temporary, { recursive: true, force: true });
    rmSync(fixtureFile, { force: true });
  }
}
