import { Controller, Get, Post, Req, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { RideService } from './rides.js';
const name = z.string().trim().min(2).max(100),
  text = z.string().trim().min(5).max(1000),
  lat = z.number().min(-90).max(90),
  lng = z.number().min(-180).max(180);
@ApiTags('نقل الحيوانات والسائق')
@Controller('api/v1')
export class RideController {
  constructor(private readonly rides: RideService) {}
  @Get('me/rides') async mine(@Req() r: Request) {
    return this.rides.mine((await requireSession(r)).user.id);
  }
  @Get('driver/home') async home(@Req() r: Request) {
    return this.rides.driverHome((await requireSession(r)).user.id);
  }
  @Post('driver/vehicle') async vehicle(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          plate: name,
          description: text,
          city: name,
          expiresOn: z.iso.date(),
          available: z.boolean(),
          capacity: z.number().int().min(1).max(5).default(1),
          allowedSpecies: z
            .array(z.enum(['all', 'cat', 'dog', 'bird', 'rabbit', 'other']))
            .min(1)
            .max(6)
            .default(['all']),
          passengerAllowed: z.boolean().default(false),
        })
        .strict(),
      b,
    );
    return this.rides.vehicle((await requireSession(r)).user.id, i);
  }
  @Post('sandbox/rides') async request(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          policyAccepted: z.literal(true),
          petId: z.uuid(),
          city: name,
          originLabel: text,
          destinationLabel: text,
          originLat: lat,
          originLng: lng,
          destinationLat: lat,
          destinationLng: lng,
          idempotencyKey: z.uuid(),
          extraPetIds: z.array(z.uuid()).max(4).default([]),
          scheduledAt: z.iso.datetime().nullable().default(null),
          transportNotes: z.string().trim().max(1000).default(''),
          accompanying: z.boolean().default(false),
        })
        .strict(),
      b,
    );
    return this.rides.request((await requireSession(r)).user.id, i);
  }
  @Post('rides/:id/claim') async claim(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.rides.claim((await requireSession(r)).user.id, uuid(id));
  }
  @Post('rides/:id/transition') async transition(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          status: z.enum([
            'driver_en_route',
            'arrived',
            'in_transit',
            'completed',
          ]),
        })
        .strict(),
      b,
    );
    return this.rides.transition(
      (await requireSession(r)).user.id,
      uuid(id),
      i.status,
    );
  }
  @Post('rides/:id/cancel') async cancel(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.rides.cancel((await requireSession(r)).user.id, uuid(id));
  }
  @Get('rides/:id/location') async location(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.rides.location((await requireSession(r)).user.id, uuid(id));
  }
  @Post('rides/:id/location') async share(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ lat, lng, shared: z.boolean() }).strict(), b);
    return this.rides.location((await requireSession(r)).user.id, uuid(id), i);
  }
  @Post('rides/:id/incidents') async incident(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ description: text }).strict(), b);
    return this.rides.incident(
      (await requireSession(r)).user.id,
      uuid(id),
      i.description,
    );
  }
}
