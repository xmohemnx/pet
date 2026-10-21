import { Controller, Get, Post, Req, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { ServicesService } from './service.js';
const name = z.string().trim().min(1).max(100),
  money = z.string().regex(/^[1-9]\d{0,11}$/);
@ApiTags('الاشتراكات والإقامة ومتابعة الرعاية')
@Controller('api/v1')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}
  @Get('services/catalog') async catalog(@Req() r: Request) {
    await requireSession(r);
    return this.service.catalog();
  }
  @Get('me/services') async mine(@Req() r: Request) {
    return this.service.mine((await requireSession(r)).user.id);
  }
  @Get('clinics/:id/services/management') async clinic(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.clinic((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/care-plans') async plan(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          serviceId: z.uuid(),
          name,
          priceMinor: money,
          uses: z.number().int().min(1).max(100),
          validDays: z.number().int().min(1).max(730),
        })
        .strict(),
      b,
    );
    return this.service.plan((await requireSession(r)).user.id, uuid(id), i);
  }
  @Post('sandbox/subscriptions') async buy(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({ planId: z.uuid(), petId: z.uuid(), idempotencyKey: z.uuid() })
        .strict(),
      b,
    );
    return this.service.buy(
      (await requireSession(r)).user.id,
      i.planId,
      i.petId,
      i.idempotencyKey,
    );
  }
  @Post('subscriptions/:id/redeem') async redeem(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ encounterId: z.uuid() }).strict(), b);
    return this.service.redeem(
      (await requireSession(r)).user.id,
      uuid(id),
      i.encounterId,
    );
  }
  @Post('clinics/:id/boarding-units') async unit(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          name,
          species: z.enum(['cat', 'dog', 'bird', 'rabbit', 'other']),
          nightPrice: money,
        })
        .strict(),
      b,
    );
    return this.service.unit((await requireSession(r)).user.id, uuid(id), i);
  }
  @Post('sandbox/boarding') async book(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          unitId: z.uuid(),
          petId: z.uuid(),
          startsOn: z.iso.date(),
          endsOn: z.iso.date(),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      b,
    );
    return this.service.book(
      (await requireSession(r)).user.id,
      i.unitId,
      i.petId,
      i.startsOn,
      i.endsOn,
      i.idempotencyKey,
    );
  }
  @Post('sandbox/boarding/:id/cancel') async cancelBoarding(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.cancelBoarding(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('sandbox/subscriptions/:id/cancel') async cancelSubscription(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.cancelSubscription(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('clinics/:id/boarding/:bookingId/transition') async transition(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('bookingId') bid: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          status: z.enum(['checked_in', 'completed']),
          healthReviewed: z.boolean().default(false),
        })
        .strict(),
      b,
    );
    return this.service.transition(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(bid),
      i.status,
      i.healthReviewed,
    );
  }
  @Get('appointments/:id/messages') async messages(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.messages((await requireSession(r)).user.id, uuid(id));
  }
  @Post('appointments/:id/messages') async message(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          body: z.string().trim().min(1).max(3000),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      b,
    );
    return this.service.messages(
      (await requireSession(r)).user.id,
      uuid(id),
      i.body,
      i.idempotencyKey,
    );
  }
  @Post('pets/:id/transfer') async transfer(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ email: z.email() }).strict(), b);
    return this.service.transfer(
      (await requireSession(r)).user.id,
      uuid(id),
      i.email,
    );
  }
  @Post('pet-transfers/:id/accept') async accept(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.acceptTransfer(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Get('pets/:id/weights') async weights(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.weight((await requireSession(r)).user.id, uuid(id));
  }
  @Post('pets/:id/weights') async weight(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          grams: z.number().int().min(1).max(1000000),
          measuredOn: z.iso.date(),
        })
        .strict(),
      b,
    );
    return this.service.weight(
      (await requireSession(r)).user.id,
      uuid(id),
      i.grams,
      i.measuredOn,
    );
  }
}
