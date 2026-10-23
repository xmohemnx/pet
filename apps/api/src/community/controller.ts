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
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  requireSession,
  requireAdmin,
  parse,
  uuid,
} from '../identity/session.js';
import { CommunityService } from './service.js';
import { realtimeSettings } from './realtime.js';
const text = z.string().trim().min(1).max(3000);
@ApiTags('المجتمع والرسائل والرقابة')
@Controller('api/v1')
export class CommunityController {
  constructor(private readonly social: CommunityService) {}
  @Get('social/profile') async profile(@Req() r: Request) {
    return this.social.profile((await requireSession(r)).user.id);
  }
  @Post('social/profile') async save(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          displayName: z.string().trim().min(2).max(100),
          bio: z.string().trim().max(500),
          privacy: z.enum(['public', 'private']),
          presenceEnabled: z.boolean().optional(),
          handle: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z][a-z0-9_]{2,29}$/)
            .optional(),
          avatarAssetId: z.uuid().nullable().optional(),
        })
        .strict(),
      b,
    );
    return this.social.profile((await requireSession(r)).user.id, i);
  }
  @Get('social/people') async people(@Req() r: Request, @Query('q') q = '') {
    return this.social.people(
      (await requireSession(r)).user.id,
      parse(z.string().max(100), q),
    );
  }
  @Get('social/users/:id/profile') async person(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.person((await requireSession(r)).user.id, uuid(id));
  }
  @Get('social/feed') async feed(
    @Req() r: Request,
    @Query('kind') kind = 'post',
    @Query('before') before?: string,
    @Query('saved') saved?: string,
    @Query('q') query = '',
  ) {
    return this.social.feed(
      (await requireSession(r)).user.id,
      parse(z.enum(['post', 'story', 'reel']), kind),
      before ? parse(z.iso.datetime(), before) : undefined,
      saved === undefined
        ? false
        : parse(z.enum(['true', 'false']), saved) === 'true',
      parse(z.string().trim().max(100), query),
    );
  }
  @Get('social/timeline') async timeline(
    @Req() r: Request,
    @Query() q: unknown,
  ) {
    const i = parse(
      z
        .object({
          kind: z.enum(['post', 'reel', 'story']).default('post'),
          cursor: z
            .string()
            .max(512)
            .regex(/^[A-Za-z0-9_-]+$/)
            .optional(),
          scope: z.enum(['all', 'following']).default('all'),
          saved: z.enum(['true', 'false']).default('false'),
          q: z.string().trim().max(100).default(''),
          author: z.uuid().optional(),
        })
        .strict(),
      q,
    );
    return this.social.timeline((await requireSession(r)).user.id, {
      kind: i.kind,
      cursor: i.cursor,
      scope: i.scope,
      savedOnly: i.saved === 'true',
      query: i.q,
      author: i.author,
    });
  }
  @Get('social/profiles/:handle') async profileView(
    @Req() r: Request,
    @Param('handle') handle: string,
  ) {
    return this.social.profileView(
      (await requireSession(r)).user.id,
      parse(z.string().regex(/^[a-z][a-z0-9_]{2,29}$/), handle),
    );
  }
  @Post('social/posts') async create(@Req() r: Request, @Body() b: unknown) {
    const i = parse(
      z
        .object({
          body: text,
          visibility: z.enum(['public', 'followers', 'private']),
          kind: z.enum(['post', 'story', 'reel']),
          assetId: z.uuid().optional(),
          assetIds: z.array(z.uuid()).max(10).optional(),
          idempotencyKey: z.uuid().optional(),
        })
        .strict(),
      b,
    );
    return this.social.create((await requireSession(r)).user.id, i);
  }
  @Get('social/posts/:id') async detail(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.detail((await requireSession(r)).user.id, uuid(id));
  }
  @Patch('social/posts/:id') async edit(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ body: text, version: z.number().int().positive() }).strict(),
      b,
    );
    return this.social.edit(
      (await requireSession(r)).user.id,
      uuid(id),
      i.body,
      i.version,
    );
  }
  @Delete('social/posts/:id') async remove(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.remove((await requireSession(r)).user.id, uuid(id));
  }
  @Post('social/posts/:id/reactions') async react(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({ kind: z.enum(['like', 'save']), enabled: z.boolean() })
        .strict(),
      b,
    );
    return this.social.react(
      (await requireSession(r)).user.id,
      uuid(id),
      i.kind,
      i.enabled,
    );
  }
  @Post('social/posts/:id/comments') async comment(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ body: text }).strict(), b);
    return this.social.comment(
      (await requireSession(r)).user.id,
      uuid(id),
      i.body,
    );
  }
  @Get('social/follow-requests') async requests(@Req() r: Request) {
    return this.social.requests((await requireSession(r)).user.id);
  }
  @Get('social/followers') async followers(@Req() r: Request) {
    return this.social.followers((await requireSession(r)).user.id);
  }
  @Delete('social/users/:id/follow') async unfollow(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.unfollow((await requireSession(r)).user.id, uuid(id));
  }
  @Delete('social/followers/:id') async removeFollower(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.unfollow(
      (await requireSession(r)).user.id,
      uuid(id),
      true,
    );
  }
  @Post('social/users/:id/follow') async follow(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.follow((await requireSession(r)).user.id, uuid(id));
  }
  @Post('social/users/:id/accept-follow') async accept(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.accept((await requireSession(r)).user.id, uuid(id));
  }
  @Post('social/users/:id/block') async block(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.block((await requireSession(r)).user.id, uuid(id));
  }
  @Delete('social/users/:id/block') async unblock(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.unblock((await requireSession(r)).user.id, uuid(id));
  }
  @Get('social/blocks') async blocks(@Req() r: Request) {
    return this.social.blocks((await requireSession(r)).user.id);
  }
  @Get('social/realtime') async realtime(@Req() r: Request) {
    await requireSession(r);
    return realtimeSettings();
  }
  @Get('social/inbox') async inbox(@Req() r: Request) {
    return this.social.inbox((await requireSession(r)).user.id);
  }
  @Get('social/messages/:id') async messages(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.social.conversation(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('social/messages/:id') async message(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          body: text,
          idempotencyKey: z.uuid(),
          assetId: z.uuid().optional(),
        })
        .strict(),
      b,
    );
    return this.social.conversation(
      (await requireSession(r)).user.id,
      uuid(id),
      i.body,
      i.idempotencyKey,
      i.assetId,
    );
  }
  @Post('social/posts/:id/reports') async report(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ reason: text.min(10) }).strict(), b);
    return this.social.report(
      (await requireSession(r)).user.id,
      uuid(id),
      i.reason,
    );
  }
  @Get('admin/moderation') async moderation(@Req() r: Request) {
    await requireAdmin(r);
    return this.social.moderation();
  }
  @Post('admin/moderation/:id') async moderate(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(
      z
        .object({
          decision: z.enum(['removed', 'dismissed']),
          reason: text.min(10),
        })
        .strict(),
      b,
    );
    return this.social.moderate(actor, uuid(id), i.decision, i.reason);
  }
}
