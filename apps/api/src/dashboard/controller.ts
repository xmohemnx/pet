import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  bannerInputSchema,
  caseReportInputSchema,
} from '../../../../packages/contracts/src/index.js';
import {
  requireSession,
  requireAdmin,
  parse,
  uuid,
} from '../identity/session.js';
import { database } from '../database.js';
import { DashboardService } from './service.js';
const review = z
  .object({
    decision: z.string(),
    reason: z.string().trim().min(10).max(1000),
    version: z.number().int().positive(),
  })
  .strict();
@Controller('api/v1')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('me/dashboard') async overview(
    @Req() r: Request,
    @Query('kind') kind: string,
    @Query('clinicId') clinic?: string,
  ) {
    return this.dashboard.overview(
      (await requireSession(r)).user.id,
      parse(z.enum(['customer', 'doctor', 'clinic', 'driver']), kind),
      clinic ? uuid(clinic) : undefined,
    );
  }
  @Get('site/banners') async banners(@Req() r: Request) {
    await requireSession(r);
    return this.dashboard.banners();
  }
  @Get('admin/dashboard') async admin(@Req() r: Request) {
    await requireAdmin(r);
    const [counts, banners, verifications, reports, users] = await Promise.all([
      this.dashboard.adminOverview(),
      this.dashboard.banners(true),
      this.dashboard.verifications(),
      this.dashboard.reports(),
      database.query(
        'SELECT u.id,u.name,u.email,u.account_type,EXISTS(SELECT 1 FROM account_verification_requests v WHERE v.user_id=u.id AND v.status=\'verified\') identity_verified FROM auth_users u WHERE u.closed_at IS NULL ORDER BY u."createdAt" DESC LIMIT 100',
      ),
    ]);
    return { counts, banners, verifications, reports, users: users.rows };
  }
  @Post('admin/banners') async create(@Req() r: Request, @Body() b: unknown) {
    return this.dashboard.saveBanner(
      (await requireAdmin(r)).user.id,
      parse(bannerInputSchema, b),
    );
  }
  @Patch('admin/banners/:id') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const input = parse(
      z
        .object({
          version: z.number().int().positive(),
          banner: bannerInputSchema,
        })
        .strict(),
      b,
    );
    return this.dashboard.saveBanner(
      (await requireAdmin(r)).user.id,
      input.banner,
      uuid(id),
      input.version,
    );
  }
  @Delete('admin/banners/:id') async remove(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.dashboard.deleteBanner(
      (await requireAdmin(r)).user.id,
      uuid(id),
      parse(z.object({ version: z.number().int().positive() }).strict(), b)
        .version,
    );
  }
  @Get('me/verifications') async verifications(@Req() r: Request) {
    return this.dashboard.verifications((await requireSession(r)).user.id);
  }
  @Post('me/verifications') async request(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.dashboard.requestVerification(
      (await requireSession(r)).user.id,
      parse(
        z.object({ reference: z.string().trim().min(10).max(1000) }).strict(),
        b,
      ).reference,
    );
  }
  @Post('admin/verifications/:id/decision') async reviewIdentity(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      review.extend({ decision: z.enum(['verified', 'rejected', 'revoked']) }),
      b,
    );
    return this.dashboard.reviewVerification(
      (await requireAdmin(r)).user.id,
      uuid(id),
      i.decision,
      i.reason,
      i.version,
    );
  }
  @Get('doctor/portfolio-reports') async reports(@Req() r: Request) {
    return this.dashboard.reports((await requireSession(r)).user.id);
  }
  @Get('clinics/:id/portfolio-reports') async clinicReports(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.dashboard.reports((await requireSession(r)).user.id, uuid(id));
  }
  @Post('doctor/portfolio-reports') async submit(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.dashboard.submitReport(
      (await requireSession(r)).user.id,
      parse(caseReportInputSchema, b),
    );
  }
  @Post('admin/portfolio-reports/:id/decision') async reviewCase(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      review.extend({ decision: z.enum(['approved', 'rejected', 'revoked']) }),
      b,
    );
    return this.dashboard.reviewReport(
      (await requireAdmin(r)).user.id,
      uuid(id),
      i.decision,
      i.reason,
      i.version,
    );
  }
  @Get('professional-profiles/:kind/:id') async portfolio(
    @Req() r: Request,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    await requireSession(r);
    return this.dashboard.portfolio(
      parse(z.enum(['doctor', 'clinic']), kind),
      uuid(id),
    );
  }
}
