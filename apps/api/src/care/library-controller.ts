import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { CareLibrary } from './library.js';
const fields = {
  title: z.string().trim().min(5).max(200),
  body: z.string().trim().min(50).max(20000),
  species: z.enum(['all', 'cat', 'dog', 'bird', 'rabbit', 'other']),
  ageGroup: z.enum(['all', 'young', 'adult', 'senior']),
  sources: z
    .array(
      z
        .url()
        .max(500)
        .refine((v) => {
          try {
            const u = new URL(v);
            return u.protocol === 'https:' && !u.username && !u.password;
          } catch {
            return false;
          }
        }),
    )
    .min(1)
    .max(5),
};
@Controller('api/v1')
export class CareLibraryController {
  constructor(private readonly library: CareLibrary) {}
  @Get('care/library') async list(@Req() r: Request, @Query() query: unknown) {
    await requireSession(r);
    const q = parse(
      z
        .object({
          q: z.string().trim().max(100).default(''),
          species: z
            .enum(['', 'cat', 'dog', 'bird', 'rabbit', 'other'])
            .default(''),
          ageGroup: z.enum(['', 'young', 'adult', 'senior']).default(''),
        })
        .strict(),
      query,
    );
    return this.library.list(q);
  }
  @Get('care/library/:id') async detail(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    await requireSession(r);
    return this.library.detail(uuid(id));
  }
  @Get('me/content-corrections') async reports(@Req() r: Request) {
    return this.library.reports((await requireSession(r)).user.id);
  }
  @Post('care/library/:id/corrections') async report(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ reason: z.string().trim().min(10).max(2000) }).strict(),
      b,
    );
    return this.library.report(
      (await requireSession(r)).user.id,
      uuid(id),
      i.reason,
    );
  }
  @Get('clinics/:id/library') async management(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.library.management((await requireSession(r)).user.id, uuid(id));
  }
  @Post('clinics/:id/library') async create(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.library.save(
      (await requireSession(r)).user.id,
      uuid(id),
      parse(z.object(fields).strict(), b),
    );
  }
  @Patch('clinics/:id/library/:articleId') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('articleId') article: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ ...fields, version: z.number().int().positive() }).strict(),
      b,
    );
    return this.library.save(
      (await requireSession(r)).user.id,
      uuid(id),
      i,
      uuid(article),
      i.version,
    );
  }
  @Post('clinics/:id/library/:articleId/review') async review(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('articleId') article: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          approved: z.boolean(),
          note: z.string().trim().min(10).max(2000),
          version: z.number().int().positive(),
        })
        .strict(),
      b,
    );
    return this.library.review(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(article),
      i,
    );
  }
  @Post('clinics/:id/library/:articleId/publication') async publish(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('articleId') article: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          published: z.boolean(),
          version: z.number().int().positive(),
        })
        .strict(),
      b,
    );
    return this.library.publish(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(article),
      i,
    );
  }
  @Post('clinics/:id/content-corrections/:correctionId/resolve') async resolve(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('correctionId') correction: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ response: z.string().trim().min(10).max(2000) }).strict(),
      b,
    );
    return this.library.resolve(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(correction),
      i.response,
    );
  }
}
