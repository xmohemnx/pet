import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  writeFile,
  open,
  rename,
  unlink,
  chmod,
  stat,
  realpath,
  readFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { transaction } from '../database.js';
import { CareService } from '../care/service.js';
import { audit } from '../organizations/service.js';
import { privateStorage, s3MediaEnabled } from './private-storage.js';
import { scanMedia, scannerConfigured, UnsafeMediaError } from './antivirus.js';
import { MediaInfrastructureError } from './errors.js';
import { generateHls } from './hls.js';
import { audioFormat, transcodeAudio } from './audio.js';
import { visibleSql, rate, conversationAccess } from '../community/service.js';
import { storefrontJoin, sellableSql } from '../commerce/catalog-sql.js';
import { groomingPhotoAccessSql } from '../services/grooming.js';
const run = promisify(execFile);
export const mediaRoot = resolve(
  process.env.PETRA_MEDIA_ROOT ?? '/workspace/pet/.data/media',
);
if (
  mediaRoot
    .split('/')
    .some((part) => ['public', '.next', '.git', 'node_modules'].includes(part))
)
  throw new Error(
    'Private media storage must be outside public/build/source-control directories',
  );
export function assetPath(key: string) {
  if (!/^[a-f0-9-]{36}\.(webp|upload|mp4|ogg|m3u8|ts)$/.test(key))
    throw new Error('Invalid storage key');
  return join(mediaRoot, key);
}
@Injectable()
export class MediaService {
  constructor(private readonly care: CareService) {}
  async upload(
    actor: string,
    i: {
      dataBase64: string;
      petId?: string;
      chatPeerId?: string;
      kind?: 'audio';
    },
  ) {
    if (process.env.APP_ENV !== 'local')
      throw new ForbiddenException(
        'التخزين المحلي للوسائط غير مفعل في الإنتاج قبل إعداد المزود والفحص',
      );
    const backend = s3MediaEnabled() ? 's3' : 'local';
    if (backend === 's3' && !scannerConfigured())
      throw new ServiceUnavailableException(
        'التخزين البعيد يحتاج فاحص ملفات خاصاً',
      );
    if (i.petId && i.chatPeerId)
      throw new BadRequestException('اختر مرفق رعاية أو محادثة');
    if (i.kind === 'audio' && !i.chatPeerId)
      throw new BadRequestException('الصوت متاح في المحادثات الاجتماعية فقط');
    if (i.chatPeerId)
      await transaction(async (db) => {
        await conversationAccess(db, actor, i.chatPeerId!);
      });
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(i.dataBase64))
      throw new BadRequestException('ترميز الملف غير صالح');
    const bytes = Buffer.from(i.dataBase64, 'base64');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new BadRequestException('الحد 20 ميغابايت للفيديو و5 للصور');
    let scanned: string | null = null;
    if (scannerConfigured()) {
      try {
        scanned = await scanMedia(bytes);
      } catch (error) {
        if (error instanceof UnsafeMediaError)
          throw new BadRequestException('رفض فاحص الأمان الملف');
        throw new ServiceUnavailableException(
          'فاحص الملفات غير متاح أو يحتاج تحديثاً',
        );
      }
    }
    const audio = i.kind === 'audio';
    if (audio && (bytes.length > 5 * 1024 * 1024 || !audioFormat(bytes)))
      throw new BadRequestException('أرسل صوت Ogg/WAV/WebM حتى 5 ميغابايت');
    const video = !audio && bytes.subarray(4, 8).toString() === 'ftyp';
    let output: Buffer = bytes;
    if (!video && !audio) {
      if (bytes.length > 5 * 1024 * 1024)
        throw new BadRequestException('الصورة أكبر من 5 ميغابايت');
      try {
        const info = await sharp(bytes, {
          limitInputPixels: 24000000,
        }).metadata();
        if (
          !['png', 'jpeg', 'webp'].includes(info.format ?? '') ||
          (info.pages ?? 1) > 1
        )
          throw new Error('format');
        output = await sharp(bytes, { limitInputPixels: 24000000 })
          .timeout({ seconds: 5 })
          .rotate()
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        throw new BadRequestException('أرسل صورة PNG/JPEG/WebP قابلة للفك');
      }
    }
    if (video && i.petId)
      throw new BadRequestException('المرفقات الطبية الحالية صور فقط');
    const id = randomUUID(),
      key = `${id}.${video || audio ? 'upload' : 'webp'}`;
    await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
    if ((await realpath(mediaRoot)) !== mediaRoot)
      throw new Error('Private media storage must not use symbolic links');
    await chmod(mediaRoot, 0o700);
    try {
      return await transaction(async (db) => {
        await rate(db, actor, 'media', 5);
        if (i.petId) await this.care.pet(db, actor, i.petId, 'medical');
        if (i.chatPeerId) await conversationAccess(db, actor, i.chatPeerId);
        if (
          (
            await db.query(
              "SELECT count(*)::int n FROM media_assets WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
              [actor],
            )
          ).rows[0].n >= 100
        )
          throw new BadRequestException('بلغت حصة الرفع اليومية');
        if (backend === 's3') await privateStorage().put(key, output);
        else
          await writeFile(assetPath(key), output, { mode: 0o600, flag: 'wx' });
        await db.query(
          'INSERT INTO media_assets(id,owner_id,kind,status,mime,byte_count,storage_key,pet_id,chat_peer_id,storage_backend,scanned_at,scanner_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [
            id,
            actor,
            audio ? 'audio' : video ? 'video' : 'image',
            video || audio ? 'pending' : 'ready',
            audio ? 'audio/ogg' : video ? 'video/mp4' : 'image/webp',
            output.length,
            key,
            i.petId ?? null,
            i.chatPeerId ?? null,
            backend,
            scanned ? new Date() : null,
            scanned,
          ],
        );
        await audit(db, actor, 'media.uploaded', null, {
          assetId: id,
          petId: i.petId ?? null,
        });
        return {
          id,
          status: video || audio ? 'pending' : 'ready',
          kind: audio ? 'audio' : video ? 'video' : 'image',
        };
      });
    } catch (e) {
      if (backend === 's3')
        await privateStorage()
          .delete(key)
          .catch(() => {});
      else await unlink(assetPath(key)).catch(() => undefined);
      throw e;
    }
  }
  async list(actor: string, petId?: string, chatPeerId?: string) {
    return transaction(async (db) => {
      if (petId && chatPeerId) throw new BadRequestException();
      if (chatPeerId) await conversationAccess(db, actor, chatPeerId);
      if (petId) {
        await this.care.pet(db, actor, petId, 'medical');
        await audit(db, actor, 'medical.attachments_read', null, { petId });
      }
      return (
        await db.query(
          'SELECT id,kind,status,created_at,failure FROM media_assets WHERE (CASE WHEN $3::uuid IS NOT NULL THEN owner_id=$1 AND chat_peer_id=$3 WHEN $2::uuid IS NULL THEN owner_id=$1 AND pet_id IS NULL AND chat_peer_id IS NULL ELSE pet_id=$2 END) ORDER BY created_at DESC LIMIT 100',
          [actor, petId ?? null, chatPeerId ?? null],
        )
      ).rows;
    });
  }
  async authorize(actor: string, id: string, clinicId?: string) {
    return transaction(async (db) => {
      const a = (
        await db.query(
          "SELECT * FROM media_assets WHERE id=$1 AND status='ready'",
          [id],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (a.chat_peer_id) {
        if (a.owner_id !== actor) {
          if (a.chat_peer_id !== actor) throw new NotFoundException();
          await conversationAccess(db, a.owner_id, actor);
          // Recheck the reader's permission to the sender as well as the
          // recipient's incoming policy; either participant can revoke privacy.
          await conversationAccess(db, actor, a.owner_id);
          if (
            !(
              await db.query(
                'SELECT 1 FROM direct_messages WHERE asset_id=$1 AND sender_id=$2 AND recipient_id=$3',
                [a.id, a.owner_id, actor],
              )
            ).rowCount
          )
            throw new NotFoundException();
        }
      } else if (a.pet_id) {
        if (clinicId) await this.care.medical(db, actor, a.pet_id, clinicId);
        else await this.care.pet(db, actor, a.pet_id, 'medical');
        await audit(db, actor, 'medical.attachment_read', clinicId ?? null, {
          petId: a.pet_id,
          assetId: id,
        });
      } else if (a.owner_id !== actor) {
        const groomingAccess = (
          await db.query(groomingPhotoAccessSql, [actor, id])
        ).rowCount;
        if (
          !groomingAccess &&
          !(
            await db.query(
              `SELECT 1 FROM social_posts p JOIN social_profiles sp ON sp.user_id=p.user_id WHERE (p.asset_id=$2 OR EXISTS(SELECT 1 FROM social_post_media pm WHERE pm.post_id=p.id AND pm.asset_id=$2)) AND ${visibleSql}
              UNION ALL SELECT 1 FROM social_profiles sp WHERE sp.avatar_asset_id=$2 AND (sp.privacy='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.followed_id=sp.user_id AND f.status='accepted')) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=sp.user_id) OR (b.blocker_id=sp.user_id AND b.blocked_id=$1)) LIMIT 1`,
              [actor, id],
            )
          ).rowCount &&
          !(
            await db.query(
              `SELECT 1 FROM product_images i JOIN products p ON p.id=i.product_id ${storefrontJoin} WHERE i.asset_id=$1 AND ${sellableSql}
               UNION ALL SELECT 1 FROM clinic_storefronts s JOIN clinics c ON c.id=s.clinic_id WHERE s.is_primary AND s.published AND c.verification_status='verified' AND ($1=s.logo_asset_id OR $1=s.cover_asset_id) UNION ALL SELECT 1 FROM site_banners b WHERE b.asset_id=$1 AND b.published AND b.deleted_at IS NULL AND (b.starts_at IS NULL OR b.starts_at<=now()) AND (b.ends_at IS NULL OR b.ends_at>now()) LIMIT 1`,
              [id],
            )
          ).rowCount
        )
          throw new NotFoundException();
      }
      return a;
    });
  }
  async hls(actor: string, id: string) {
    const a = await this.authorize(actor, id);
    if (a.kind !== 'video') throw new NotFoundException();
    return transaction(async (db) => {
      const row = (
        await db.query(
          "SELECT id FROM media_streams WHERE asset_id=$1 AND kind='master'",
          [id],
        )
      ).rows[0];
      return {
        available: !!row,
        manifest: row ? `/api/v1/media/${id}/streams/${row.id}` : null,
      };
    });
  }
  async stream(actor: string, id: string, streamId: string) {
    await this.authorize(actor, id);
    const row = await transaction(
      async (db) =>
        (
          await db.query(
            'SELECT storage_key,mime,storage_backend FROM media_streams WHERE asset_id=$1 AND id=$2',
            [id, streamId],
          )
        ).rows[0],
    );
    if (!row) throw new NotFoundException();
    return this.readBlob(
      row.storage_key,
      row.mime,
      4 * 1024 * 1024,
      row.storage_backend,
    );
  }
  async file(actor: string, id: string, clinicId?: string) {
    const asset = await this.authorize(actor, id, clinicId);
    return this.readBlob(
      asset.storage_key,
      asset.mime,
      64 * 1024 * 1024,
      asset.storage_backend,
    );
  }
  async readBlob(key: string, mime: string, limit: number, backend = 'local') {
    if (backend === 's3') {
      try {
        return { mime, bytes: await privateStorage().get(key, limit) };
      } catch {
        throw new ServiceUnavailableException('تعذر قراءة التخزين الخاص');
      }
    }
    const handle = await open(
      assetPath(key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch((error: NodeJS.ErrnoException) => {
      if (['ENOENT', 'ELOOP'].includes(error.code ?? ''))
        throw new NotFoundException();
      throw error;
    });
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) throw new NotFoundException();
      return { mime, bytes: await handle.readFile() };
    } finally {
      await handle.close();
    }
  }
}
export async function processMedia() {
  const cleanup: string[] = [];
  const result = await transaction(async (db) => {
    const a = (
      await db.query(
        "SELECT * FROM media_assets WHERE status='pending' AND kind IN ('audio','video') AND processing_retry_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!a) return false;
    let derived: string[] = [];
    await db.query('SAVEPOINT media_processing');
    try {
      const input = assetPath(a.storage_key);
      if (a.storage_backend === 's3') {
        await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
        if ((await realpath(mediaRoot)) !== mediaRoot)
          throw new Error('Unsafe staging root');
        await chmod(mediaRoot, 0o700);
        const raw = await privateStorage().get(a.storage_key, 20 * 1024 * 1024);
        await unlink(input).catch(() => {});
        await writeFile(input, raw, { mode: 0o600, flag: 'wx' });
        cleanup.push(input);
        await scanMedia(raw);
      }

      if (a.kind === 'audio') {
        const out = assetPath(`${a.id}.ogg`),
          size = await transcodeAudio(
            input,
            assetPath(`${randomUUID()}.ogg`),
            out,
          );
        if (a.storage_backend === 's3') {
          const bytes = await readFile(out);
          await scanMedia(bytes);
          await privateStorage().put(`${a.id}.ogg`, bytes);
          cleanup.push(out);
        }
        await db.query(
          "UPDATE media_assets SET status='ready',storage_key=$2,byte_count=$3,mime='audio/ogg' WHERE id=$1",
          [a.id, `${a.id}.ogg`, size],
        );
        await db.query(
          'INSERT INTO media_gc_jobs(asset_id,storage_backend,storage_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [a.id, a.storage_backend, a.storage_key],
        );
        return true;
      }
      const out = assetPath(`${a.id}.mp4`);
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
        throw new Error('duration');
      const temp = assetPath(`${randomUUID()}.mp4`);
      try {
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
            'scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2',
            '-t',
            '60',
            '-r',
            '30',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-threads',
            '1',
            '-c:a',
            'aac',
            '-map_metadata',
            '-1',
            '-movflags',
            '+faststart',
            '-y',
            temp,
          ],
          { timeout: 45000, maxBuffer: 65536 },
        );
        if ((await stat(temp)).size > 64 * 1024 * 1024)
          throw new Error('output too large');
        await chmod(temp, 0o600);
        await rename(temp, out);
      } finally {
        await unlink(temp).catch(() => undefined);
      }
      if (a.storage_backend === 's3') {
        const bytes = await readFile(out);
        await scanMedia(bytes, 64 * 1024 * 1024);
        await privateStorage().put(`${a.id}.mp4`, bytes);
        cleanup.push(out);
      }
      derived = await generateHls(db, a.id, out, mediaRoot, a.storage_backend);
      if (a.storage_backend === 's3') cleanup.push(...derived);
      await db.query(
        "UPDATE media_assets SET status='ready',storage_key=$2,byte_count=$3 WHERE id=$1",
        [a.id, `${a.id}.mp4`, (await stat(out)).size],
      );
      await db.query(
        'INSERT INTO media_gc_jobs(asset_id,storage_backend,storage_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [a.id, a.storage_backend, a.storage_key],
      );
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT media_processing');
      for (const path of derived) {
        await unlink(path).catch(() => {});
        if (a.storage_backend === 's3')
          await privateStorage()
            .delete(path.split('/').at(-1)!)
            .catch(() => {});
      }
      await unlink(
        assetPath(`${a.id}.${a.kind === 'audio' ? 'ogg' : 'mp4'}`),
      ).catch(() => {});
      if (a.storage_backend === 's3')
        await privateStorage()
          .delete(`${a.id}.${a.kind === 'audio' ? 'ogg' : 'mp4'}`)
          .catch(() => {});
      if (error instanceof MediaInfrastructureError) {
        await db.query(
          "UPDATE media_assets SET processing_attempts=LEAST(processing_attempts+1,1000),processing_retry_at=now()+interval '1 minute',failure='خدمة معالجة الملفات غير متاحة؛ ستعاد المحاولة' WHERE id=$1",
          [a.id],
        );
        return false;
      }
      await db.query(
        "UPDATE media_assets SET status='rejected',failure=$2 WHERE id=$1",
        [
          a.id,
          a.kind === 'audio'
            ? 'تعذر فك الصوت أو تحويله؛ أرسل Ogg/WAV/WebM حتى دقيقتين'
            : 'تعذر فحص الفيديو أو تحويله؛ أرسل MP4 أقل من دقيقة',
        ],
      );
      await db.query(
        'INSERT INTO media_gc_jobs(asset_id,storage_backend,storage_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [a.id, a.storage_backend, a.storage_key],
      );
    }
    return true;
  });
  for (const path of cleanup) await unlink(path).catch(() => {});
  return result;
}
export async function processMediaGc() {
  return transaction(async (db) => {
    const job = (
      await db.query(
        "SELECT * FROM media_gc_jobs WHERE status='pending' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!job) return false;
    const a = (
      await db.query(
        'SELECT status,storage_key FROM media_assets WHERE id=$1 FOR SHARE',
        [job.asset_id],
      )
    ).rows[0];
    if (
      !a ||
      !['ready', 'rejected'].includes(a.status) ||
      (a.storage_key === job.storage_key && a.status !== 'rejected')
    )
      throw new Error('Raw upload remains referenced');
    try {
      if (job.storage_backend === 's3')
        await privateStorage().delete(job.storage_key);
      else
        await unlink(assetPath(job.storage_key)).catch(
          (e: NodeJS.ErrnoException) => {
            if (e.code !== 'ENOENT') throw e;
          },
        );
      await db.query(
        "UPDATE media_gc_jobs SET status='complete',completed_at=now() WHERE id=$1",
        [job.id],
      );
    } catch {
      await db.query(
        "UPDATE media_gc_jobs SET attempts=LEAST(attempts+1,1000),available_at=now()+interval '10 minutes' WHERE id=$1",
        [job.id],
      );
    }
    return true;
  });
}
