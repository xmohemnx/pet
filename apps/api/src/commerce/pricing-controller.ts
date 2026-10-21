import { Controller, Get, Post, Patch, Req, Body, Param } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  requireSession,
  requireFinancialSession,
  parse,
  uuid,
} from '../identity/session.js';
import { CommercePricingService } from './pricing.js';
const money = z.string().regex(/^(0|[1-9]\d{0,11})$/);
export const couponInputs = z
  .array(
    z
      .object({
        clinicId: z.uuid(),
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9_-]{3,32}$/),
      })
      .strict(),
  )
  .max(30)
  .default([]);
export const quoteItems = z
  .array(
    z
      .object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(10000),
      })
      .strict(),
  )
  .min(1)
  .max(30);
@Controller('api/v1')
export class CommercePricingController {
  constructor(private readonly pricing: CommercePricingService) {}
  @Post('checkout/quote') async quote(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z.object({ items: quoteItems, coupons: couponInputs }).strict(),
      b,
    );
    return this.pricing.quote(
      (await requireSession(r)).user.id,
      i.items,
      i.coupons,
    );
  }
  @Get('clinics/:id/pricing') async dashboard(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.pricing.dashboard((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/coupons') async create(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z0-9_-]{3,32}$/),
          kind: z.enum(['fixed', 'percent']),
          value: money,
          minimumMinor: money,
          maximumDiscountMinor: money.nullable(),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
          maxUses: z.number().int().min(1).max(100000),
          maxPerUser: z.number().int().min(1).max(100),
        })
        .strict(),
      b,
    );
    return this.pricing.create((await requireSession(r)).user.id, uuid(id), i);
  }
  @Patch('clinics/:id/coupons/:couponId') async toggle(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('couponId') coupon: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({ active: z.boolean(), version: z.number().int().positive() })
        .strict(),
      b,
    );
    return this.pricing.toggle(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(coupon),
      i.active,
      i.version,
    );
  }
  @Post('clinics/:id/tax-settings') async tax(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          rateBps: z.number().int().min(0).max(10000),
          label: z.string().trim().min(1).max(100),
          version: z.number().int().nonnegative(),
        })
        .strict(),
      b,
    );
    return this.pricing.tax(
      (await requireFinancialSession(r)).user.id,
      uuid(id),
      i,
    );
  }
}
