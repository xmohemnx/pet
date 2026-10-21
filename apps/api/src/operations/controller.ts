import { Controller, Get, Post, Req, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  requireSession,
  requireAdmin,
  requireFinancialSession,
  parse,
  uuid,
} from '../identity/session.js';
import { OperationsService } from './service.js';
const text = z.string().trim().min(2).max(100),
  money = z.string().regex(/^[1-9]\d{0,11}$/);
@ApiTags('التشغيل والإشعارات والمحتوى والتسويات')
@Controller('api/v1')
export class OperationsController {
  constructor(private readonly ops: OperationsService) {}
  @Get('me/notifications') async notifications(@Req() r: Request) {
    return this.ops.notifications((await requireSession(r)).user.id);
  }
  @Post('me/notifications/:id/read') async mark(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.ops.mark((await requireSession(r)).user.id, uuid(id));
  }
  @Get('me/notification-preferences') async preferences(@Req() r: Request) {
    return this.ops.preferences((await requireSession(r)).user.id);
  }
  @Post('me/notification-preferences') async savePreferences(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          inApp: z.boolean(),
          quietStart: z.number().int().min(0).max(23).nullable(),
          quietEnd: z.number().int().min(0).max(23).nullable(),
        })
        .strict(),
      b,
    );
    return this.ops.preferences((await requireSession(r)).user.id, i);
  }
  @Get('content/pages') pages() {
    return this.ops.pages();
  }
  @Get('content/pages/:slug') page(@Param('slug') slug: string) {
    return this.ops.page(parse(z.string().regex(/^[a-z0-9-]{1,60}$/), slug));
  }
  @Get('admin/content') async cmsAll(@Req() r: Request) {
    await requireAdmin(r);
    return this.ops.cmsAll();
  }
  @Post('admin/content/:slug') async cms(
    @Req() r: Request,
    @Param('slug') slug: string,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(
      z
        .object({
          title: text,
          body: z.string().min(10).max(20000),
          published: z.boolean(),
          version: z.number().int().nonnegative(),
        })
        .strict(),
      b,
    );
    return this.ops.cms(
      actor,
      parse(z.string().regex(/^[a-z0-9-]{1,60}$/), slug),
      i,
    );
  }
  @Get('admin/jobs') async jobs(@Req() r: Request) {
    await requireAdmin(r);
    return this.ops.jobs();
  }
  @Post('admin/jobs/:id/retry') async retry(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.ops.retry((await requireAdmin(r)).user.id, uuid(id));
  }
  @Get('admin/incidents') async incidents(@Req() r: Request) {
    await requireAdmin(r);
    return this.ops.incidentQueue();
  }
  @Get('admin/finance') async finance(@Req() r: Request) {
    return this.ops.platformFinance((await requireAdmin(r)).user.id);
  }
  @Post('admin/sandbox/payouts') async payout(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(
      z
        .object({
          kind: z.enum(['clinic', 'driver', 'fund']),
          partyId: z.uuid(),
          amountMinor: money,
        })
        .strict(),
      b,
    );
    return this.ops.payout(actor, i.kind, i.partyId, i.amountMinor);
  }
  @Post('admin/sandbox/payouts/:id/pay') async pay(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    await requireFinancialSession(r);
    return this.ops.pay((await requireAdmin(r)).user.id, uuid(id));
  }
  @Post('admin/sandbox/payouts/:id/cancel') async cancelPayout(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.ops.cancelPayout((await requireAdmin(r)).user.id, uuid(id));
  }
  @Post('admin/sandbox/payouts/:id/reconcile') async reconcile(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(
      z.object({ amountMinor: money, statementReference: text }).strict(),
      b,
    );
    return this.ops.reconcile(
      actor,
      uuid(id),
      i.amountMinor,
      i.statementReference,
    );
  }
}
