import {
  Controller,
  Get,
  Post,
  Delete,
  Req,
  Param,
  Body,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { SocialDiscovery } from './discovery.js';
@Controller('api/v1')
export class SocialDiscoveryController {
  constructor(private readonly discovery: SocialDiscovery) {}
  @Get('social/stories/archive') async archive(@Req() r: Request) {
    return this.discovery.archive((await requireSession(r)).user.id);
  }
  @Get('social/highlights/:id') async highlights(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.discovery.highlights(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('social/posts/:id/highlight') async publish(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          title: z.string().trim().min(1).max(80),
          consent: z.literal(true),
        })
        .strict(),
      b,
    );
    return this.discovery.highlight(
      (await requireSession(r)).user.id,
      uuid(id),
      i.title,
      i.consent,
    );
  }
  @Delete('social/posts/:id/highlight') async remove(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.discovery.highlight(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('social/posts/:id/view') async view(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.discovery.view((await requireSession(r)).user.id, uuid(id));
  }
  @Get('social/posts/:id/viewers') async viewers(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.discovery.viewers((await requireSession(r)).user.id, uuid(id));
  }
  @Post('social/posts/:id/share') async share(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.discovery.share((await requireSession(r)).user.id, uuid(id));
  }
  @Get('rescue/cases/:id/matches') async matches(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.discovery.matches((await requireSession(r)).user.id, uuid(id));
  }
}
