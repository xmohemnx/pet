import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AccountLifecycle } from './account-lifecycle.js';
import { accountTypes } from '../identity/account-policy.js';
import { parse, uuid } from '../identity/session.js';
@Controller('api/v1')
export class AccountController {
  constructor(private readonly service: AccountLifecycle) {}
  @Get('me/account-type-requests') requests(@Req() req: Request) {
    return this.service.requests(req);
  }
  @Post('me/account-type-requests') request(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.service.request(
      req,
      parse(
        z
          .object({
            targetType: z.enum(accountTypes),
            reason: z.string().trim().min(10).max(1000),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('admin/account-type-requests') queue(@Req() req: Request) {
    return this.service.queue(req);
  }
  @Post('admin/account-type-requests/:id/decision') decision(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.decide(
      req,
      uuid(id),
      parse(
        z
          .object({
            decision: z.enum(['approved', 'rejected']),
            reason: z.string().trim().min(10).max(1000),
            version: z.number().int().positive(),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('me/close-account') close(@Req() req: Request, @Body() body: unknown) {
    return this.service.close(
      req,
      parse(
        z
          .object({
            password: z.string().min(1).max(128),
            confirmation: z.literal('حذف حسابي'),
          })
          .strict(),
        body,
      ),
    );
  }
}
