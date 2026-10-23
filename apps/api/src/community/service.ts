import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { audit, emit } from '../organizations/service.js';
import { z } from 'zod';

const socialProjection = `p.*,sp.display_name,sp.handle,sp.avatar_asset_id,
  to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_time,
  (SELECT kind FROM media_assets a WHERE a.id=p.asset_id) asset_kind,
  coalesce((SELECT jsonb_agg(jsonb_build_object('asset_id',m.asset_id,'kind',a.kind,'position',m.position) ORDER BY m.position) FROM social_post_media m JOIN media_assets a ON a.id=m.asset_id WHERE m.post_id=p.id),'[]'::jsonb) media,
  (SELECT count(*)::int FROM social_reactions r WHERE r.post_id=p.id AND r.kind='like') likes,
  (SELECT count(*)::int FROM social_comments c WHERE c.post_id=p.id AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=c.user_id) OR (b.blocker_id=c.user_id AND b.blocked_id=$1))) comments_count,
  EXISTS(SELECT 1 FROM social_reactions r WHERE r.post_id=p.id AND r.user_id=$1 AND r.kind='like') liked,
  EXISTS(SELECT 1 FROM social_reactions r WHERE r.post_id=p.id AND r.user_id=$1 AND r.kind='save') saved`;
export async function rate(
  db: PoolClient,
  actor: string,
  action: string,
  max = 30,
) {
  const r = (
    await db.query(
      "INSERT INTO action_limits(actor_id,action,bucket,count) VALUES($1,$2,date_trunc('minute',now()),1) ON CONFLICT(actor_id,action,bucket) DO UPDATE SET count=action_limits.count+1 RETURNING count",
      [actor, action],
    )
  ).rows[0];
  if (r.count > max)
    throw new ConflictException('بلغت حد المحاولات؛ انتظر دقيقة');
}
export async function pairLock(db: PoolClient, a: string, b: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `social:${[a, b].sort().join(':')}`,
  ]);
}
export async function unblocked(db: PoolClient, a: string, b: string) {
  await pairLock(db, a, b);
  if (
    (
      await db.query(
        'SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
        [a, b],
      )
    ).rowCount
  )
    throw new NotFoundException('الحساب غير متاح');
}
export async function conversationAccess(
  db: PoolClient,
  actor: string,
  id: string,
) {
  await unblocked(db, actor, id);
  const profile = (
    await db.query('SELECT * FROM social_profiles WHERE user_id=$1', [id])
  ).rows[0];
  if (!profile || actor === id) throw new NotFoundException();
  if (
    profile.privacy === 'private' &&
    !(
      await db.query(
        "SELECT 1 FROM social_follows WHERE status='accepted' AND ((follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1))",
        [actor, id],
      )
    ).rowCount
  )
    throw new ForbiddenException('المراسلة تتطلب متابعة مقبولة');
}
export const visibleSql = `p.deleted_at IS NULL AND p.moderated_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>now() OR EXISTS(SELECT 1 FROM story_highlights h WHERE h.post_id=p.id AND h.user_id=p.user_id AND h.expires_at>now())) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)) AND (p.user_id=$1 OR (p.visibility<>'private' AND (sp.privacy='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.followed_id=p.user_id AND f.status='accepted')) AND (p.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.followed_id=p.user_id AND f.status='accepted'))))`;
export async function visiblePost(db: PoolClient, actor: string, id: string) {
  const p = (
    await db.query(
      `SELECT p.* FROM social_posts p JOIN social_profiles sp ON sp.user_id=p.user_id WHERE p.id=$2 AND ${visibleSql}`,
      [actor, id],
    )
  ).rows[0];
  if (!p) throw new NotFoundException('المنشور غير متاح');
  return p;
}
@Injectable()
export class CommunityService {
  async profile(
    actor: string,
    input?: {
      displayName: string;
      bio: string;
      privacy: 'public' | 'private';
      presenceEnabled?: boolean;
      handle?: string;
      avatarAssetId?: string | null;
    },
  ) {
    return transaction(async (db) => {
      if (input) {
        if (
          input.avatarAssetId &&
          (
            await db.query(
              'SELECT 1 FROM grooming_photos g JOIN media_assets a ON a.id=g.asset_id WHERE g.asset_id=$1 AND a.owner_id=$2',
              [input.avatarAssetId, actor],
            )
          ).rowCount
        )
          throw new ConflictException(
            'صور إتمام الخدمات خاصة؛ اختر صورة اجتماعية أخرى',
          );
        if (
          input.avatarAssetId &&
          !(
            await db.query(
              "SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='image' AND status='ready' AND pet_id IS NULL AND chat_peer_id IS NULL FOR SHARE",
              [input.avatarAssetId, actor],
            )
          ).rowCount
        )
          throw new BadRequestException(
            'اختر صورة شخصية جاهزة من وسائطك الاجتماعية',
          );
        if (input.handle) {
          await db.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [`social-handle:${input.handle}`],
          );
          if (
            (
              await db.query(
                'SELECT 1 FROM social_profiles WHERE handle=$1 AND user_id<>$2',
                [input.handle, actor],
              )
            ).rowCount
          )
            throw new ConflictException('هذا المعرف مستخدم؛ اختر معرفاً آخر');
        }
        await db.query(
          "INSERT INTO social_profiles(user_id,display_name,bio,privacy,presence_enabled,handle,avatar_asset_id) VALUES($1::uuid,$2,$3,$4,coalesce($5,false),coalesce($6,'petra_'||left(replace($1::uuid::text,'-',''),20)),$7) ON CONFLICT(user_id) DO UPDATE SET display_name=$2,bio=$3,privacy=$4,presence_enabled=coalesce($5,social_profiles.presence_enabled),handle=coalesce($6,social_profiles.handle),avatar_asset_id=CASE WHEN $8 THEN $7 ELSE social_profiles.avatar_asset_id END",
          [
            actor,
            input.displayName,
            input.bio,
            input.privacy,
            input.presenceEnabled ?? null,
            input.handle ?? null,
            input.avatarAssetId ?? null,
            input.avatarAssetId !== undefined,
          ],
        );
        await audit(db, actor, 'social.profile_saved');
      }
      return (
        (
          await db.query('SELECT * FROM social_profiles WHERE user_id=$1', [
            actor,
          ])
        ).rows[0] ?? null
      );
    });
  }
  async people(actor: string, query: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT sp.user_id,sp.display_name,sp.handle,sp.privacy,CASE WHEN sp.privacy='public' OR f.status='accepted' THEN sp.bio ELSE '' END bio,CASE WHEN sp.privacy='public' OR f.status='accepted' THEN sp.avatar_asset_id ELSE NULL END avatar_asset_id,f.status follow_status FROM social_profiles sp LEFT JOIN social_follows f ON f.follower_id=$1 AND f.followed_id=sp.user_id WHERE sp.user_id<>$1 AND (sp.display_name ILIKE $2 OR sp.handle ILIKE $2) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=sp.user_id) OR (b.blocker_id=sp.user_id AND b.blocked_id=$1)) ORDER BY sp.display_name LIMIT 50",
            [actor, `%${query}%`],
          )
        ).rows,
    );
  }
  async person(actor: string, id: string) {
    const row = await transaction(
      async (db) =>
        (
          await db.query(
            'SELECT handle FROM social_profiles WHERE user_id=$1',
            [id],
          )
        ).rows[0],
    );
    if (!row) throw new NotFoundException();
    return (await this.profileView(actor, row.handle)).profile;
  }
  async feed(
    actor: string,
    kind: string,
    before?: string,
    savedOnly = false,
    query = '',
  ) {
    return (
      await this.timeline(actor, { kind, before, savedOnly, query, limit: 30 })
    ).items;
  }
  async timeline(
    actor: string,
    input: {
      kind?: string;
      cursor?: string;
      before?: string;
      savedOnly?: boolean;
      query?: string;
      scope?: string;
      author?: string;
      limit?: number;
    } = {},
  ) {
    let cursor: { time: string; id: string } | undefined;
    if (input.cursor) {
      try {
        cursor = z
          .object({ time: z.iso.datetime(), id: z.uuid() })
          .strict()
          .parse(
            JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
          );
      } catch {
        throw new BadRequestException('مؤشر تحميل المنشورات غير صالح');
      }
    }
    const limit = input.limit ?? 12;
    return transaction(async (db) => {
      const rows = (
        await db.query(
          `SELECT ${socialProjection} FROM social_posts p JOIN social_profiles sp ON sp.user_id=p.user_id
        WHERE ${visibleSql} AND p.kind=$2 AND (p.expires_at IS NULL OR p.expires_at>now())
        AND strpos(lower(p.body),lower($3))>0
        AND ($4::timestamptz IS NULL OR p.created_at<$4)
        AND ($5::timestamptz IS NULL OR (p.created_at,p.id)<($5::timestamptz,$6::uuid))
        AND (NOT $7::boolean OR EXISTS(SELECT 1 FROM social_reactions r WHERE r.post_id=p.id AND r.user_id=$1 AND r.kind='save'))
        AND ($8<>'following' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.followed_id=p.user_id AND f.status='accepted'))
        AND ($9::uuid IS NULL OR p.user_id=$9) ORDER BY p.created_at DESC,p.id DESC LIMIT $10`,
          [
            actor,
            input.kind ?? 'post',
            input.query ?? '',
            input.before ?? null,
            cursor?.time ?? null,
            cursor?.id ?? null,
            input.savedOnly ?? false,
            input.scope ?? 'all',
            input.author ?? null,
            limit + 1,
          ],
        )
      ).rows;
      const items = rows.slice(0, limit),
        last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({ time: last.cursor_time, id: last.id }),
              ).toString('base64url')
            : null,
      };
    });
  }
  async profileView(actor: string, handle: string) {
    return transaction(async (db) => {
      const p = (
        await db.query(
          `SELECT sp.*,f.status follow_status FROM social_profiles sp LEFT JOIN social_follows f ON f.follower_id=$1 AND f.followed_id=sp.user_id WHERE sp.handle=$2 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=sp.user_id) OR (b.blocker_id=sp.user_id AND b.blocked_id=$1))`,
          [actor, handle],
        )
      ).rows[0];
      if (!p) throw new NotFoundException('الملف غير متاح');
      const canView =
        p.user_id === actor ||
        p.privacy === 'public' ||
        p.follow_status === 'accepted';
      const counts = (
        await db.query(
          `SELECT (SELECT count(*)::int FROM social_posts p JOIN social_profiles sp ON sp.user_id=p.user_id WHERE p.user_id=$2 AND p.kind='post' AND ${visibleSql}) posts,(SELECT count(*)::int FROM social_follows WHERE followed_id=$2 AND status='accepted') followers,(SELECT count(*)::int FROM social_follows WHERE follower_id=$2 AND status='accepted') following`,
          [actor, p.user_id],
        )
      ).rows[0];
      return {
        profile: canView ? p : { ...p, bio: '', avatar_asset_id: null },
        canView,
        counts: canView ? counts : { posts: 0, followers: 0, following: 0 },
      };
    });
  }
  async create(
    actor: string,
    i: {
      body: string;
      visibility: string;
      kind: string;
      assetId?: string;
      assetIds?: string[];
      idempotencyKey?: string;
    },
  ) {
    return transaction(async (db) => {
      const ids = (i.assetIds ?? (i.assetId ? [i.assetId] : [])).map((id) =>
        id.toLowerCase(),
      );
      if (
        ids.length > 10 ||
        new Set(ids).size !== ids.length ||
        (i.assetId && i.assetIds) ||
        (i.kind !== 'post' && ids.length > 1)
      )
        throw new BadRequestException(
          'اختر حتى10صور للمنشور أو وسيطاً واحداً للقصة والريل',
        );
      if (i.idempotencyKey) {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `social-create:${actor}:${i.idempotencyKey}`,
        ]);
        const old = (
          await db.query(
            'SELECT * FROM social_posts WHERE user_id=$1 AND creation_key=$2',
            [actor, i.idempotencyKey],
          )
        ).rows[0];
        if (old) {
          const oldIds = (
            await db.query(
              'SELECT asset_id FROM social_post_media WHERE post_id=$1 ORDER BY position',
              [old.id],
            )
          ).rows.map((r) => r.asset_id);
          if (
            old.body !== i.body ||
            old.visibility !== i.visibility ||
            old.kind !== i.kind ||
            JSON.stringify(oldIds) !== JSON.stringify(ids)
          )
            throw new ConflictException('مفتاح النشر مستخدم لمحتوى مختلف');
          return old;
        }
      }
      await rate(db, actor, 'post', 10);
      if (
        !(
          await db.query('SELECT 1 FROM social_profiles WHERE user_id=$1', [
            actor,
          ])
        ).rowCount
      )
        throw new BadRequestException('أنشئ ملفك الاجتماعي أولًا');
      await db.query(
        'SELECT id FROM media_assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [ids],
      );
      for (const assetId of ids) {
        if (
          (
            await db.query(
              'SELECT 1 FROM grooming_photos g JOIN media_assets a ON a.id=g.asset_id WHERE g.asset_id=$1 AND a.owner_id=$2',
              [assetId, actor],
            )
          ).rowCount
        )
          throw new ConflictException(
            'صور إتمام الخدمات خاصة؛ لا يمكن نشرها في المجتمع',
          );
        const asset = (
          await db.query(
            "SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND pet_id IS NULL AND chat_peer_id IS NULL AND status='ready'",
            [assetId, actor],
          )
        ).rows[0];
        if (
          !asset ||
          asset.kind === 'document' ||
          (i.kind === 'reel' && asset.kind !== 'video') ||
          (ids.length > 1 && asset.kind !== 'image')
        )
          throw new BadRequestException('الوسيط غير صالح أو لم يكتمل تجهيزه');
      }
      if (!ids.length && i.kind === 'reel')
        throw new BadRequestException('الريل يتطلب فيديو معالجًا');
      const p = (
        await db.query(
          "INSERT INTO social_posts(user_id,body,visibility,kind,asset_id,expires_at,creation_key) VALUES($1,$2,$3,$4,$5,CASE WHEN $4='story' THEN now()+interval '24 hours' END,$6) RETURNING *",
          [
            actor,
            i.body,
            i.visibility,
            i.kind,
            ids[0] ?? null,
            i.idempotencyKey ?? null,
          ],
        )
      ).rows[0];
      for (const [position, assetId] of ids.entries())
        await db.query(
          'INSERT INTO social_post_media(post_id,asset_id,position) VALUES($1,$2,$3)',
          [p.id, assetId, position],
        );
      await audit(db, actor, 'social.post_created', null, { postId: p.id });
      return p;
    });
  }
  async edit(actor: string, id: string, body: string, version: number) {
    return transaction(async (db) => {
      const p = (
        await db.query(
          'SELECT * FROM social_posts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!p) throw new NotFoundException();
      if (p.version !== version) throw new ConflictException('تغير المنشور');
      await db.query(
        'INSERT INTO social_post_history(post_id,version,body) VALUES($1,$2,$3)',
        [id, p.version, p.body],
      );
      await db.query(
        'UPDATE social_posts SET body=$2,version=version+1 WHERE id=$1',
        [id, body],
      );
      await audit(db, actor, 'social.post_edited', null, { postId: id });
      return { status: 'updated' };
    });
  }
  async remove(actor: string, id: string) {
    return transaction(async (db) => {
      const r = await db.query(
        'UPDATE social_posts SET deleted_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',
        [id, actor],
      );
      if (!r.rowCount) throw new NotFoundException();
      await audit(db, actor, 'social.post_deleted', null, { postId: id });
      return { status: 'deleted' };
    });
  }
  async detail(actor: string, id: string) {
    return transaction(async (db) => {
      const post = await visiblePost(db, actor, id);
      const enriched = (
        await db.query(
          `SELECT ${socialProjection} FROM social_posts p JOIN social_profiles sp ON sp.user_id=p.user_id WHERE p.id=$2 AND ${visibleSql}`,
          [actor, id],
        )
      ).rows[0];
      const comments = (
        await db.query(
          'SELECT c.id,c.body,c.created_at,c.user_id,sp.display_name FROM social_comments c JOIN social_profiles sp ON sp.user_id=c.user_id WHERE post_id=$2 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=c.user_id) OR (b.blocker_id=c.user_id AND b.blocked_id=$1)) ORDER BY c.created_at LIMIT 100',
          [actor, id],
        )
      ).rows;
      const display = (
        await db.query(
          'SELECT display_name FROM social_profiles WHERE user_id=$1',
          [post.user_id],
        )
      ).rows[0];
      const asset = post.asset_id
        ? (
            await db.query('SELECT kind FROM media_assets WHERE id=$1', [
              post.asset_id,
            ])
          ).rows[0]
        : null;
      return {
        post: {
          ...post,
          ...enriched,
          display_name: display?.display_name,
          asset_kind: asset?.kind,
        },
        comments,
      };
    });
  }
  async react(actor: string, id: string, kind: string, enabled: boolean) {
    return transaction(async (db) => {
      await visiblePost(db, actor, id);
      await rate(db, actor, 'reaction', 60);
      if (enabled)
        await db.query(
          'INSERT INTO social_reactions(post_id,user_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, actor, kind],
        );
      else
        await db.query(
          'DELETE FROM social_reactions WHERE post_id=$1 AND user_id=$2 AND kind=$3',
          [id, actor, kind],
        );
      return { enabled };
    });
  }
  async comment(actor: string, id: string, body: string) {
    return transaction(async (db) => {
      await visiblePost(db, actor, id);
      await rate(db, actor, 'comment', 20);
      if (
        !(
          await db.query('SELECT 1 FROM social_profiles WHERE user_id=$1', [
            actor,
          ])
        ).rowCount
      )
        throw new BadRequestException('أنشئ ملفك الاجتماعي أولًا');
      return (
        await db.query(
          'INSERT INTO social_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING *',
          [id, actor, body],
        )
      ).rows[0];
    });
  }
  async follow(actor: string, id: string) {
    return transaction(async (db) => {
      await unblocked(db, actor, id);
      await rate(db, actor, 'follow', 20);
      const p = (
        await db.query('SELECT * FROM social_profiles WHERE user_id=$1', [id])
      ).rows[0];
      if (!p || id === actor) throw new NotFoundException();
      const state = p.privacy === 'public' ? 'accepted' : 'pending';
      const saved = await db.query(
        'INSERT INTO social_follows(follower_id,followed_id,status) VALUES($1,$2,$3) ON CONFLICT(follower_id,followed_id) DO UPDATE SET status=social_follows.status RETURNING status',
        [actor, id, state],
      );
      return { status: saved.rows[0].status };
    });
  }
  async requests(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT f.follower_id,p.display_name FROM social_follows f JOIN social_profiles p ON p.user_id=f.follower_id WHERE f.followed_id=$1 AND f.status='pending'",
            [actor],
          )
        ).rows,
    );
  }
  async followers(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT f.follower_id,p.display_name FROM social_follows f JOIN social_profiles p ON p.user_id=f.follower_id WHERE f.followed_id=$1 AND f.status='accepted' ORDER BY p.display_name LIMIT 100",
            [actor],
          )
        ).rows,
    );
  }
  async unfollow(actor: string, id: string, incoming = false) {
    return transaction(async (db) => {
      await pairLock(db, actor, id);
      await db.query(
        'DELETE FROM social_follows WHERE follower_id=$1 AND followed_id=$2',
        incoming ? [id, actor] : [actor, id],
      );
      await audit(
        db,
        actor,
        incoming ? 'social.follower_removed' : 'social.unfollowed',
        null,
        { userId: id },
      );
      return { status: 'removed' };
    });
  }
  async accept(actor: string, id: string) {
    return transaction(async (db) => {
      await unblocked(db, actor, id);
      await db.query(
        "UPDATE social_follows SET status='accepted' WHERE follower_id=$1 AND followed_id=$2 AND status='pending'",
        [id, actor],
      );
      return { status: 'accepted' };
    });
  }
  async block(actor: string, id: string) {
    return transaction(async (db) => {
      await pairLock(db, actor, id);
      if (actor === id) throw new BadRequestException();
      if (!(await db.query('SELECT 1 FROM users WHERE id=$1', [id])).rowCount)
        throw new NotFoundException();
      await db.query(
        'INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [actor, id],
      );
      await db.query(
        'DELETE FROM social_follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)',
        [actor, id],
      );
      await audit(db, actor, 'social.user_blocked', null, { userId: id });
      return { status: 'blocked' };
    });
  }
  async unblock(actor: string, id: string) {
    return transaction(async (db) => {
      await pairLock(db, actor, id);
      await db.query(
        'DELETE FROM social_blocks WHERE blocker_id=$1 AND blocked_id=$2',
        [actor, id],
      );
      await audit(db, actor, 'social.user_unblocked', null, { userId: id });
      return { status: 'unblocked' };
    });
  }
  async blocks(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT b.blocked_id,p.display_name FROM social_blocks b LEFT JOIN social_profiles p ON p.user_id=b.blocked_id WHERE b.blocker_id=$1',
            [actor],
          )
        ).rows,
    );
  }
  async conversation(
    actor: string,
    id: string,
    body?: string,
    key?: string,
    assetId?: string,
  ) {
    return transaction(async (db) => {
      await conversationAccess(db, actor, id);
      if (body) {
        await rate(db, actor, 'message', 20);
        const old = (
          await db.query(
            'SELECT * FROM direct_messages WHERE sender_id=$1 AND idempotency_key=$2',
            [actor, key],
          )
        ).rows[0];
        if (old) {
          if (
            old.recipient_id !== id ||
            old.body !== body ||
            old.asset_id !== (assetId?.toLowerCase() ?? null)
          )
            throw new ConflictException();
          return old;
        }
        if (
          assetId &&
          !(
            await db.query(
              "SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND chat_peer_id=$3 AND pet_id IS NULL AND status='ready' AND kind IN ('image','video','audio') FOR SHARE",
              [assetId, actor, id],
            )
          ).rowCount
        )
          throw new BadRequestException(
            'المرفق ليس جاهزاً أو غير مرتبط بهذه المحادثة',
          );
        const m = (
          await db.query(
            'INSERT INTO direct_messages(sender_id,recipient_id,body,idempotency_key,asset_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [actor, id, body, key, assetId ?? null],
          )
        ).rows[0];
        await emit(db, actor, 'DirectMessageCreated', m.id, 1);
        return m;
      }
      await db.query(
        'UPDATE direct_messages SET read_at=now() WHERE sender_id=$1 AND recipient_id=$2 AND read_at IS NULL',
        [id, actor],
      );
      return (
        await db.query(
          'SELECT m.*,(SELECT kind FROM media_assets a WHERE a.id=m.asset_id) asset_kind FROM (SELECT * FROM direct_messages WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at DESC LIMIT 100) m ORDER BY created_at',
          [actor, id],
        )
      ).rows;
    });
  }
  async inbox(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT sp.user_id,sp.display_name,sp.handle,sp.avatar_asset_id,last.body last_body,last.created_at last_at,(SELECT count(*)::int FROM direct_messages d WHERE d.sender_id=sp.user_id AND d.recipient_id=$1 AND d.read_at IS NULL) unread FROM social_profiles sp JOIN LATERAL (SELECT body,created_at FROM direct_messages m WHERE (m.sender_id=$1 AND m.recipient_id=sp.user_id) OR (m.recipient_id=$1 AND m.sender_id=sp.user_id) ORDER BY created_at DESC,id DESC LIMIT 1) last ON true WHERE (sp.privacy='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.status='accepted' AND ((f.follower_id=$1 AND f.followed_id=sp.user_id) OR (f.followed_id=$1 AND f.follower_id=sp.user_id)))) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=sp.user_id) OR (b.blocker_id=sp.user_id AND b.blocked_id=$1)) ORDER BY last.created_at DESC,sp.user_id LIMIT 50",
            [actor],
          )
        ).rows,
    );
  }
  async report(actor: string, id: string, reason: string) {
    return transaction(async (db) => {
      await visiblePost(db, actor, id);
      await rate(db, actor, 'report', 5);
      const r = (
        await db.query(
          'INSERT INTO abuse_reports(actor_id,post_id,reason) VALUES($1,$2,$3) RETURNING id',
          [actor, id, reason],
        )
      ).rows[0];
      await audit(db, actor, 'moderation.report_created', null, {
        reportId: r.id,
      });
      return r;
    });
  }
  async moderation() {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT r.*,p.body,p.user_id FROM abuse_reports r JOIN social_posts p ON p.id=r.post_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 100",
          )
        ).rows,
    );
  }
  async moderate(
    actor: string,
    id: string,
    decision: 'removed' | 'dismissed',
    reason: string,
  ) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          "UPDATE abuse_reports SET status=$2,reviewed_by=$3,review_reason=$4 WHERE id=$1 AND status='pending' RETURNING post_id",
          [id, decision, actor, reason],
        )
      ).rows[0];
      if (!r) throw new ConflictException();
      if (decision === 'removed')
        await db.query(
          'UPDATE social_posts SET moderated_at=now() WHERE id=$1',
          [r.post_id],
        );
      await audit(db, actor, 'moderation.decision', null, {
        reportId: id,
        decision,
      });
      return { status: decision };
    });
  }
}
