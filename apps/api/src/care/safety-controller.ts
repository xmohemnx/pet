import {
  Controller,
  Get,
  Post,
  Delete,
  Req,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { PetSafetyService } from './safety.js';
@Controller('api/v1')
export class PetSafetyController {
  constructor(private readonly safety: PetSafetyService) {}
  @Get('pets/:id/safety-cards') async list(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.safety.list((await requireSession(r)).user.id, uuid(id));
  }
  @Post('pets/:id/safety-cards') async create(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.safety.create(
      (await requireSession(r)).user.id,
      uuid(id),
      parse(
        z
          .object({
            publishConsent: z.literal(true),
            contactName: z.string().trim().min(2).max(100),
            contactPhone: z.string().regex(/^\+?[0-9 ()-]{7,25}$/),
            message: z.string().trim().max(300),
            expiresAt: z.iso.datetime(),
          })
          .strict(),
        b,
      ),
    );
  }
  @Delete('pets/:id/safety-cards/:cardId') async revoke(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('cardId') cardId: string,
  ) {
    return this.safety.revoke(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(cardId),
    );
  }
  @Get('public/safety/:token') publicCard(@Param('token') token: string) {
    return this.safety.publicCard(token);
  }
  @Get('pets/:id/passport') async passport(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.safety.passport((await requireSession(r)).user.id, uuid(id));
  }
  @Get('me/care-calendar') async calendar(
    @Req() r: Request,
    @Query('month') month: string,
  ) {
    return this.safety.calendar(
      (await requireSession(r)).user.id,
      parse(z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), month),
    );
  }
}
