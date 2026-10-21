import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { CareService } from './service.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { rate } from '../community/service.js';
export interface ArticleInput {
  title: string;
  body: string;
  species: string;
  ageGroup: string;
  sources: string[];
}
const publicArticle = `a.published AND a.state='approved' AND c.verification_status='verified' AND v.approved AND v.reviewed_at>now()-interval '365 days' AND EXISTS(SELECT 1 FROM professional_profiles pp WHERE pp.user_id=v.reviewer_id AND pp.kind='doctor' AND pp.status='verified') AND EXISTS(SELECT 1 FROM clinic_memberships m JOIN doctor_affiliations d ON d.doctor_id=m.user_id AND d.clinic_id=m.clinic_id WHERE m.user_id=v.reviewer_id AND m.clinic_id=a.clinic_id AND m.revoked_at IS NULL AND 'doctor_member'=ANY(m.capabilities) AND d.status='approved')`;
const join = `FROM care_articles a JOIN clinics c ON c.id=a.clinic_id JOIN care_article_revisions r ON r.article_id=a.id AND r.revision=a.revision LEFT JOIN care_article_reviews v ON v.article_id=a.id AND v.revision=a.revision LEFT JOIN auth_users u ON u.id=v.reviewer_id`;
const projection = `a.id,a.clinic_id,a.revision,a.version,a.state,a.published,r.title,r.body,r.species,r.age_group,r.sources,r.created_at,v.reviewer_id,v.reviewed_at,u.name reviewer_name,c.name clinic_name`;
const internalProjection = `${projection},r.author_id,v.note review_note`;
@Injectable()
export class CareLibrary {
  constructor(
    private readonly care: CareService,
    private readonly org: OrganizationService,
  ) {}
  list(filters: { q: string; species: string; ageGroup: string }) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT ${projection} ${join} WHERE ${publicArticle} AND ($1='' OR strpos(lower(r.title||' '||r.body),lower($1))>0) AND ($2='' OR r.species IN ('all',$2)) AND ($3='' OR r.age_group IN ('all',$3)) ORDER BY v.reviewed_at DESC,a.id LIMIT 100`,
            [filters.q, filters.species, filters.ageGroup],
          )
        ).rows,
    );
  }
  detail(id: string) {
    return transaction(async (db) => {
      const a = (
        await db.query(
          `SELECT ${projection} ${join} WHERE a.id=$1 AND ${publicArticle}`,
          [id],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      return a;
    });
  }
  management(actor: string, clinic: string) {
    return transaction(async (db) => {
      const m = await this.org.membership(actor, clinic, undefined, db);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'doctor_member'].includes(c),
        )
      )
        throw new ForbiddenException();
      return {
        articles: (
          await db.query(
            `SELECT ${internalProjection} ${join} WHERE a.clinic_id=$1 ORDER BY r.created_at DESC LIMIT 200`,
            [clinic],
          )
        ).rows,
        corrections: (
          await db.query(
            'SELECT x.id,x.article_id,x.revision,x.reason,x.response,x.status,x.created_at,r.title FROM care_article_corrections x JOIN care_articles a ON a.id=x.article_id JOIN care_article_revisions r ON r.article_id=x.article_id AND r.revision=x.revision WHERE a.clinic_id=$1 ORDER BY x.created_at DESC LIMIT 200',
            [clinic],
          )
        ).rows,
      };
    });
  }
  save(
    actor: string,
    clinic: string,
    i: ArticleInput,
    id?: string,
    version?: number,
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      let a;
      if (id) {
        a = (
          await db.query(
            'SELECT * FROM care_articles WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
            [id, clinic],
          )
        ).rows[0];
        if (!a) throw new NotFoundException();
        if (a.version !== version)
          throw new ConflictException('حدث المقال قبل التعديل');
        a = (
          await db.query(
            "UPDATE care_articles SET revision=revision+1,version=version+1,state='draft',published=false WHERE id=$1 RETURNING *",
            [id],
          )
        ).rows[0];
      } else
        a = (
          await db.query(
            'INSERT INTO care_articles(clinic_id) VALUES($1) RETURNING *',
            [clinic],
          )
        ).rows[0];
      await db.query(
        'INSERT INTO care_article_revisions(article_id,revision,author_id,title,body,species,age_group,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          a.id,
          a.revision,
          actor,
          i.title,
          i.body,
          i.species,
          i.ageGroup,
          [...new Set(i.sources)],
        ],
      );
      await audit(db, actor, 'care.article_revision_saved', clinic, {
        articleId: a.id,
        revision: a.revision,
      });
      await emit(db, actor, 'CareArticleUpdated', a.id, a.version, clinic);
      return { id: a.id, version: a.version };
    });
  }
  review(
    actor: string,
    clinic: string,
    id: string,
    i: { approved: boolean; note: string; version: number },
  ) {
    return transaction(async (db) => {
      await this.care.doctor(db, actor, clinic);
      const a = (
        await db.query(
          'SELECT a.*,r.author_id FROM care_articles a JOIN care_article_revisions r ON r.article_id=a.id AND r.revision=a.revision WHERE a.id=$1 AND a.clinic_id=$2 FOR UPDATE OF a',
          [id, clinic],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (a.author_id === actor)
        throw new ForbiddenException('تحتاج النسخة مراجعاً بيطرياً مستقلاً');
      if (a.version !== i.version || a.state !== 'draft')
        throw new ConflictException('تغيرت النسخة أو حُسمت مراجعتها');
      await db.query(
        'INSERT INTO care_article_reviews(article_id,revision,author_id,reviewer_id,approved,note) VALUES($1,$2,$3,$4,$5,$6)',
        [id, a.revision, a.author_id, actor, i.approved, i.note],
      );
      await db.query(
        'UPDATE care_articles SET state=$2,version=version+1,published=false WHERE id=$1',
        [id, i.approved ? 'approved' : 'rejected'],
      );
      await audit(db, actor, 'care.article_reviewed', clinic, {
        articleId: id,
        revision: a.revision,
        approved: i.approved,
      });
      await emit(db, actor, 'CareArticleReviewed', id, a.version + 1, clinic);
      return { version: a.version + 1 };
    });
  }
  publish(
    actor: string,
    clinic: string,
    id: string,
    i: { published: boolean; version: number },
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const a = (
        await db.query(
          `SELECT a.*,v.reviewed_at ${join} WHERE a.id=$1 AND a.clinic_id=$2 FOR UPDATE OF a`,
          [id, clinic],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (a.version !== i.version)
        throw new ConflictException('حدث المقال قبل النشر');
      if (
        i.published &&
        (a.state !== 'approved' ||
          !a.reviewed_at ||
          new Date(a.reviewed_at).getTime() < Date.now() - 365 * 86400000)
      )
        throw new ConflictException('تلزم مراجعة مقبولة حديثة لهذه النسخة');
      if (i.published) {
        const visible = (
          await db.query(
            `SELECT 1 ${join} WHERE a.id=$1 AND ${publicArticle.replace('a.published AND ', '')}`,
            [id],
          )
        ).rowCount;
        if (!visible)
          throw new ConflictException('اعتماد المراجع لم يعد سارياً');
      }
      await db.query(
        'UPDATE care_articles SET published=$2,version=version+1 WHERE id=$1',
        [id, i.published],
      );
      await audit(db, actor, 'care.article_publication_changed', clinic, {
        articleId: id,
        published: i.published,
      });
      await emit(
        db,
        actor,
        'CareArticlePublicationChanged',
        id,
        a.version + 1,
        clinic,
      );
      return { version: a.version + 1 };
    });
  }
  report(actor: string, id: string, reason: string) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `care-corrections:${actor}`,
      ]);
      await rate(db, actor, 'care_content_correction', 10);
      if (
        (
          await db.query(
            "SELECT count(*)::int n FROM care_article_corrections WHERE reporter_id=$1 AND created_at>now()-interval '1 day'",
            [actor],
          )
        ).rows[0].n >= 20
      )
        throw new ConflictException('حد التصحيحات عشرون طلباً يومياً');
      const a = (
        await db.query(
          `SELECT a.id,a.clinic_id,a.revision ${join} WHERE a.id=$1 AND ${publicArticle} FOR SHARE OF a`,
          [id],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      const r = (
        await db.query(
          'INSERT INTO care_article_corrections(article_id,revision,reporter_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
          [id, a.revision, actor, reason],
        )
      ).rows[0];
      if (!r) throw new ConflictException('لديك طلب تصحيح معلق لهذا المقال');
      await audit(db, actor, 'care.article_correction_requested', a.clinic_id, {
        correctionId: r.id,
        articleId: id,
      });
      await emit(
        db,
        actor,
        'CareArticleCorrectionRequested',
        r.id,
        1,
        a.clinic_id,
      );
      return r;
    });
  }
  reports(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT x.id,x.article_id,x.revision,x.reason,x.response,x.status,x.created_at,r.title FROM care_article_corrections x JOIN care_article_revisions r ON r.article_id=x.article_id AND r.revision=x.revision WHERE x.reporter_id=$1 ORDER BY x.created_at DESC LIMIT 100',
            [actor],
          )
        ).rows,
    );
  }
  resolve(actor: string, clinic: string, id: string, response: string) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const r = (
        await db.query(
          'SELECT x.* FROM care_article_corrections x JOIN care_articles a ON a.id=x.article_id WHERE x.id=$1 AND a.clinic_id=$2 FOR UPDATE OF x',
          [id, clinic],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      if (r.status !== 'pending')
        throw new ConflictException('حسم طلب التصحيح سابقاً');
      await db.query(
        "UPDATE care_article_corrections SET status='resolved',response=$2,resolved_by=$3,resolved_at=now() WHERE id=$1",
        [id, response, actor],
      );
      await audit(db, actor, 'care.article_correction_resolved', clinic, {
        correctionId: id,
      });
      await emit(db, actor, 'CareArticleCorrectionResolved', id, 2, clinic);
      return { status: 'resolved' };
    });
  }
}
