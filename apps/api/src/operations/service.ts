import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { audit, emit } from '../organizations/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';
@Injectable()
export class OperationsService {
  async notifications(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT id,title,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
            [actor],
          )
        ).rows,
    );
  }
  async mark(actor: string, id: string) {
    return transaction(async (db) => {
      await db.query(
        'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id=$2',
        [actor, id],
      );
      return { status: 'read' };
    });
  }
  async preferences(
    actor: string,
    i?: { inApp: boolean; quietStart: number | null; quietEnd: number | null },
  ) {
    return transaction(async (db) => {
      if (i)
        await db.query(
          'INSERT INTO notification_preferences(user_id,in_app,quiet_start,quiet_end) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET in_app=$2,quiet_start=$3,quiet_end=$4',
          [actor, i.inApp, i.quietStart, i.quietEnd],
        );
      return (
        (
          await db.query(
            'SELECT * FROM notification_preferences WHERE user_id=$1',
            [actor],
          )
        ).rows[0] ?? { in_app: true, quiet_start: null, quiet_end: null }
      );
    });
  }
  async pages() {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT slug,title,body,version FROM cms_pages WHERE published ORDER BY title',
          )
        ).rows,
    );
  }
  async cms(
    actor: string,
    slug: string,
    i: { title: string; body: string; published: boolean; version: number },
  ) {
    return transaction(async (db) => {
      const old = (
        await db.query('SELECT * FROM cms_pages WHERE slug=$1 FOR UPDATE', [
          slug,
        ])
      ).rows[0];
      if ((old?.version ?? 0) !== i.version)
        throw new ConflictException('تغيرت الصفحة');
      await db.query(
        'INSERT INTO cms_pages(slug,title,body,published,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(slug) DO UPDATE SET title=$2,body=$3,published=$4,updated_by=$5,version=cms_pages.version+1,updated_at=now()',
        [slug, i.title, i.body, i.published, actor],
      );
      await audit(db, actor, 'cms.page_saved', null, { slug });
      return { status: 'saved' };
    });
  }
  async cmsAll() {
    return transaction(
      async (db) =>
        (await db.query('SELECT * FROM cms_pages ORDER BY slug')).rows,
    );
  }
  async jobs() {
    return transaction(async (db) => ({
      pending: (
        await db.query(
          'SELECT count(*)::int count FROM outbox_messages WHERE processed_at IS NULL AND failed_at IS NULL',
        )
      ).rows[0].count,
      failed: (
        await db.query(
          'SELECT event_id,event_type,attempts,last_error FROM outbox_messages WHERE failed_at IS NOT NULL ORDER BY occurred_at DESC LIMIT 100',
        )
      ).rows,
      media: (
        await db.query(
          "SELECT id,kind,status,failure FROM media_assets WHERE status<>'ready' ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
    }));
  }
  async retry(actor: string, id: string) {
    return transaction(async (db) => {
      await db.query(
        'UPDATE outbox_messages SET attempts=0,failed_at=NULL,available_at=now(),queued_at=NULL WHERE event_id=$1 AND processed_at IS NULL',
        [id],
      );
      await audit(db, actor, 'operations.job_retried', null, { eventId: id });
      return { status: 'queued' };
    });
  }
  async financeGrant(db: PoolClient, actor: string, scope?: string) {
    const g = (
      await db.query(
        'SELECT scopes FROM platform_finance_grants WHERE user_id=$1 AND revoked_at IS NULL',
        [actor],
      )
    ).rows[0];
    if (!g || (scope && !g.scopes.includes(scope)))
      throw new ForbiddenException('يلزم تفويض مالي مستقل عن الإدارة العامة');
  }
  async platformFinance(actor: string) {
    return transaction(async (db) => {
      await this.financeGrant(db, actor);
      const id = await entity(db, null);
      const balances = (
        await db.query(
          "SELECT l.account_code,l.party_id,sum(l.debit)::text debit,sum(l.credit)::text credit FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND j.status='posted' GROUP BY l.account_code,l.party_id ORDER BY l.account_code",
          [id],
        )
      ).rows;
      return {
        mode: 'sandbox',
        balances,
        payouts: (
          await db.query(
            'SELECT *,amount_minor::text FROM sandbox_payouts ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
      };
    });
  }
  async settleable(db: PoolClient, kind: string, party: string) {
    const eid = await entity(db, null),
      code = kind === 'clinic' ? '2000' : kind === 'driver' ? '2200' : '2300';
    const gross = BigInt(
      (
        await db.query(
          "SELECT coalesce(sum(l.credit-l.debit),0)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.account_code=$2 AND l.party_id=$3 AND j.status='posted'",
          [eid, code, party],
        )
      ).rows[0].amount,
    );
    const deferred =
      kind === 'clinic'
        ? BigInt(
            (
              await db.query(
                "SELECT coalesce(sum(l.credit-l.debit),0)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id JOIN ledger_entities e ON e.id=l.entity_id WHERE e.clinic_id=$1 AND l.account_code='2100' AND j.status='posted'",
                [party],
              )
            ).rows[0].amount,
          )
        : 0n;
    return gross - (deferred > 0n ? deferred : 0n);
  }
  async payout(actor: string, kind: string, party: string, amount: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.financeGrant(db, actor, 'maker');
      const available = await this.settleable(db, kind, party);
      const held = BigInt(
        (
          await db.query(
            "SELECT coalesce(sum(amount_minor),0)::text amount FROM sandbox_payouts WHERE party_id=$1 AND kind=$2 AND status='pending'",
            [party, kind],
          )
        ).rows[0].amount,
      );
      if (BigInt(amount) > available - held)
        throw new ConflictException('المبلغ يتجاوز المستحق المتاح');
      const p = (
        await db.query(
          'INSERT INTO sandbox_payouts(kind,party_id,amount_minor,created_by) VALUES($1,$2,$3,$4) RETURNING *',
          [kind, party, amount, actor],
        )
      ).rows[0];
      await audit(db, actor, 'finance.payout_requested', null, {
        payoutId: p.id,
      });
      return p;
    });
  }
  async pay(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.financeGrant(db, actor, 'checker');
      const p = (
        await db.query('SELECT * FROM sandbox_payouts WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (!p || p.status !== 'pending') throw new ConflictException();
      if (p.created_by === actor)
        throw new ForbiddenException('المعد لا ينفذ صرف طلبه');
      const code =
        p.kind === 'clinic' ? '2000' : p.kind === 'driver' ? '2200' : '2300';
      const available = await this.settleable(db, p.kind, p.party_id);
      if (available < BigInt(p.amount_minor))
        throw new ConflictException('تغير المستحق؛ لا يمكن صرف رصيد غير متاح');
      await post(
        db,
        p.created_by,
        await entity(db, null),
        `payout:${id}`,
        'صرف اختباري بعد اعتماد مستقل',
        [
          { account: code, debit: BigInt(p.amount_minor), partyId: p.party_id },
          { account: '1100', credit: BigInt(p.amount_minor) },
        ],
        { approvedBy: actor },
      );
      if (p.kind === 'clinic')
        await post(
          db,
          actor,
          await entity(db, p.party_id),
          `payout-received:${id}`,
          'استلام تحويل اختباري من المنصة',
          [
            { account: '1010', debit: BigInt(p.amount_minor) },
            { account: '1200', credit: BigInt(p.amount_minor) },
          ],
          { approvedBy: actor },
        );
      await db.query(
        "UPDATE sandbox_payouts SET status='paid',reviewed_by=$2 WHERE id=$1",
        [id, actor],
      );
      await audit(db, actor, 'finance.payout_paid', null, { payoutId: id });
      await emit(db, actor, 'SandboxPayoutPaid', id, 1);
      return { status: 'paid' };
    });
  }
  async cancelPayout(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.financeGrant(db, actor);
      const p = (
        await db.query('SELECT * FROM sandbox_payouts WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (!p || p.status !== 'pending') throw new ConflictException();
      if (p.created_by !== actor) await this.financeGrant(db, actor, 'checker');
      await db.query(
        "UPDATE sandbox_payouts SET status='cancelled' WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'finance.payout_cancelled', null, {
        payoutId: id,
      });
      return { status: 'cancelled' };
    });
  }
  async reconcile(
    actor: string,
    id: string,
    amount: string,
    reference: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.financeGrant(db, actor, 'checker');
      const p = (
        await db.query('SELECT * FROM sandbox_payouts WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (!p || p.status !== 'paid' || p.amount_minor !== amount)
        throw new ConflictException('المطابقة لا تطابق مستند الصرف الاختباري');
      await db.query(
        "UPDATE sandbox_payouts SET status='reconciled',statement_reference=$2 WHERE id=$1",
        [id, reference],
      );
      await audit(db, actor, 'finance.payout_reconciled', null, {
        payoutId: id,
      });
      return { status: 'reconciled' };
    });
  }
  async incidentQueue() {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT * FROM ride_incidents ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  async page(slug: string) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          'SELECT slug,title,body FROM cms_pages WHERE slug=$1 AND published',
          [slug],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      return r;
    });
  }
}
