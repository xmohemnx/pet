import { Controller, Get, Patch, Post, Req, Param, Body } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { CatalogService } from './catalog.js';
const short = z.string().trim().max(100),
  text = z.string().trim().max(3000),
  version = z.number().int().positive();
@Controller('api/v1')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Post('clinics/:id/products/:productId/variant-matrix') async matrix(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('productId') product: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          version,
          idempotencyKey: z.uuid(),
          skuPrefix: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/),
          priceMinor: z.string().regex(/^[1-9]\d{0,11}$/),
          costMinor: z.string().regex(/^(0|[1-9]\d{0,11})$/),
          dimensions: z
            .array(
              z
                .object({
                  name: z.string().min(1).max(100),
                  values: z.array(z.string().min(1).max(100)).min(1).max(8),
                })
                .strict(),
            )
            .min(1)
            .max(3),
        })
        .strict(),
      body,
    );
    return this.catalog.matrix(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(product),
      input,
    );
  }
  @Get('products/:id') async detail(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    await requireSession(r);
    return this.catalog.detail(uuid(id));
  }
  @Patch('clinics/:id/products/:productId/catalog') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('productId') product: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          version,
          category: short,
          brand: short,
          barcode: z
            .string()
            .trim()
            .max(64)
            .regex(/^[A-Za-z0-9-]*$/),
          unit: short.min(1),
          ageSuitability: short,
          specifications: z
            .array(
              z
                .object({
                  name: short.min(1),
                  value: z.string().trim().min(1).max(300),
                })
                .strict(),
            )
            .max(12),
          images: z
            .array(
              z
                .object({
                  assetId: z.uuid(),
                  alt: z.string().trim().min(1).max(180),
                })
                .strict(),
            )
            .max(6),
          publicationConsent: z.boolean(),
        })
        .strict(),
      b,
    );
    return this.catalog.edit(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(product),
      i,
    );
  }
  @Get('stores/:id') async store(@Req() r: Request, @Param('id') id: string) {
    await requireSession(r);
    return this.catalog.store(uuid(id));
  }
  @Get('clinics/:id/storefront') async settings(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.catalog.store(uuid(id), (await requireSession(r)).user.id);
  }
  @Patch('clinics/:id/storefront') async update(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          version,
          published: z.boolean(),
          displayName: short.min(1),
          description: text,
          city: short,
          openingHours: z.string().trim().max(1000),
          deliveryPolicy: text,
          returnPolicy: text,
          logoAssetId: z.uuid().nullable(),
          coverAssetId: z.uuid().nullable(),
          publicationConsent: z.boolean(),
        })
        .strict(),
      b,
    );
    return this.catalog.store(uuid(id), (await requireSession(r)).user.id, i);
  }
}
