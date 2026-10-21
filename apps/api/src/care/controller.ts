import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import {
  petInputSchema,
  visitContentSchema,
} from '../../../../packages/contracts/src/index.js';
import { CareService } from './service.js';
const name = z.string().trim().min(1).max(100);
const revision = z.number().int().nonnegative();
@ApiTags('الرعاية والمواعيد والسجل الطبي')
@Controller('api/v1')
export class CareController {
  constructor(private readonly care: CareService) {}
  @Get('pets') async pets(@Req() r: Request) {
    return this.care.list((await requireSession(r)).user.id);
  }
  @Post('pets') async create(@Req() r: Request, @Body() b: unknown) {
    return this.care.savePet(
      (await requireSession(r)).user.id,
      parse(petInputSchema, b),
    );
  }
  @Get('pets/:id') async detail(
    @Req() r: Request,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.care.detail(
      (await requireSession(r)).user.id,
      uuid(id),
      clinicId ? uuid(clinicId) : undefined,
    );
  }
  @Patch('pets/:id') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const input = parse(
      z.object({ pet: petInputSchema, version: revision }).strict(),
      b,
    );
    return this.care.savePet(
      (await requireSession(r)).user.id,
      input.pet,
      uuid(id),
      input.version,
    );
  }
  @Delete('pets/:id') async archive(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.care.archive((await requireSession(r)).user.id, uuid(id));
  }
  @Post('pets/:id/guardians') async guardian(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          email: z.email(),
          scopes: z
            .array(z.enum(['profile', 'medical', 'booking']))
            .min(1)
            .max(3)
            .refine(
              (v) => v.includes('profile') && new Set(v).size === v.length,
            ),
        })
        .strict(),
      b,
    );
    return this.care.guardian(
      (await requireSession(r)).user.id,
      uuid(id),
      i.email,
      i.scopes,
    );
  }
  @Delete('pets/:id/guardians/:userId') async revokeGuardian(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.care.revokeGuardian(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(userId),
    );
  }
  @Post('pets/:id/consents') async consent(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          clinicId: z.uuid(),
          doctorId: z.uuid(),
          expiresAt: z.iso.datetime(),
        })
        .strict(),
      b,
    );
    return this.care.consent(
      (await requireSession(r)).user.id,
      uuid(id),
      i.clinicId,
      i.doctorId,
      i.expiresAt,
    );
  }
  @Delete('pets/:id/consents/:clinicId/:doctorId') async revokeConsent(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('clinicId') clinicId: string,
    @Param('doctorId') doctorId: string,
  ) {
    return this.care.revokeConsent(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(clinicId),
      uuid(doctorId),
    );
  }
  @Get('care/slots') async slots(
    @Req() r: Request,
    @Query('doctorId') doctorId?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    await requireSession(r);
    return this.care.slots(
      doctorId ? uuid(doctorId) : undefined,
      clinicId ? uuid(clinicId) : undefined,
    );
  }
  @Get('doctor/clinics') async clinics(@Req() r: Request) {
    return this.care.clinics((await requireSession(r)).user.id);
  }
  @Get('doctor/appointments') async appointments(@Req() r: Request) {
    return this.care.doctorAppointments((await requireSession(r)).user.id);
  }
  @Get('clinics/:id/services') async services(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.care.services((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/services') async service(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          name,
          durationMinutes: z.number().int().min(15).max(180),
          bufferMinutes: z.number().int().min(0).max(60).default(0),
          priceMinor: z
            .string()
            .regex(/^(0|[1-9]\d{0,11})$/)
            .default('0'),
          requiresResource: z.boolean().default(false),
        })
        .strict(),
      b,
    );
    return this.care.service(
      (await requireSession(r)).user.id,
      uuid(id),
      i.name,
      i.durationMinutes,
      i,
    );
  }
  @Post('clinics/:id/slots') async publish(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          serviceId: z.uuid(),
          branchId: z.uuid(),
          startsAt: z.iso.datetime(),
          resourceId: z.uuid().optional(),
        })
        .strict(),
      b,
    );
    return this.care.publish(
      (await requireSession(r)).user.id,
      uuid(id),
      i.serviceId,
      i.branchId,
      i.startsAt,
      i.resourceId,
    );
  }
  @Post('appointments') async book(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({ petId: z.uuid(), slotId: z.uuid(), idempotencyKey: z.uuid() })
        .strict(),
      b,
    );
    return this.care.book(
      (await requireSession(r)).user.id,
      i.petId,
      i.slotId,
      i.idempotencyKey,
    );
  }
  @Post('appointments/:id/cancel') async cancel(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.care.cancel((await requireSession(r)).user.id, uuid(id));
  }
  @Post('appointments/:id/encounter') async draft(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ content: visitContentSchema, version: revision }).strict(),
      b,
    );
    return this.care.draft(
      (await requireSession(r)).user.id,
      uuid(id),
      i.content,
      i.version,
    );
  }
  @Post('encounters/:id/sign') async sign(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ version: revision }).strict(), b);
    return this.care.sign(
      (await requireSession(r)).user.id,
      uuid(id),
      i.version,
    );
  }
  @Post('encounters/:id/addenda') async addendum(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ note: z.string().trim().min(1).max(3000) }).strict(),
      b,
    );
    return this.care.addendum(
      (await requireSession(r)).user.id,
      uuid(id),
      i.note,
    );
  }
  @Post('encounters/:id/labs/:labId/review') async reviewLab(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('labId') labId: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ result: z.string().trim().min(1).max(3000) }).strict(),
      b,
    );
    return this.care.reviewLab(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(labId),
      i.result,
    );
  }
  @Post('pets/:id/tasks') async task(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          title: name,
          dueAt: z.iso.datetime(),
          expiresAt: z.iso.datetime().optional(),
        })
        .strict(),
      b,
    );
    return this.care.task(
      (await requireSession(r)).user.id,
      uuid(id),
      i.title,
      i.dueAt,
      i.expiresAt,
    );
  }
  @Post('care/tasks/:id/resolve') async resolve(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ status: z.enum(['completed', 'skipped']) }).strict(),
      b,
    );
    return this.care.resolveTask(
      (await requireSession(r)).user.id,
      uuid(id),
      i.status,
    );
  }
}
