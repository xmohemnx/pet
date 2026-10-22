import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireSession, parse, uuid } from '../identity/session.js';
import { MediaService } from './service.js';
@ApiTags('وسائط خاصة ومعالجة')
@Controller('api/v1/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Post() async upload(@Req() r: Request, @Body() b: unknown) {
    const actor = (await requireSession(r)).user.id;
    const i = parse(
      z
        .object({
          dataBase64: z.string().min(4).max(28000000),
          petId: z.uuid().optional(),
          chatPeerId: z.uuid().optional(),
          kind: z.literal('audio').optional(),
        })
        .strict(),
      b,
    );
    return this.media.upload(actor, i);
  }
  @Get() async list(
    @Req() r: Request,
    @Query('petId') petId?: string,
    @Query('chatPeerId') chatPeerId?: string,
  ) {
    return this.media.list(
      (await requireSession(r)).user.id,
      petId ? uuid(petId) : undefined,
      chatPeerId ? uuid(chatPeerId) : undefined,
    );
  }
  @Get(':id/hls') async hls(@Req() r: Request, @Param('id') id: string) {
    return this.media.hls((await requireSession(r)).user.id, uuid(id));
  }
  @Get(':id/streams/:streamId') async stream(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('streamId') streamId: string,
    @Res() response: Response,
  ) {
    const a = await this.media.stream(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(streamId),
    );
    response
      .set({
        'Content-Type': a.mime,
        'Content-Length': String(a.bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(a.bytes);
  }
  @Get(':id/file') async file(
    @Req() r: Request,
    @Param('id') id: string,
    @Query('clinicId') clinicId: string | undefined,
    @Res() response: Response,
  ) {
    const a = await this.media.file(
      (await requireSession(r)).user.id,
      uuid(id),
      clinicId ? uuid(clinicId) : undefined,
    );
    response
      .set({
        'Content-Type': a.mime,
        'Content-Length': String(a.bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(a.bytes);
  }
}
