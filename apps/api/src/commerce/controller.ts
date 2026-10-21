import { Controller, Get, Post, Patch, Req, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  requireSession,
  requireFinancialSession,
  parse,
  uuid,
} from '../identity/session.js';
import { CommerceService } from './service.js';
import { FinanceService } from '../finance/ledger.js';
import { couponInputs, quoteItems } from './pricing-controller.js';
const name = z.string().trim().min(1).max(100),
  text = z.string().trim().max(3000),
  money = z.string().regex(/^(0|[1-9]\d{0,11})$/),
  quantity = z.number().int().min(1).max(10000);
@ApiTags('تجارة العيادة والدفتر الاختباري')
@Controller('api/v1')
export class CommerceController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly finance: FinanceService,
  ) {}
  @Get('me/cart') async cart(@Req() r: Request) {
    return this.commerce.cart((await requireSession(r)).user.id);
  }
  @Post('me/cart') async saveCart(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          items: z
            .array(z.object({ productId: z.uuid(), quantity }).strict())
            .max(30),
        })
        .strict(),
      b,
    );
    return this.commerce.cart((await requireSession(r)).user.id, i.items);
  }
  @Get('me/wishlist') async wishlist(@Req() r: Request) {
    return this.commerce.wishlist((await requireSession(r)).user.id);
  }
  @Post('products/:id/wishlist') async saveWishlist(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ enabled: z.boolean() }).strict(), b);
    return this.commerce.wishlist(
      (await requireSession(r)).user.id,
      uuid(id),
      i.enabled,
    );
  }
  @Get('products/:id/reviews') async reviews(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.commerce.reviews((await requireSession(r)).user.id, uuid(id));
  }
  @Post('products/:id/reviews') async review(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          orderLineId: z.uuid(),
          rating: z.number().int().min(1).max(5),
          body: text.min(5),
        })
        .strict(),
      b,
    );
    return this.commerce.reviews(
      (await requireSession(r)).user.id,
      uuid(id),
      i,
    );
  }
  @Get('marketplace') async catalog(@Req() r: Request) {
    await requireSession(r);
    return this.commerce.catalog();
  }
  @Get('stores/:id/products') async storeProducts(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    await requireSession(r);
    return this.commerce.catalog(uuid(id));
  }
  @Get('me/orders') async orders(@Req() r: Request) {
    return this.commerce.orders((await requireSession(r)).user.id);
  }
  @Get('clinics/:id/commerce') async clinic(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.commerce.clinic((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/products') async product(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          sku: name,
          name,
          description: text.default(''),
          species: name.default('all'),
          priceMinor: money,
          costMinor: money,
          parentProductId: z.uuid().optional(),
          variantLabel: name.optional(),
        })
        .strict(),
      b,
    );
    return this.commerce.product(
      (await requireSession(r)).user.id,
      uuid(id),
      i,
    );
  }
  @Patch('clinics/:id/products/:productId') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('productId') pid: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          name,
          description: text,
          priceMinor: money,
          active: z.boolean(),
          version: z.number().int().positive(),
        })
        .strict(),
      b,
    );
    return this.commerce.editProduct(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(pid),
      i,
    );
  }
  @Post('clinics/:id/vendors') async vendor(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ name, contact: text }).strict(), b);
    return this.commerce.vendor(
      (await requireSession(r)).user.id,
      uuid(id),
      i.name,
      i.contact,
    );
  }
  @Post('clinics/:id/purchases') async purchase(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          productId: z.uuid(),
          vendorId: z.uuid(),
          quantity,
          unitCost: money,
        })
        .strict(),
      b,
    );
    return this.commerce.purchase(
      (await requireSession(r)).user.id,
      uuid(id),
      i.productId,
      i.vendorId,
      i.quantity,
      i.unitCost,
    );
  }
  @Post('clinics/:id/purchases/:poId/receive') async receive(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('poId') po: string,
  ) {
    return this.commerce.receive(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(po),
    );
  }
  @Post('clinics/:id/purchases/:poId/bill') async bill(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('poId') po: string,
  ) {
    return this.commerce.bill(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(po),
    );
  }
  @Post('checkout') async checkout(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          idempotencyKey: z.uuid(),
          items: quoteItems,
          coupons: couponInputs,
          quoteHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          address: text.min(5).optional(),
          addressId: z.uuid().optional(),
        })
        .strict()
        .refine((i) => Boolean(i.address) !== Boolean(i.addressId)),
      b,
    );
    return this.commerce.checkout(
      (await requireSession(r)).user.id,
      i.idempotencyKey,
      i.items,
      i.address,
      i.addressId,
      i.coupons,
      i.quoteHash,
    );
  }
  @Post('sandbox/orders/:id/capture') async capture(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ eventKey: z.uuid() }).strict(), b);
    return this.commerce.capture(
      (await requireSession(r)).user.id,
      uuid(id),
      i.eventKey,
    );
  }
  @Post('orders/:id/cancel') async cancel(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.commerce.cancel((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/orders/:orderId/transition') async fulfill(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('orderId') oid: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ status: z.enum(['packed', 'shipped', 'delivered']) }).strict(),
      b,
    );
    return this.commerce.fulfill(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(oid),
      i.status,
    );
  }
  @Post('order-lines/:id/returns') async requestReturn(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ quantity, reason: text.min(10) }).strict(), b);
    return this.commerce.requestReturn(
      (await requireSession(r)).user.id,
      uuid(id),
      i.quantity,
      i.reason,
    );
  }
  @Post('clinics/:id/returns/:returnId/approve') async approveReturn(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('returnId') rid: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ restock: z.boolean() }).strict(), b);
    return this.commerce.approveReturn(
      (await requireFinancialSession(r)).user.id,
      uuid(id),
      uuid(rid),
      i.restock,
    );
  }
  @Get('clinics/:id/finance') async summary(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.finance.summary((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/finance/approvals') async requestFinance(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          kind: z.enum(['vendor_payment', 'reversal']),
          sourceId: z.uuid(),
          reason: text.min(10),
          amountMinor: money.optional(),
        })
        .strict(),
      b,
    );
    return this.finance.request(
      (await requireSession(r)).user.id,
      uuid(id),
      i.kind,
      i.sourceId,
      i.reason,
      i.amountMinor,
    );
  }
  @Post('clinics/:id/finance/approvals/:approvalId/approve') async approve(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('approvalId') aid: string,
  ) {
    return this.finance.approve(
      (await requireFinancialSession(r)).user.id,
      uuid(id),
      uuid(aid),
    );
  }
  @Post('clinics/:id/finance/journals') async manual(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          idempotencyKey: z.uuid(),
          description: text.min(5),
          date: z.iso.date(),
          lines: z
            .array(
              z
                .object({
                  account: z.string().regex(/^\d{4}$/),
                  debit: money,
                  credit: money,
                })
                .strict(),
            )
            .min(2)
            .max(30),
        })
        .strict(),
      b,
    );
    return this.finance.manual(
      (await requireSession(r)).user.id,
      uuid(id),
      i.idempotencyKey,
      i.description,
      i.date,
      i.lines,
    );
  }
  @Post('clinics/:id/finance/approvals/:approvalId/reject') async reject(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('approvalId') aid: string,
  ) {
    return this.finance.reject(
      (await requireFinancialSession(r)).user.id,
      uuid(id),
      uuid(aid),
    );
  }
  @Post('clinics/:id/finance/periods/close') async close(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ startsOn: z.iso.date(), endsOn: z.iso.date() }).strict(),
      b,
    );
    return this.finance.close(
      (await requireSession(r)).user.id,
      uuid(id),
      i.startsOn,
      i.endsOn,
    );
  }
}
