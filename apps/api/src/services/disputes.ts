import {
  Controller,
  Get,
  Post,
  Req,
  Param,
  Body,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  requireSession,
  requireAdmin,
  requireFinancialSession,
  parse,
  uuid,
} from '../identity/session.js';
import { transaction, database } from '../database.js';
import { entity, post, sandbox } from '../finance/ledger.js';
import { audit, emit } from '../organizations/service.js';
const reason = z.string().trim().min(10).max(2000);
export async function requireTransportReviewer(r: Request) {
  const session = await requireAdmin(r);
  const grant = (
    await database.query(
      "SELECT 1 FROM admin_grants WHERE user_id=$1 AND revoked_at IS NULL AND 'manage_transport_disputes'=ANY(capabilities)",
      [session.user.id],
    )
  ).rowCount;
  if (!grant) throw new ForbiddenException('يلزم تفويض مراجعة نزاعات النقل');
  return session;
}
@Injectable()
export class RideDisputes {
  async reviewer(db: PoolClient, actor: string, scope?: string) {
    if (
      !(
        await db.query(
          "SELECT 1 FROM admin_grants WHERE user_id=$1 AND revoked_at IS NULL AND 'manage_transport_disputes'=ANY(capabilities) FOR SHARE",
          [actor],
        )
      ).rowCount
    )
      throw new ForbiddenException('تفويض نزاعات النقل غير متاح');
    if (
      scope &&
      !(
        await db.query(
          'SELECT 1 FROM platform_finance_grants WHERE user_id=$1 AND revoked_at IS NULL AND $2=ANY(scopes) FOR SHARE',
          [actor, scope],
        )
      ).rowCount
    )
      throw new ForbiddenException('يلزم تفويض مالي مستقل');
  }
  async access(db: PoolClient, actor: string, id: string, review = false) {
    if (review) await this.reviewer(db, actor);
    const r = (
      await db.query(
        `SELECT r.* FROM rides r WHERE r.id=$1 ${review ? '' : 'AND (r.user_id=$2 OR r.driver_id=$2)'} FOR SHARE`,
        review ? [id] : [id, actor],
      )
    ).rows[0];
    if (!r) throw new NotFoundException();
    return r;
  }
  async read(actor: string, id: string, review = false) {
    return transaction(async (db) => {
      const r = await this.access(db, actor, id, review);
      const dispute =
        (await db.query('SELECT * FROM ride_disputes WHERE ride_id=$1', [id]))
          .rows[0] ?? null;
      const messages = dispute
        ? (
            await db.query(
              'SELECT id,author_id,body,created_at FROM ride_dispute_messages WHERE dispute_id=$1 ORDER BY created_at,id LIMIT 200',
              [dispute.id],
            )
          ).rows
        : [];
      if (review)
        await audit(db, actor, 'taxi.dispute_review_read', null, {
          rideId: id,
        });
      return {
        dispute,
        messages,
        ride: { id: r.id, status: r.status, fareMinor: String(r.fare_minor) },
        mode: 'sandbox',
      };
    });
  }
  async list(actor: string) {
    return transaction(async (db) => {
      await this.reviewer(db, actor);
      await audit(db, actor, 'taxi.disputes_queue_read');
      return (
        await db.query(
          'SELECT d.id,d.ride_id,d.status,d.version,d.created_at FROM ride_disputes d ORDER BY d.created_at DESC LIMIT 100',
        )
      ).rows;
    });
  }
  async open(
    actor: string,
    id: string,
    i: { reason: string; idempotencyKey: string },
  ) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `ride-dispute:${id}`,
      ]);
      const ride = await this.access(db, actor, id);
      const old = (
        await db.query('SELECT * FROM ride_disputes WHERE ride_id=$1', [id])
      ).rows[0];
      if (old) {
        if (
          old.opened_by === actor &&
          old.idempotency_key === i.idempotencyKey &&
          old.reason === i.reason
        )
          return old;
        throw new ConflictException('للرحلة نزاع قائم؛ أضف إفادتك إليه');
      }
      if (!['completed', 'cancelled'].includes(ride.status))
        throw new ConflictException(
          'أبلغ عن حادث أثناء الرحلة؛ فتح النزاع متاح بعد انتهائها أو إلغائها',
        );
      const row = (
        await db.query(
          'INSERT INTO ride_disputes(ride_id,opened_by,reason,idempotency_key) VALUES($1,$2,$3,$4) RETURNING *',
          [id, actor, i.reason, i.idempotencyKey],
        )
      ).rows[0];
      await audit(db, actor, 'taxi.dispute_opened', null, {
        rideId: id,
        disputeId: row.id,
      });
      return row;
    });
  }
  async message(
    actor: string,
    id: string,
    i: { body: string; idempotencyKey: string },
    review = false,
  ) {
    return transaction(async (db) => {
      await this.access(db, actor, id, review);
      const d = (
        await db.query(
          'SELECT * FROM ride_disputes WHERE ride_id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!d) throw new NotFoundException();
      const old = (
        await db.query(
          'SELECT id,body FROM ride_dispute_messages WHERE dispute_id=$1 AND author_id=$2 AND idempotency_key=$3',
          [d.id, actor, i.idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.body !== i.body) throw new ConflictException();
        return { id: old.id };
      }
      if (d.status === 'resolved') throw new ConflictException('أغلق النزاع');
      if (
        (
          await db.query(
            'SELECT count(*)::int n FROM ride_dispute_messages WHERE dispute_id=$1',
            [d.id],
          )
        ).rows[0].n >= 200
      )
        throw new ConflictException('بلغ النزاع حد الإفادات');
      const row = (
        await db.query(
          'INSERT INTO ride_dispute_messages(dispute_id,author_id,body,idempotency_key) VALUES($1,$2,$3,$4) RETURNING id',
          [d.id, actor, i.body, i.idempotencyKey],
        )
      ).rows[0];
      await audit(db, actor, 'taxi.dispute_statement_added', null, {
        disputeId: d.id,
        messageId: row.id,
      });
      return row;
    });
  }
  async propose(
    actor: string,
    id: string,
    i: {
      version: number;
      kind: 'no_compensation' | 'refund_full';
      reason: string;
    },
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.reviewer(db, actor, 'maker');
      const d = (
        await db.query(
          'SELECT * FROM ride_disputes WHERE ride_id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!d) throw new NotFoundException();
      if (d.status !== 'open' || d.version !== i.version)
        throw new ConflictException('تغير النزاع');
      if (
        i.kind === 'refund_full' &&
        !(
          await db.query(
            "SELECT 1 FROM rides WHERE id=$1 AND status='completed'",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('لا يوجد تحصيل رحلة مكتملة لتعويضه');
      const row = (
        await db.query(
          "UPDATE ride_disputes SET status='proposed',proposal_kind=$2,proposal_reason=$3,proposed_by=$4,proposed_at=now(),version=version+1 WHERE id=$1 RETURNING *",
          [d.id, i.kind, i.reason, actor],
        )
      ).rows[0];
      await audit(db, actor, 'taxi.dispute_resolution_proposed', null, {
        disputeId: d.id,
      });
      return row;
    });
  }
  async decide(
    actor: string,
    id: string,
    i: { version: number; approved: boolean; reason: string },
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.reviewer(db, actor, 'checker');
      const r = (
        await db.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      const d = (
        await db.query(
          'SELECT * FROM ride_disputes WHERE ride_id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!d) throw new NotFoundException();
      if (d.status === 'resolved') {
        if (
          d.decided_by === actor &&
          d.decision_approved === i.approved &&
          d.decision_reason === i.reason &&
          d.version === i.version + 1
        )
          return d;
        throw new ConflictException('حسم النزاع مسبقاً');
      }
      if (d.status !== 'proposed' || d.version !== i.version)
        throw new ConflictException('تغير مقترح النزاع');
      if (d.proposed_by === actor)
        throw new ForbiddenException('معد القرار لا يعتمد مقترحه');
      let journal: string | null = null;
      if (i.approved && d.proposal_kind === 'refund_full') {
        if (r.status !== 'completed')
          throw new ConflictException('الرحلة غير مؤهلة للتعويض');
        const ledger = await entity(db, null),
          fare = BigInt(r.fare_minor),
          share = BigInt(r.driver_share);
        const original = (
          await db.query(
            "SELECT id FROM journals WHERE entity_id=$1 AND source_key=$2 AND status='posted'",
            [ledger, `ride:${id}`],
          )
        ).rows[0];
        if (!original) throw new ConflictException('لا يوجد قيد تحصيل معتمد');
        const balances = (
          await db.query(
            "SELECT coalesce(sum(CASE WHEN l.account_code='2200' AND l.party_id=$2 THEN l.credit-l.debit ELSE 0 END),0)::text payable,coalesce(sum(CASE WHEN l.account_code='1100' THEN l.debit-l.credit ELSE 0 END),0)::text clearing FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND j.status='posted'",
            [ledger, r.driver_id],
          )
        ).rows[0];
        if (
          BigInt(balances.payable) < share ||
          BigInt(balances.clearing) < fare
        )
          throw new ConflictException(
            'الرصيد المتاح لا يغطي التعويض؛ راجع المطابقة والمستحقات',
          );
        journal = await post(
          db,
          d.proposed_by,
          ledger,
          `ride-refund:${id}`,
          'تعويض رحلة اختباري بعد مراجعة مستقلة',
          [
            { account: '2200', debit: share, partyId: r.driver_id },
            { account: '4000', debit: fare - share },
            { account: '1100', credit: fare },
          ],
          { approvedBy: actor, reversalOf: original.id },
        );
      }
      const row = (
        await db.query(
          "UPDATE ride_disputes SET status='resolved',decided_by=$2,decision_approved=$3,decision_reason=$4,decided_at=now(),journal_id=$5,version=version+1 WHERE id=$1 RETURNING *",
          [d.id, actor, i.approved, i.reason, journal],
        )
      ).rows[0];
      await audit(db, actor, 'taxi.dispute_resolved', null, {
        disputeId: d.id,
        journalId: journal,
      });
      await emit(db, r.user_id, 'RideDisputeResolved', d.id, row.version);
      return row;
    });
  }
}
@Controller('api/v1')
export class RideDisputesController {
  constructor(private readonly service: RideDisputes) {}
  @Get('rides/:id/dispute') async read(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.read((await requireSession(r)).user.id, uuid(id));
  }
  @Post('rides/:id/dispute') async open(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.open(
      (await requireSession(r)).user.id,
      uuid(id),
      parse(z.object({ reason, idempotencyKey: z.uuid() }).strict(), b),
    );
  }
  @Post('rides/:id/dispute/messages') async message(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.message(
      (await requireSession(r)).user.id,
      uuid(id),
      parse(z.object({ body: reason, idempotencyKey: z.uuid() }).strict(), b),
    );
  }
  @Get('admin/transport/disputes') async list(@Req() r: Request) {
    return this.service.list((await requireTransportReviewer(r)).user.id);
  }
  @Get('admin/transport/rides/:id/dispute') async review(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.read(
      (await requireTransportReviewer(r)).user.id,
      uuid(id),
      true,
    );
  }
  @Post('admin/transport/rides/:id/dispute/messages') async statement(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.message(
      (await requireTransportReviewer(r)).user.id,
      uuid(id),
      parse(z.object({ body: reason, idempotencyKey: z.uuid() }).strict(), b),
      true,
    );
  }
  @Post('admin/transport/rides/:id/dispute/proposal') async propose(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const s = await requireTransportReviewer(r);
    await requireFinancialSession(r);
    return this.service.propose(
      s.user.id,
      uuid(id),
      parse(
        z
          .object({
            version: z.number().int().positive(),
            kind: z.enum(['no_compensation', 'refund_full']),
            reason,
          })
          .strict(),
        b,
      ),
    );
  }
  @Post('admin/transport/rides/:id/dispute/decision') async decide(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const s = await requireTransportReviewer(r);
    await requireFinancialSession(r);
    return this.service.decide(
      s.user.id,
      uuid(id),
      parse(
        z
          .object({
            version: z.number().int().positive(),
            approved: z.boolean(),
            reason,
          })
          .strict(),
        b,
      ),
    );
  }
}
