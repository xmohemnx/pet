import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import {
  variantMatrix,
  type VariantDimension,
} from '../../../../packages/contracts/src/index.js';
import { transaction } from '../database.js';
import { audit, emit } from '../organizations/service.js';
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
  async matrix(
    actor: string,
    clinic: string,
    product: string,
    input: {
      version: number;
      idempotencyKey: string;
      skuPrefix: string;
      priceMinor: string;
      costMinor: string;
      dimensions: VariantDimension[];
    },
  ) {
    let matrix: ReturnType<typeof variantMatrix>;
    try {
      matrix = variantMatrix(input.dimensions);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'أبعاد غير صالحة',
      );
    }
    const signature = createHash('sha256')
      .update(
        JSON.stringify({
          product,
          version: input.version,
          skuPrefix: input.skuPrefix,
          priceMinor: input.priceMinor,
          costMinor: input.costMinor,
          dimensions: matrix.dimensions,
        }),
      )
      .digest('hex');
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      if (
        !(
          await db.query(
            "SELECT 1 FROM clinic_memberships m JOIN clinics c ON c.id=m.clinic_id WHERE m.user_id=$1 AND m.clinic_id=$2 AND m.revoked_at IS NULL AND m.capabilities && ARRAY['clinic_admin','commerce_manager']::text[] AND c.verification_status='verified' FOR SHARE OF m,c",
            [actor, clinic],
          )
        ).rowCount
      )
        throw new BadRequestException('عضوية تجارة فعالة مطلوبة');
      const p = (
        await db.query(
          'SELECT * FROM products WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [product, clinic],
        )
      ).rows[0];
      if (!p) throw new NotFoundException();
      const old = (
        await db.query(
          'SELECT * FROM product_variant_matrices WHERE clinic_id=$1 AND idempotency_key=$2',
          [clinic, input.idempotencyKey],
        )
      ).rows[0];
      const result = async () => ({
        parentId: product,
        products: (
          await db.query(
            'SELECT p.id,p.sku,p.name,p.price_minor::text,p.active,product_variant_attributes(p.id) variant_attributes FROM products p JOIN product_variant_choices v ON v.product_id=p.id WHERE v.parent_product_id=$1 ORDER BY v.choice_indexes',
            [product],
          )
        ).rows,
      });
      if (old) {
        if (old.created_by !== actor || old.request_hash !== signature)
          throw new ConflictException('مفتاح الطلب مستخدم لمصفوفة مختلفة');
        return result();
      }
      if (
        p.parent_product_id ||
        p.version !== input.version ||
        (
          await db.query(
            'SELECT 1 FROM product_variant_matrices WHERE parent_product_id=$1 UNION ALL SELECT 1 FROM products WHERE parent_product_id=$1 LIMIT 1',
            [product],
          )
        ).rowCount
      )
        throw new ConflictException('اختر أصلاً بلا خيارات سابقة وحدّث إصداره');
      await db.query(
        'INSERT INTO product_variant_matrices(parent_product_id,clinic_id,dimensions,sku_prefix,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          product,
          clinic,
          JSON.stringify(matrix.dimensions),
          input.skuPrefix,
          actor,
          input.idempotencyKey,
          signature,
        ],
      );
      for (const [index, choice] of matrix.choices.entries()) {
        const name =
          choice.label.length >= 95
            ? choice.label
            : `${p.name.slice(0, 97 - choice.label.length)} · ${choice.label}`;
        const v = (
          await db.query(
            'INSERT INTO products(clinic_id,sku,name,description,species,price_minor,cost_minor,parent_product_id,variant_label,active,category,brand,unit,age_suitability,specifications) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14) RETURNING id',
            [
              clinic,
              `${input.skuPrefix}-${String(index + 1).padStart(2, '0')}`,
              name,
              p.description,
              p.species,
              input.priceMinor,
              input.costMinor,
              product,
              choice.label,
              p.category,
              p.brand,
              p.unit,
              p.age_suitability,
              JSON.stringify(p.specifications),
            ],
          )
        ).rows[0];
        await db.query(
          'INSERT INTO product_variant_choices(product_id,parent_product_id,choice_indexes) VALUES($1,$2,$3)',
          [v.id, product, choice.indexes],
        );
      }
      await db.query('UPDATE products SET version=version+1 WHERE id=$1', [
        product,
      ]);
      await audit(db, actor, 'commerce.variant_matrix_created', clinic, {
        productId: product,
        count: matrix.choices.length,
      });
      await emit(
        db,
        actor,
        'ProductVariantMatrixCreated',
        product,
        p.version + 1,
        clinic,
      );
      return result();
    });
  }
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
