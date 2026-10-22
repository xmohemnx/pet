import {
  mkdir,
  mkdtemp,
  realpath,
  chmod,
  writeFile,
  rm,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { database, transaction } from '../database.js';
import { MediaService, mediaRoot } from './service.js';
import { CareService } from '../care/service.js';
import { OrganizationService } from '../organizations/service.js';
import { generateHls } from './hls.js';
import { privateStorage } from './private-storage.js';
import { scanMedia, scannerConfigured } from './antivirus.js';

const run = promisify(execFile);
const eligible = `status='ready' AND kind='video' AND pet_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM media_streams s WHERE s.asset_id=media_assets.id)`;

// Operator-only maintenance, intentionally absent from HTTP and the regular worker.
export async function backfillHls(limit = 10, apply = false) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Backfill limit must be between 1 and 100');
  const candidates = (
    await database.query(
      `SELECT id FROM media_assets WHERE ${eligible} ORDER BY created_at,id LIMIT $1`,
      [limit],
    )
  ).rows as { id: string }[];
  const result = {
    candidates: candidates.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    dryRun: !apply,
  };
  if (!apply || !candidates.length) return result;
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  if ((await realpath(mediaRoot)) !== mediaRoot)
    throw new Error('Unsafe media root');
  await chmod(mediaRoot, 0o700);
  const media = new MediaService(new CareService(new OrganizationService()));
  for (const { id } of candidates) {
    let directory: string | undefined;
    let stored: string[] = [];
    let backend = 'local';
    try {
      const completed = await transaction(async (db) => {
        const asset = (
          await db.query(
            `SELECT * FROM media_assets WHERE id=$1 AND ${eligible} FOR UPDATE SKIP LOCKED`,
            [id],
          )
        ).rows[0];
        if (!asset) return false;
        backend = asset.storage_backend;
        // Read through the same bounded, no-symlink/encrypted storage path as playback.
        const source = await media.readBlob(
          asset.storage_key,
          asset.mime,
          64 * 1024 * 1024,
          backend,
        );
        if (backend === 's3' || scannerConfigured())
          await scanMedia(source.bytes, 64 * 1024 * 1024);
        directory = await mkdtemp(join(mediaRoot, 'hls-backfill-'));
        const input = join(directory, 'source.mp4');
        await writeFile(input, source.bytes, { mode: 0o600, flag: 'wx' });
        const probe = await run(
          'ffprobe',
          [
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
            '-show_entries',
            'format=duration',
            '-of',
            'json',
            input,
          ],
          { timeout: 10000, maxBuffer: 65536 },
        );
        const duration = Number(JSON.parse(probe.stdout).format.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 60)
          throw new Error('Unsupported legacy video duration');
        stored = await generateHls(
          db,
          asset.id,
          input,
          mediaRoot,
          asset.storage_backend,
        );
        return true;
      });
      if (completed) result.completed++;
      else result.skipped++;
    } catch {
      result.failed++;
      // A lost COMMIT response is ambiguous: preserve files unless the database
      // proves that none of this attempt's derivatives became referenced.
      let unreferenced = false;
      if (stored.length) {
        try {
          unreferenced =
            (
              await database.query(
                'SELECT id FROM media_streams WHERE storage_key=ANY($1::text[]) LIMIT 1',
                [stored.map((path) => path.split('/').at(-1)!)],
              )
            ).rowCount === 0;
        } catch {
          // Storage reconciliation remains necessary after an infrastructure outage.
        }
      }
      for (const path of unreferenced ? stored : []) {
        await unlink(path).catch(() => {});
        if (backend === 's3')
          await privateStorage()
            .delete(path.split('/').at(-1)!)
            .catch(() => {});
      }
    } finally {
      if (backend === 's3')
        for (const path of stored) await unlink(path).catch(() => {});
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
  return result;
}
