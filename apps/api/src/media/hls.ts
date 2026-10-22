import { privateStorage } from './private-storage.js';
import { scanMedia } from './antivirus.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  rm,
  chmod,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
const run = promisify(execFile);
type Derivative = {
  id: string;
  kind: 'master' | 'playlist' | 'segment';
  key: string;
  bytes: Buffer;
  mime: string;
};
export async function generateHls(
  db: PoolClient,
  asset: string,
  input: string,
  root: string,
  backend: 'local' | 's3' = 'local',
) {
  const directory = join(root, `hls-work-${randomUUID()}`),
    stored: string[] = [];
  await mkdir(directory, { mode: 0o700 });
  try {
    const derivatives: Derivative[] = [],
      variants: string[] = [];
    let total = 0;
    for (const [index, width, height, bitrate] of [
      [0, 426, 240, 250000],
      [1, 640, 360, 600000],
    ] as const) {
      const pattern = join(directory, `${index}-%03d.ts`),
        playlist = join(directory, `${index}.m3u8`);
      await run(
        'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-f',
          'mov',
          '-enable_drefs',
          '0',
          '-use_absolute_path',
          '0',
          '-threads',
          '1',
          '-filter_threads',
          '1',
          '-i',
          input,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-profile:v',
          'main',
          '-b:v',
          String(bitrate),
          '-maxrate',
          String(bitrate * 1.5),
          '-bufsize',
          String(bitrate * 2),
          '-pix_fmt',
          'yuv420p',
          '-r',
          '24',
          '-g',
          '96',
          '-keyint_min',
          '96',
          '-sc_threshold',
          '0',
          '-threads',
          '1',
          '-c:a',
          'aac',
          '-b:a',
          '64000',
          '-map_metadata',
          '-1',
          '-t',
          '60',
          '-f',
          'hls',
          '-hls_time',
          '4',
          '-hls_playlist_type',
          'vod',
          '-hls_flags',
          'independent_segments',
          '-hls_segment_filename',
          pattern,
          '-y',
          playlist,
        ],
        { timeout: 30000, maxBuffer: 65536 },
      );
      const names = (await readdir(directory))
        .filter((n) => new RegExp(`^${index}-\\d{3}\\.ts$`).test(n))
        .sort();
      if (!names.length || names.length > 20)
        throw new Error('HLS segment bound');
      let manifest = await readFile(playlist, 'utf8');
      for (const name of names) {
        const info = await stat(join(directory, name));
        total += info.size;
        if (
          info.size <= 0 ||
          info.size > 4 * 1024 * 1024 ||
          total > 16 * 1024 * 1024
        )
          throw new Error('HLS output bound');
        const id = randomUUID(),
          key = `${id}.ts`;
        derivatives.push({
          id,
          key,
          kind: 'segment',
          bytes: await readFile(join(directory, name)),
          mime: 'video/mp2t',
        });
        manifest = manifest.replaceAll(
          name,
          `/api/v1/media/${asset}/streams/${id}`,
        );
      }
      if (
        !manifest.startsWith('#EXTM3U') ||
        !manifest.includes('#EXT-X-ENDLIST') ||
        manifest
          .split('\n')
          .some(
            (line) =>
              line &&
              !line.startsWith('#') &&
              !new RegExp(
                `^/api/v1/media/${asset}/streams/[a-f0-9-]{36}$`,
              ).test(line),
          )
      )
        throw new Error('Unsafe HLS playlist');
      const id = randomUUID();
      variants.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate + 100000}\n/api/v1/media/${asset}/streams/${id}`,
      );
      derivatives.push({
        id,
        key: `${id}.m3u8`,
        kind: 'playlist',
        bytes: Buffer.from(manifest),
        mime: 'application/vnd.apple.mpegurl',
      });
    }
    const id = randomUUID();
    derivatives.push({
      id,
      key: `${id}.m3u8`,
      kind: 'master',
      bytes: Buffer.from(
        '#EXTM3U\n#EXT-X-VERSION:3\n' + variants.join('\n') + '\n',
      ),
      mime: 'application/vnd.apple.mpegurl',
    });
    for (const d of derivatives) {
      const path = join(root, d.key);
      await writeFile(path, d.bytes, { flag: 'wx', mode: 0o600 });
      stored.push(path);
      await chmod(path, 0o600);
      if (backend === 's3') {
        await scanMedia(d.bytes);
        await privateStorage().put(d.key, d.bytes);
      }
      await db.query(
        'INSERT INTO media_streams(id,asset_id,kind,mime,byte_count,storage_key,storage_backend) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [d.id, asset, d.kind, d.mime, d.bytes.length, d.key, backend],
      );
    }
    return stored;
  } catch (e) {
    for (const path of stored) {
      await rm(path, { force: true }).catch(() => {});
      if (backend === 's3')
        await privateStorage()
          .delete(path.split('/').at(-1)!)
          .catch(() => {});
    }
    throw e;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
