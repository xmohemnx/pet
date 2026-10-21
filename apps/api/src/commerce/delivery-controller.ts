import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Param,
  Body,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { DeliveryService } from './delivery.js';
const short = z.string().trim().min(1).max(100),
  fields = {
    label: short,
    contactName: short,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9 -]{6,19}$/),
    province: short,
    city: short,
    area: short,
    street: z.string().trim().min(1).max(300),
    building: short,
    landmark: z.string().trim().max(300),
  };
@Controller('api/v1')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}
  @Get('me/delivery-addresses') async list(@Req() r: Request) {
    return this.delivery.addresses((await requireSession(r)).user.id);
  }
  @Post('me/delivery-addresses') async create(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.delivery.save(
      (await requireSession(r)).user.id,
      parse(z.object(fields).strict(), b),
    );
  }
  @Patch('me/delivery-addresses/:id') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ ...fields, version: z.number().int().positive() }).strict(),
      b,
    );
    return this.delivery.save(
      (await requireSession(r)).user.id,
      i,
      uuid(id),
      i.version,
    );
  }
  @Delete('me/delivery-addresses/:id') async remove(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.delivery.remove((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/orders/:orderId/tracking') async tracking(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('orderId') order: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          carrier: short,
          trackingCode: short,
          version: z.number().int().nonnegative(),
        })
        .strict(),
      b,
    );
    return this.delivery.tracking(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(order),
      i,
    );
  }
}
