import { Controller, Get, Post, Req, Param, Body } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { GroomingService } from './grooming.js';
const name = z.string().trim().min(1).max(100),
  money = z.string().regex(/^[1-9]\d{0,11}$/),
  code = z.string().regex(/^[A-Z0-9_-]{1,20}$/);
@Controller('api/v1')
export class GroomingController {
  constructor(private readonly service: GroomingService) {}
  @Get('grooming/catalog') async catalog(@Req() r: Request) {
    await requireSession(r);
    return this.service.catalog();
  }
  @Get('me/grooming') async mine(@Req() r: Request) {
    return this.service.mine((await requireSession(r)).user.id);
  }
  @Get('clinics/:id/grooming') async management(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.management((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/grooming-services') async create(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          branchId: z.uuid(),
          name,
          description: z.string().trim().max(3000),
          species: z
            .array(z.enum(['cat', 'dog', 'bird', 'rabbit', 'other']))
            .min(1)
            .max(5),
          priceMinor: money,
          minutes: z.number().int().min(15).max(180),
          addons: z
            .array(
              z
                .object({
                  code,
                  name,
                  priceMinor: money,
                  minutes: z.number().int().min(0).max(120),
                })
                .strict(),
            )
            .max(10),
        })
        .strict(),
      b,
    );
    return this.service.create((await requireSession(r)).user.id, uuid(id), i);
  }
  @Post('clinics/:id/grooming-slots') async slot(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          serviceId: z.uuid(),
          staffId: z.uuid(),
          resourceId: z.uuid(),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
        })
        .strict(),
      b,
    );
    return this.service.slot((await requireSession(r)).user.id, uuid(id), i);
  }
  @Post('clinics/:id/grooming-services/:serviceId/availability')
  async serviceAvailability(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('serviceId') service: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({ active: z.boolean(), version: z.number().int().positive() })
        .strict(),
      b,
    );
    return this.service.availability(
      (await requireSession(r)).user.id,
      uuid(id),
      'service',
      uuid(service),
      i.active,
      i.version,
    );
  }
  @Post('clinics/:id/grooming-slots/:slotId/availability')
  async slotAvailability(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('slotId') slot: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({ active: z.boolean(), version: z.number().int().positive() })
        .strict(),
      b,
    );
    return this.service.availability(
      (await requireSession(r)).user.id,
      uuid(id),
      'slot',
      uuid(slot),
      i.active,
      i.version,
    );
  }
  @Post('sandbox/grooming') async book(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          slotId: z.uuid(),
          petId: z.uuid(),
          addonCodes: z.array(code).max(10),
          priceMinor: money,
          photosConsent: z.boolean(),
          idempotencyKey: z.uuid(),
        })
        .strict(),
      b,
    );
    return this.service.book((await requireSession(r)).user.id, i);
  }
  @Post('clinics/:id/grooming/:bookingId/transition') async transition(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('bookingId') booking: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          status: z.enum(['in_progress', 'completed']),
          photos: z.array(z.uuid()).max(4).default([]),
        })
        .strict(),
      b,
    );
    return this.service.transition(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(booking),
      i.status,
      i.photos,
    );
  }
  @Post('sandbox/grooming/:id/cancel') async cancel(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.cancel((await requireSession(r)).user.id, uuid(id));
  }
  @Post('grooming/:id/withdraw-photos') async withdraw(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.withdrawPhotos(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('grooming/:id/review') async review(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          rating: z.number().int().min(1).max(5),
          body: z.string().trim().min(5).max(1000),
        })
        .strict(),
      b,
    );
    return this.service.review((await requireSession(r)).user.id, uuid(id), i);
  }
}
