import { Controller, Get, Post, Req, Param, Body } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { BoardingService } from './boarding.js';
const version = z.number().int().positive();
@Controller('api/v1')
export class BoardingController {
  constructor(private readonly boarding: BoardingService) {}
  @Get('boarding/:id') async detail(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.boarding.detail((await requireSession(r)).user.id, uuid(id));
  }
  @Get('clinics/:id/boarding') async management(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.boarding.management(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('boarding/:id/accept-policy') async policy(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z.object({ version, policyAccepted: z.literal(true) }).strict(),
      body,
    );
    return this.boarding.acceptPolicy(
      (await requireSession(r)).user.id,
      uuid(id),
      i.version,
    );
  }
  @Post('clinics/:id/boarding-units/:unitId/availability') async availability(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Body() body: unknown,
  ) {
    const i = parse(z.object({ version, active: z.boolean() }).strict(), body);
    return this.boarding.availability(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(unitId),
      i.version,
      i.active,
    );
  }
  @Post('clinics/:id/boarding/:bookingId/reviews') async review(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('bookingId') bid: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          version,
          decision: z.enum(['approved', 'rejected']),
          weightGrams: z.number().int().min(1).max(2000000),
          vaccinesChecked: z.boolean(),
          validThrough: z.iso.date(),
          notes: z.string().trim().min(5).max(2000),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      body,
    );
    return this.boarding.review(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(bid),
      i,
    );
  }
  @Post('clinics/:id/boarding/:bookingId/incidents') async log(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('bookingId') bid: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          kind: z.enum(['incident', 'resolution']),
          severity: z.enum(['low', 'attention', 'urgent']),
          body: z.string().trim().min(5).max(2000),
          resolvesId: z.uuid().nullable().default(null),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      body,
    );
    return this.boarding.log(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(bid),
      i,
    );
  }
  @Post('clinics/:id/boarding/:bookingId/cancel') async cancel(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('bookingId') bid: string,
  ) {
    return this.boarding.cancel(
      (await requireSession(r)).user.id,
      uuid(bid),
      uuid(id),
    );
  }
}
