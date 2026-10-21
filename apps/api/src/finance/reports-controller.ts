import { Controller, Get, Req, Query, Param } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { FinancialReports } from './reports.js';
import { requireSession, parse, uuid } from '../identity/session.js';
@Controller('api/v1/clinics/:id/finance')
export class FinancialReportsController {
  constructor(private readonly reports: FinancialReports) {}
  @Get('statements') async read(
    @Req() r: Request,
    @Param('id') id: string,
    @Query('asOf') asOf: string,
  ) {
    return this.reports.read(
      (await requireSession(r)).user.id,
      uuid(id),
      parse(z.iso.date(), asOf),
    );
  }
}
