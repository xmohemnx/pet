import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { visiblePost, visibleSql, rate } from './service.js';
import { audit } from '../organizations/service.js';
@Injectable()
export class SocialDiscovery {
  async archive(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT id,body,expires_at,created_at FROM social_posts WHERE user_id=$1 AND kind='story' AND deleted_at IS NULL AND moderated_at IS NULL ORDER BY created_at DESC LIMIT 100",
            [actor],
          )
        ).rows,
    );
  }
  async highlights(actor: string, user: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT p.id,p.body,p.asset_id,p.visibility,p.expires_at,h.title,h.expires_at highlight_expires_at,sp.display_name,(SELECT kind FROM media_assets WHERE id=p.asset_id) asset_kind FROM story_highlights h JOIN social_posts p ON p.id=h.post_id JOIN social_profiles sp ON sp.user_id=p.user_id WHERE h.user_id=$2 AND h.expires_at>now() AND ${visibleSql} ORDER BY h.created_at DESC LIMIT 50`,
            [actor, user],
          )
        ).rows,
    );
  }
  async highlight(
    actor: string,
    id: string,
    title?: string,
    consent?: boolean,
  ) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `highlights:${actor}`,
      ]);
      const p = (
        await db.query(
          "SELECT * FROM social_posts WHERE id=$1 AND user_id=$2 AND kind='story' AND deleted_at IS NULL AND moderated_at IS NULL FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      if (!p) throw new NotFoundException();
      if (title !== undefined) {
        if (!consent)
          throw new BadRequestException('الموافقة على تمديد عرض القصة مطلوبة');
        if (
          !(
            await db.query('SELECT 1 FROM story_highlights WHERE post_id=$1', [
              id,
            ])
          ).rowCount &&
          (
            await db.query(
              'SELECT count(*)::int n FROM story_highlights WHERE user_id=$1 AND expires_at>now()',
              [actor],
            )
          ).rows[0].n >= 50
        )
          throw new BadRequestException('الحد 50 قصة مميزة');
        await db.query(
          "INSERT INTO story_highlights(post_id,user_id,title) VALUES($1,$2,$3) ON CONFLICT(post_id) DO UPDATE SET title=$3,expires_at=now()+interval '365 days'",
          [id, actor, title],
        );
      } else
        await db.query(
          'DELETE FROM story_highlights WHERE post_id=$1 AND user_id=$2',
          [id, actor],
        );
      await audit(db, actor, 'social.highlight_changed', null, {
        postId: id,
        published: title !== undefined,
      });
      return { published: title !== undefined };
    });
  }
  async view(actor: string, id: string) {
    return transaction(async (db) => {
      const p = await visiblePost(db, actor, id);
      if (p.kind !== 'story') throw new BadRequestException('المشاهدة للقصص');
      if (p.user_id === actor) return { recorded: false };
      await rate(db, actor, 'story_view', 60);
      await db.query(
        'INSERT INTO story_views(post_id,viewer_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [id, actor],
      );
      return { recorded: true };
    });
  }
  async viewers(actor: string, id: string) {
    return transaction(async (db) => {
      if (
        !(
          await db.query(
            "SELECT 1 FROM social_posts WHERE id=$1 AND user_id=$2 AND kind='story' AND deleted_at IS NULL AND moderated_at IS NULL",
            [id, actor],
          )
        ).rowCount
      )
        throw new NotFoundException();
      return (
        await db.query(
          'SELECT v.viewed_at,sp.display_name FROM story_views v JOIN social_profiles sp ON sp.user_id=v.viewer_id WHERE v.post_id=$2 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=v.viewer_id) OR (b.blocker_id=v.viewer_id AND b.blocked_id=$1)) ORDER BY v.viewed_at DESC LIMIT 100',
          [actor, id],
        )
      ).rows;
    });
  }
  async share(actor: string, id: string) {
    return transaction(async (db) => {
      await visiblePost(db, actor, id);
      await rate(db, actor, 'share', 30);
      await audit(db, actor, 'social.link_shared', null, { postId: id });
      return { path: `/social/posts/${id}` };
    });
  }
  async matches(actor: string, id: string) {
    return transaction(async (db) => {
      const own = (
        await db.query(
          "SELECT * FROM rescue_cases WHERE id=$1 AND user_id=$2 AND kind IN ('lost','found')",
          [id, actor],
        )
      ).rows[0];
      if (!own) throw new NotFoundException();
      return (
        await db.query(
          "SELECT id,kind,title,description,city,species,status,created_at FROM rescue_cases WHERE id<>$1 AND user_id<>$2 AND kind=$3 AND lower(trim(city))=lower(trim($4)) AND (species=$5 OR species='unknown' OR $5='unknown') AND status IN ('verified','assigned','in_progress') AND created_at>now()-interval '90 days' ORDER BY (species=$5) DESC,created_at DESC LIMIT 20",
          [
            id,
            actor,
            own.kind === 'lost' ? 'found' : 'lost',
            own.city,
            own.species,
          ],
        )
      ).rows;
    });
  }
}
