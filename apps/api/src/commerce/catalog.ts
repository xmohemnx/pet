import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { audit } from '../organizations/service.js';
import { CommerceService } from './service.js';
import {
  storefrontJoin,
  sellableSql,
  publicProductSql,
} from './catalog-sql.js';

export interface CatalogImage {
  assetId: string;
  alt: string;
}
export interface CatalogInput {
  version: number;
  category: string;
  brand: string;
  barcode: string;
  unit: string;
  ageSuitability: string;
  specifications: { name: string; value: string }[];
  images: CatalogImage[];
  publicationConsent: boolean;
}
export interface StoreInput {
  version: number;
  published: boolean;
  displayName: string;
  description: string;
  city: string;
  openingHours: string;
  deliveryPolicy: string;
  returnPolicy: string;
  logoAssetId: string | null;
  coverAssetId: string | null;
  publicationConsent: boolean;
}
// Only new associations require the current actor to own the asset. A colleague
// may retain an already published image while editing the same clinic resource.
async function imagesAllowed(
  db: PoolClient,
  actor: string,
  ids: string[],
  retained: string[],
  consent: boolean,
) {
  if (ids.length && !consent)
    throw new BadRequestException('الموافقة على نشر الصور مطلوبة');
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('الصورة مكررة');
  for (const id of ids) {
    if (
      !(
        await db.query(
          "SELECT 1 FROM media_assets WHERE id=$1 AND kind='image' AND status='ready' AND pet_id IS NULL AND (owner_id=$2 OR id=ANY($3::uuid[]))",
          [id, actor, retained],
        )
      ).rowCount
    )
      throw new BadRequestException(
        'اختر صورة جاهزة تملكها وغير مرتبطة بملف طبي',
      );
  }
}
@Injectable()
export class CatalogService {
  constructor(private readonly commerce: CommerceService) {}
  async edit(actor: string, clinic: string, product: string, i: CatalogInput) {
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      const p = (
        await db.query(
          'SELECT version FROM products WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [product, clinic],
        )
      ).rows[0];
      if (!p) throw new NotFoundException();
      if (p.version !== i.version)
        throw new ConflictException('تغير المنتج؛ حدّث الصفحة');
      const old = (
        await db.query(
          'SELECT asset_id FROM product_images WHERE product_id=$1',
          [product],
        )
      ).rows.map((r) => r.asset_id);
      await imagesAllowed(
        db,
        actor,
        i.images.map((x) => x.assetId),
        old,
        i.publicationConsent,
      );
      const r = (
        await db.query(
          'UPDATE products SET category=$2,brand=$3,barcode=$4,unit=$5,age_suitability=$6,specifications=$7,version=version+1 WHERE id=$1 RETURNING id,version',
          [
            product,
            i.category,
            i.brand,
            i.barcode,
            i.unit,
            i.ageSuitability,
            JSON.stringify(i.specifications),
          ],
        )
      ).rows[0];
      await db.query('DELETE FROM product_images WHERE product_id=$1', [
        product,
      ]);
      for (const [position, image] of i.images.entries())
        await db.query(
          'INSERT INTO product_images(product_id,clinic_id,asset_id,position,alt,published_by) VALUES($1,$2,$3,$4,$5,$6)',
          [product, clinic, image.assetId, position, image.alt, actor],
        );
      await audit(db, actor, 'commerce.catalog_updated', clinic, {
        productId: product,
        imageCount: i.images.length,
      });
      return r;
    });
  }
  async store(clinic: string, actor?: string, i?: StoreInput) {
    return transaction(async (db) => {
      if (actor) await this.commerce.staff(db, actor, clinic);
      const s = (
        await db.query(
          `SELECT s.*,c.name clinic_name FROM clinic_storefronts s JOIN clinics c ON c.id=s.clinic_id WHERE s.clinic_id=$1 AND s.is_primary ${actor ? '' : "AND s.published AND c.verification_status='verified'"} ${i ? 'FOR UPDATE OF s' : ''}`,
          [clinic],
        )
      ).rows[0];
      if (!s) throw new NotFoundException();
      if (i && actor) {
        if (s.version !== i.version)
          throw new ConflictException('تغيرت الإعدادات؛ حدّث الصفحة');
        await imagesAllowed(
          db,
          actor,
          [
            ...new Set(
              [i.logoAssetId, i.coverAssetId].filter((x): x is string => !!x),
            ),
          ],
          [s.logo_asset_id, s.cover_asset_id].filter(Boolean),
          i.publicationConsent,
        );
        await db.query(
          'UPDATE clinic_storefronts SET published=$2,display_name=$3,description=$4,city=$5,opening_hours=$6,delivery_policy=$7,return_policy=$8,logo_asset_id=$9,cover_asset_id=$10,version=version+1 WHERE id=$1',
          [
            s.id,
            i.published,
            i.displayName,
            i.description,
            i.city,
            i.openingHours,
            i.deliveryPolicy,
            i.returnPolicy,
            i.logoAssetId,
            i.coverAssetId,
          ],
        );
        await audit(db, actor, 'commerce.storefront_updated', clinic, {
          published: i.published,
        });
        return { version: s.version + 1 };
      }
      // Explicit public projection: no staff, internal inventory, costs or suppliers.
      return {
        clinic_id: s.clinic_id,
        clinic_name: s.clinic_name,
        display_name: s.display_name || s.clinic_name,
        description: s.description,
        city: s.city,
        opening_hours: s.opening_hours,
        delivery_policy: s.delivery_policy,
        return_policy: s.return_policy,
        logo_asset_id: s.logo_asset_id,
        cover_asset_id: s.cover_asset_id,
        ...(actor ? { published: s.published, version: s.version } : {}),
      };
    });
  }
  async detail(id: string) {
    return transaction(async (db) => {
      const p = (
        await db.query(
          `SELECT ${publicProductSql} FROM products p ${storefrontJoin} WHERE p.id=$1 AND ${sellableSql}`,
          [id],
        )
      ).rows[0];
      if (!p) throw new NotFoundException();
      const family = p.parent_product_id ?? p.id;
      const variants = (
        await db.query(
          `SELECT ${publicProductSql} FROM products p ${storefrontJoin} WHERE (p.id=$1 OR p.parent_product_id=$1) AND ${sellableSql} ORDER BY p.name LIMIT 100`,
          [family],
        )
      ).rows;
      return { product: p, variants };
    });
  }
}
