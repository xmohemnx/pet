import { Controller, Get, Post, Req, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  requireSession,
  requireAdmin,
  parse,
  uuid,
} from '../identity/session.js';
import { RescueService } from './rescue.js';
const name = z.string().trim().min(2).max(100),
  text = z.string().trim().min(5).max(3000),
  money = z.string().regex(/^[1-9]\d{0,11}$/);
@ApiTags('التبني والإنقاذ والتبرعات الاختبارية')
@Controller('api/v1')
export class RescueController {
  constructor(private readonly rescue: RescueService) {}
  @Get('adoptions') async listings(@Req() r: Request) {
    await requireSession(r);
    return this.rescue.listings();
  }
  @Get('me/rescue') async mine(@Req() r: Request) {
    return this.rescue.mine((await requireSession(r)).user.id);
  }
  @Post('adoptions') async create(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          petId: z.uuid(),
          title: name,
          description: text,
          city: name,
          requirements: text,
        })
        .strict(),
      b,
    );
    return this.rescue.create((await requireSession(r)).user.id, i);
  }
  @Post('adoptions/:id/applications') async apply(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ privateDetails: text.min(20) }).strict(), b);
    return this.rescue.apply(
      (await requireSession(r)).user.id,
      uuid(id),
      i.privateDetails,
    );
  }
  @Get('adoptions/:id/applications') async applications(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.rescue.applications(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('adoption-applications/:id/decision') async decide(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          decision: z.enum(['approved', 'rejected']),
          reason: text.min(10),
        })
        .strict(),
      b,
    );
    return this.rescue.decide(
      (await requireSession(r)).user.id,
      uuid(id),
      i.decision,
      i.reason,
    );
  }
  @Post('adoption-applications/:id/handover') async handover(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    parse(z.object({ received: z.literal(true) }).strict(), b);
    return this.rescue.handover((await requireSession(r)).user.id, uuid(id));
  }
  @Get('rescue/cases') async cases(@Req() r: Request) {
    await requireSession(r);
    return this.rescue.publicCases();
  }
  @Post('rescue/cases') async createCase(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          kind: z.enum(['rescue', 'lost', 'found']),
          title: name,
          description: text,
          city: name,
          privateLocation: text,
          species: z
            .enum(['unknown', 'cat', 'dog', 'bird', 'rabbit', 'other'])
            .default('unknown'),
        })
        .strict(),
      b,
    );
    return this.rescue.case((await requireSession(r)).user.id, i);
  }
  @Post('rescue/cases/:id/accept') async accept(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ clinicId: z.uuid() }).strict(), b);
    return this.rescue.acceptCase(
      (await requireSession(r)).user.id,
      uuid(id),
      i.clinicId,
    );
  }
  @Post('rescue/cases/:id/transition') async transition(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ status: z.enum(['in_progress', 'resolved']) }).strict(),
      b,
    );
    return this.rescue.caseStatus(
      (await requireSession(r)).user.id,
      uuid(id),
      i.status,
    );
  }
  @Get('clinics/:id/rescue') async assigned(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.rescue.assignedCases(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Get('admin/rescue') async queue(@Req() r: Request) {
    await requireAdmin(r);
    return this.rescue.queue();
  }
  @Post('admin/rescue/:kind/:id') async verify(
    @Req() r: Request,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(z.object({ approved: z.boolean() }).strict(), b);
    return this.rescue.verify(
      actor,
      parse(z.enum(['listing', 'case']), kind),
      uuid(id),
      i.approved,
    );
  }
  @Get('donations/campaigns') async campaigns(@Req() r: Request) {
    await requireSession(r);
    return this.rescue.campaigns();
  }
  @Post('admin/sandbox/campaigns') async campaign(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(
      z
        .object({ name, purpose: text, beneficiary: text, goalMinor: money })
        .strict(),
      b,
    );
    return this.rescue.campaign(actor, i);
  }
  @Post('sandbox/campaigns/:id/donate') async donate(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          amountMinor: money,
          idempotencyKey: z.uuid(),
          anonymous: z.boolean(),
        })
        .strict(),
      b,
    );
    return this.rescue.donate(
      (await requireSession(r)).user.id,
      uuid(id),
      i.amountMinor,
      i.idempotencyKey,
      i.anonymous,
    );
  }
  @Post('sandbox/donations/:id/refund') async refund(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.rescue.refund((await requireSession(r)).user.id, uuid(id));
  }
}
