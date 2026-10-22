import {
  Injectable,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Param,
  Body,
  Query,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { transaction } from '../database.js';
import { audit } from '../organizations/service.js';
import { CommerceService } from './service.js';
import { requireSession, uuid, parse } from '../identity/session.js';
import {
  publicProductSql,
  sellableSql,
  storefrontJoin,
} from './catalog-sql.js';
const label = z
  .string()
  .transform((s) => s.normalize('NFKC').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(80)
      .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s)),
  );
const tags = z
  .array(label.pipe(z.string().max(30)))
  .max(10)
  .refine((a) => new Set(a.map((s) => s.toLowerCase())).size === a.length);
@Injectable()
export class TaxonomyService {
  constructor(private readonly commerce: CommerceService) {}
  private async staff(db: PoolClient, actor: string, clinic: string) {
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
  }
  list(actor: string, clinic: string) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic);
      return (
        await db.query(
          'SELECT * FROM catalog_categories WHERE clinic_id=$1 ORDER BY path,name',
          [clinic],
        )
      ).rows;
    });
  }
  create(
    actor: string,
    clinic: string,
    i: { name: string; parentId: string | null; idempotencyKey: string },
  ) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `categories:${clinic}`,
      ]);
      const old = (
        await db.query(
          'SELECT * FROM catalog_categories WHERE clinic_id=$1 AND idempotency_key=$2',
          [clinic, i.idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.name !== i.name || old.parent_id !== i.parentId)
          throw new ConflictException('مفتاح التصنيف مستخدم لطلب مختلف');
        return old;
      }
      if (
        (
          await db.query(
            'SELECT count(*)::int n FROM catalog_categories WHERE clinic_id=$1',
            [clinic],
          )
        ).rows[0].n >= 500
      )
        throw new ConflictException('حد التصنيفات 500 لكل عيادة');
      const c = (
        await db.query(
          'INSERT INTO catalog_categories(clinic_id,parent_id,name,idempotency_key) VALUES($1,$2,$3,$4) RETURNING *',
          [clinic, i.parentId, i.name, i.idempotencyKey],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.category_created', clinic, {
        categoryId: c.id,
      });
      return c;
    });
  }
  availability(
    actor: string,
    clinic: string,
    id: string,
    i: { version: number; active: boolean },
  ) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic);
      const c = (
        await db.query(
          'UPDATE catalog_categories SET active=$4,version=version+1 WHERE id=$1 AND clinic_id=$2 AND version=$3 RETURNING *',
          [id, clinic, i.version, i.active],
        )
      ).rows[0];
      if (!c) throw new ConflictException('حدّث التصنيف قبل تغيير إتاحته');
      await audit(db, actor, 'commerce.category_availability', clinic, {
        categoryId: id,
        active: i.active,
      });
      return c;
    });
  }
  classify(
    actor: string,
    clinic: string,
    id: string,
    i: { version: number; categoryId: string | null; tags: string[] },
  ) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic);
      const p = (
        await db.query(
          'SELECT version,category_id FROM products WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (!p) throw new NotFoundException();
      if (p.version !== i.version)
        throw new ConflictException('تغير المنتج؛ حدّث الصفحة');
      if (i.categoryId && i.categoryId !== p.category_id) {
        const c = (
          await db.query(
            'SELECT path FROM catalog_categories WHERE id=$1 AND clinic_id=$2',
            [i.categoryId, clinic],
          )
        ).rows[0];
        if (!c) throw new BadRequestException('التصنيف ليس من عيادتك');
        const rows = (
          await db.query(
            'SELECT active FROM catalog_categories WHERE id=ANY($1::uuid[]) FOR SHARE',
            [c.path],
          )
        ).rows;
        if (rows.some((r) => !r.active))
          throw new ConflictException('التصنيف أو أصله مخفي');
      }
      const result = (
        await db.query(
          'UPDATE products SET category_id=$3,tags=$4,version=version+1 WHERE id=$1 AND clinic_id=$2 RETURNING id,version,category_id,tags',
          [id, clinic, i.categoryId, i.tags],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.product_classified', clinic, {
        productId: id,
        categoryId: i.categoryId,
      });
      return result;
    });
  }
  publicCategories() {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT taxonomy.id,taxonomy.clinic_id,taxonomy.name,taxonomy.path,(SELECT jsonb_agg(a.name ORDER BY array_position(taxonomy.path,a.id)) FROM catalog_categories a WHERE a.id=ANY(taxonomy.path)) names FROM catalog_categories taxonomy WHERE NOT EXISTS(SELECT 1 FROM catalog_categories a WHERE a.id=ANY(taxonomy.path) AND NOT a.active) AND EXISTS(SELECT 1 FROM products p ${storefrontJoin} JOIN catalog_categories selected ON selected.id=p.category_id WHERE taxonomy.id=ANY(selected.path) AND NOT EXISTS(SELECT 1 FROM catalog_categories a WHERE a.id=ANY(selected.path) AND NOT a.active) AND ${sellableSql}) ORDER BY taxonomy.name LIMIT 500`,
          )
        ).rows,
    );
  }
  search(i: { categoryId?: string; tag?: string; q: string }) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT ${publicProductSql} FROM products p ${storefrontJoin} WHERE ${sellableSql} AND strpos(lower(p.name||' '||p.description||' '||c.name),lower($1))>0 AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM unnest(p.tags) t WHERE lower(t)=lower($2))) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM catalog_categories selected WHERE selected.id=p.category_id AND $3=ANY(selected.path) AND NOT EXISTS(SELECT 1 FROM catalog_categories a WHERE a.id=ANY(selected.path) AND NOT a.active))) ORDER BY p.name,p.id LIMIT 200`,
            [i.q, i.tag ?? null, i.categoryId ?? null],
          )
        ).rows,
    );
  }
}
@Controller('api/v1')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}
  @Get('clinics/:id/categories') async list(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.taxonomy.list((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/categories') async create(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          name: label,
          parentId: z.uuid().nullable(),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      body,
    );
    return this.taxonomy.create((await requireSession(r)).user.id, uuid(id), i);
  }
  @Patch('clinics/:id/categories/:categoryId') async availability(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('categoryId') category: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({ version: z.number().int().positive(), active: z.boolean() })
        .strict(),
      body,
    );
    return this.taxonomy.availability(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(category),
      i,
    );
  }
  @Post('clinics/:id/products/:productId/classification') async classify(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('productId') product: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          version: z.number().int().positive(),
          categoryId: z.uuid().nullable(),
          tags,
        })
        .strict(),
      body,
    );
    return this.taxonomy.classify(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(product),
      i,
    );
  }
  @Get('marketplace/categories') async categories(@Req() r: Request) {
    await requireSession(r);
    return this.taxonomy.publicCategories();
  }
  @Get('marketplace/search') async search(
    @Req() r: Request,
    @Query() query: unknown,
  ) {
    await requireSession(r);
    return this.taxonomy.search(
      parse(
        z
          .object({
            categoryId: z.uuid().optional(),
            tag: label.pipe(z.string().max(30)).optional(),
            q: z.string().trim().max(100).default(''),
          })
          .strict(),
        query,
      ),
    );
  }
}
