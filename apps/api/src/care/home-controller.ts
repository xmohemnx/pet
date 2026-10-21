import { Controller, Get, Post, Req, Param, Query, Body } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { parse, uuid, requireSession } from '../identity/session.js';
import { HomeVisitsService } from './home-visits.js';
const name = z.string().trim().min(2).max(100),
  money = z.string().regex(/^(0|[1-9]\d{0,11})$/),
  version = z.number().int().positive();
@Controller('api/v1')
export class HomeVisitsController {
  constructor(private readonly home: HomeVisitsService) {}
  @Get('home-visits/catalog') async catalog(
    @Req() r: Request,
    @Query('city') city = '',
  ) {
    await requireSession(r);
    return this.home.catalog(parse(z.string().trim().max(100), city));
  }
  @Get('me/home-visits') async mine(@Req() r: Request) {
    return this.home.mine((await requireSession(r)).user.id);
  }
  @Get('home-visits/:id') async detail(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.home.detail((await requireSession(r)).user.id, uuid(id));
  }
  @Get('clinics/:id/home-visits') async management(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.home.management((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/home-visits/offers') async offer(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          branchId: z.uuid(),
          serviceId: z.uuid(),
          doctorId: z.uuid(),
          name,
          description: z.string().trim().max(1500),
          city: name,
          district: name,
          species: z
            .array(z.enum(['cat', 'dog', 'bird', 'rabbit', 'other']))
            .min(1)
            .max(5),
          serviceMinor: money,
          travelMinor: money,
          travelMinutes: z.number().int().min(5).max(120),
        })
        .strict(),
      body,
    );
    return this.home.create((await requireSession(r)).user.id, uuid(id), i);
  }
  @Post('clinics/:id/home-visits/offers/:offerId/availability')
  async availability(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
  ) {
    const i = parse(z.object({ version, active: z.boolean() }).strict(), body);
    return this.home.availability(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(offerId),
      i.version,
      i.active,
    );
  }
  @Post('clinics/:id/home-visits/slots') async slot(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z.object({ offerId: z.uuid(), startsAt: z.iso.datetime() }).strict(),
      body,
    );
    return this.home.publish(
      (await requireSession(r)).user.id,
      uuid(id),
      i.offerId,
      i.startsAt,
    );
  }
  @Post('sandbox/home-visits') async book(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          slotId: z.uuid(),
          petId: z.uuid(),
          priceMinor: money,
          contactName: name,
          phone: z
            .string()
            .trim()
            .min(7)
            .max(24)
            .regex(/^\+?[0-9][0-9 ()-]+$/),
          addressLine: z.string().trim().min(5).max(500),
          notes: z.string().trim().max(1000).default(''),
          addressConsent: z.literal(true),
          medicalConsent: z.literal(true),
          areaConfirmed: z.literal(true),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      body,
    );
    return this.home.book((await requireSession(r)).user.id, i);
  }
  @Post('home-visits/:id/dispatch') async dispatch(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z.object({ version, state: z.enum(['en_route', 'arrived']) }).strict(),
      body,
    );
    return this.home.dispatch(
      (await requireSession(r)).user.id,
      uuid(id),
      i.version,
      i.state,
    );
  }
  @Post('sandbox/home-visits/:id/cancel') async cancel(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.home.cancel((await requireSession(r)).user.id, uuid(id));
  }
}
