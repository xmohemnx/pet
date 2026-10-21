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
import { SchedulingService } from './scheduling.js';
const date = z.iso.date(),
  name = z.string().trim().min(1).max(100);
const timeOff = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().trim().min(2).max(300),
  })
  .strict();
@Controller('api/v1')
export class SchedulingController {
  constructor(private readonly schedule: SchedulingService) {}
  @Get('care/directory') async directory(
    @Req() req: Request,
    @Query('q') q = '',
    @Query('city') city = '',
    @Query('specialty') specialty = '',
  ) {
    await requireSession(req);
    return this.schedule.directory(
      parse(z.string().max(100), q),
      parse(z.string().max(100), city),
      parse(z.string().max(100), specialty),
    );
  }
  @Get('doctor/public-profile') async profile(@Req() req: Request) {
    return this.schedule.profile((await requireSession(req)).user.id);
  }
  @Post('doctor/public-profile') async saveProfile(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.schedule.profile(
      (await requireSession(req)).user.id,
      parse(
        z
          .object({
            specialty: name,
            bio: z.string().trim().max(1500),
            languages: z.array(name).min(1).max(5),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('clinics/:clinicId/resources') async resources(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
  ) {
    return this.schedule.resources(
      (await requireSession(req)).user.id,
      uuid(clinicId),
    );
  }
  @Post('clinics/:clinicId/resources') async createResource(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Body() body: unknown,
  ) {
    return this.schedule.resources(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      parse(z.object({ name, branchId: z.uuid() }).strict(), body),
    );
  }
  @Get('doctor/clinics/:clinicId/planning') async planning(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
  ) {
    return this.schedule.plan(
      (await requireSession(req)).user.id,
      uuid(clinicId),
    );
  }
  @Post('doctor/clinics/:clinicId/working-hours') async rule(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Body() body: unknown,
  ) {
    return this.schedule.rule(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      parse(
        z
          .object({
            branchId: z.uuid(),
            serviceId: z.uuid(),
            resourceId: z.uuid().optional(),
            weekday: z.number().int().min(0).max(6),
            startMinute: z.number().int().min(0).max(1439),
            endMinute: z.number().int().min(1).max(1440),
          })
          .strict()
          .refine((i) => i.endMinute > i.startMinute),
        body,
      ),
    );
  }
  @Delete('doctor/clinics/:clinicId/working-hours/:id') async removeRule(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
  ) {
    return this.schedule.removeRule(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      uuid(id),
    );
  }
  @Post('doctor/clinics/:clinicId/working-hours/:id/generate') async generate(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(z.object({ from: date, through: date }).strict(), body);
    return this.schedule.generate(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      uuid(id),
      i.from,
      i.through,
    );
  }
  @Post('doctor/clinics/:clinicId/time-off') async absence(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Body() body: unknown,
  ) {
    return this.schedule.timeOff(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      parse(timeOff, body),
    );
  }
  @Post('clinics/:clinicId/closures') async closure(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Body() body: unknown,
  ) {
    return this.schedule.timeOff(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      parse(timeOff, body),
      true,
    );
  }
  @Delete('clinics/:clinicId/time-off/:id') async removeTimeOff(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
  ) {
    return this.schedule.removeTimeOff(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      uuid(id),
    );
  }
  @Get('clinics/:clinicId/calendar') async day(
    @Req() req: Request,
    @Param('clinicId') clinicId: string,
    @Query('date') day: string,
  ) {
    return this.schedule.clinicDay(
      (await requireSession(req)).user.id,
      uuid(clinicId),
      parse(date, day),
    );
  }
  @Post('appointments/:id/attendance') async attendance(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          state: z.enum(['checked_in', 'in_progress', 'no_show']),
          version: z.number().int().positive(),
        })
        .strict(),
      body,
    );
    return this.schedule.attendance(
      (await requireSession(req)).user.id,
      uuid(id),
      i.state,
      i.version,
    );
  }
  @Post('appointments/:id/review') async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = parse(
      z
        .object({
          rating: z.number().int().min(1).max(5),
          body: z.string().trim().min(5).max(1000),
        })
        .strict(),
      body,
    );
    return this.schedule.review(
      (await requireSession(req)).user.id,
      uuid(id),
      i.rating,
      i.body,
    );
  }
}
