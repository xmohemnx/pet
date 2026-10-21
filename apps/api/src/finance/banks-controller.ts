import { Controller, Get, Post, Req, Body, Param } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { BankService } from './banks.js';
@Controller('api/v1/clinics/:id/finance/banks')
export class BankController {
  constructor(private readonly bank: BankService) {}
  @Get() async list(@Req() r: Request, @Param('id') id: string) {
    return this.bank.list((await requireSession(r)).user.id, uuid(id));
  }
  @Post() async account(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          reference: z.string().trim().min(2).max(100),
        })
        .strict(),
      b,
    );
    return this.bank.account(
      (await requireSession(r)).user.id,
      uuid(id),
      i.name,
      i.reference,
    );
  }
  @Post(':bankId/import') async import(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('bankId') bankId: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          lines: z
            .array(
              z
                .object({
                  reference: z.string().min(2).max(100),
                  bookedOn: z.iso.date(),
                  amountMinor: z.string().regex(/^-?[1-9]\d{0,11}$/),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict(),
      b,
    );
    return this.bank.import(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(bankId),
      i.lines,
    );
  }
  @Post('lines/:lineId/match') async match(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ journalLineId: z.uuid() }).strict(), b);
    return this.bank.match(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(lineId),
      i.journalLineId,
    );
  }
}
