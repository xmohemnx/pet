import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
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
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { transaction } from '../database.js';
import { CareService } from '../care/service.js';
import { audit } from '../organizations/service.js';
import { visibleSql, rate } from '../community/service.js';
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
  if (!/^[a-f0-9-]{36}\.(webp|upload|mp4)$/.test(key))
    throw new Error('Invalid storage key');
  return join(mediaRoot, key);
}
@Injectable()
export class MediaService {
  constructor(private readonly care: CareService) {}
  async upload(actor: string, i: { dataBase64: string; petId?: string }) {
    if (process.env.APP_ENV !== 'local')
      throw new ForbiddenException(
        'التخزين المحلي للوسائط غير مفعل في الإنتاج قبل إعداد المزود والفحص',
      );
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(i.dataBase64))
      throw new BadRequestException('ترميز الملف غير صالح');
    const bytes = Buffer.from(i.dataBase64, 'base64');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new BadRequestException('الحد 20 ميغابايت للفيديو و5 للصور');
    const video = bytes.subarray(4, 8).toString() === 'ftyp';
    let output: Buffer = bytes;
    if (!video) {
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
      key = `${id}.${video ? 'upload' : 'webp'}`;
    await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
    if ((await realpath(mediaRoot)) !== mediaRoot)
      throw new Error('Private media storage must not use symbolic links');
    await chmod(mediaRoot, 0o700);
    try {
      return await transaction(async (db) => {
        await rate(db, actor, 'media', 5);
        if (i.petId) await this.care.pet(db, actor, i.petId, 'medical');
        if (
          (
            await db.query(
              "SELECT count(*)::int n FROM media_assets WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
              [actor],
            )
          ).rows[0].n >= 100
        )
          throw new BadRequestException('بلغت حصة الرفع اليومية');
        await writeFile(assetPath(key), output, { mode: 0o600, flag: 'wx' });
        await db.query(
          'INSERT INTO media_assets(id,owner_id,kind,status,mime,byte_count,storage_key,pet_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            actor,
            video ? 'video' : 'image',
            video ? 'pending' : 'ready',
            video ? 'video/mp4' : 'image/webp',
            output.length,
            key,
            i.petId ?? null,
          ],
        );
        await audit(db, actor, 'media.uploaded', null, {
          assetId: id,
          petId: i.petId ?? null,
        });
        return {
          id,
          status: video ? 'pending' : 'ready',
          kind: video ? 'video' : 'image',
        };
      });
    } catch (e) {
      await unlink(assetPath(key)).catch(() => undefined);
      throw e;
    }
  }
  async list(actor: string, petId?: string) {
    return transaction(async (db) => {
      if (petId) {
        await this.care.pet(db, actor, petId, 'medical');
        await audit(db, actor, 'medical.attachments_read', null, { petId });
      }
      return (
        await db.query(
          'SELECT id,kind,status,created_at,failure FROM media_assets WHERE (CASE WHEN $2::uuid IS NULL THEN owner_id=$1 AND pet_id IS NULL ELSE pet_id=$2 END) ORDER BY created_at DESC LIMIT 100',
          [actor, petId ?? null],
        )
      ).rows;
    });
  }
  async file(actor: string, id: string, clinicId?: string) {
    const asset = await transaction(async (db) => {
      const a = (
        await db.query(
          "SELECT * FROM media_assets WHERE id=$1 AND status='ready'",
          [id],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (a.pet_id) {
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
              `SELECT 1 FROM social_posts p JOIN social_profiles sp ON sp.user_id=p.user_id WHERE p.asset_id=$2 AND ${visibleSql}`,
              [actor, id],
            )
          ).rowCount &&
          !(
            await db.query(
              `SELECT 1 FROM product_images i JOIN products p ON p.id=i.product_id ${storefrontJoin} WHERE i.asset_id=$1 AND ${sellableSql}
               UNION ALL SELECT 1 FROM clinic_storefronts s JOIN clinics c ON c.id=s.clinic_id WHERE s.is_primary AND s.published AND c.verification_status='verified' AND ($1=s.logo_asset_id OR $1=s.cover_asset_id) LIMIT 1`,
              [id],
            )
          ).rowCount
        )
          throw new NotFoundException();
      }
      return a;
    });
    const handle = await open(
      assetPath(asset.storage_key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch((error: NodeJS.ErrnoException) => {
      if (['ENOENT', 'ELOOP'].includes(error.code ?? ''))
        throw new NotFoundException();
      throw error;
    });
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 64 * 1024 * 1024)
        throw new NotFoundException();
      return { mime: asset.mime, bytes: await handle.readFile() };
    } finally {
      await handle.close();
    }
  }
}
export async function processMedia() {
  return transaction(async (db) => {
    const a = (
      await db.query(
        "SELECT * FROM media_assets WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!a) return false;
    try {
      const input = assetPath(a.storage_key),
        out = assetPath(`${a.id}.mp4`);
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
      await db.query(
        "UPDATE media_assets SET status='ready',storage_key=$2,byte_count=$3 WHERE id=$1",
        [a.id, `${a.id}.mp4`, (await stat(out)).size],
      );
      await unlink(input).catch(() => undefined);
    } catch {
      await db.query(
        "UPDATE media_assets SET status='rejected',failure='تعذر فحص الفيديو أو تحويله؛ أرسل MP4 أقل من دقيقة' WHERE id=$1",
        [a.id],
      );
    }
    return true;
  });
}
