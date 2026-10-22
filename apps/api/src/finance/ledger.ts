import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../database.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
export const accounts: Record<string, string> = {
  '1000': 'النقد الاختباري',
  '1010': 'حساب مصرفي اختباري',
  '1100': 'تحصيل اختبار قيد المطابقة',
  '1200': 'مستحق لدى المنصة',
  '1300': 'المخزون',
  '1350': 'بضاعة بالطريق',
  '2000': 'ذمم العيادات/الموردين',
  '2050': 'استلامات غير مفوترة',
  '2100': 'إيراد مؤجل',
  '2200': 'مستحق سائق',
  '2300': 'أموال حملة مقيدة',
  '2400': 'ضريبة مبيعات اختبارية مستحقة',
  '3000': 'رأس مال اختباري',
  '4000': 'مبيعات/عمولات',
  '4100': 'إيراد خدمات',
  '5000': 'تكلفة المبيعات',
  '5100': 'مصروف عمولة',
  '5200': 'إتلاف وفروقات مخزون',
};
export function sandbox() {
  if (process.env.APP_ENV !== 'local')
    throw new ForbiddenException(
      'هذه العملية اختبارية محلية؛ مزود التحصيل الحقيقي غير مفعل',
    );
}
export type PostingLine = {
  account: string;
  debit?: bigint;
  credit?: bigint;
  partyId?: string;
};
export async function entity(db: PoolClient, clinicId: string | null) {
  await db.query('SELECT pg_advisory_xact_lock(823702)');
  await db.query(
    'INSERT INTO ledger_entities(kind,clinic_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [clinicId ? 'clinic' : 'platform', clinicId],
  );
  const e = (
    await db.query(
      'SELECT id FROM ledger_entities WHERE clinic_id IS NOT DISTINCT FROM $1',
      [clinicId],
    )
  ).rows[0];
  for (const [code, name] of Object.entries(accounts))
    await db.query(
      'INSERT INTO ledger_accounts(entity_id,code,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [e.id, code, name],
    );
  return e.id as string;
}
export async function post(
  db: PoolClient,
  actor: string,
  entityId: string,
  key: string,
  description: string,
  lines: PostingLine[],
  options: {
    date?: string;
    reversalOf?: string;
    approvedBy?: string;
    draft?: boolean;
  } = {},
) {
  const nonzero = lines.filter(
    (l) => (l.debit ?? 0n) > 0n || (l.credit ?? 0n) > 0n,
  );
  if (
    nonzero.length < 2 ||
    nonzero.reduce((sum, l) => sum + (l.debit ?? 0n) - (l.credit ?? 0n), 0n) !==
      0n
  )
    throw new BadRequestException('القيد غير متوازن');
  for (const l of nonzero)
    if (
      !accounts[l.account] ||
      (l.debit ?? 0n) < 0n ||
      (l.credit ?? 0n) < 0n ||
      ((l.debit ?? 0n) > 0n && (l.credit ?? 0n) > 0n)
    )
      throw new BadRequestException('سطر قيد غير صالح');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `ledger:${entityId}`,
  ]);
  const previous = (
    await db.query(
      'SELECT id FROM journals WHERE entity_id=$1 AND source_key=$2',
      [entityId, key],
    )
  ).rows[0];
  if (previous) return previous.id as string;
  const date =
    options.date ??
    (
      await db.query(
        "SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text business_day",
      )
    ).rows[0].business_day;
  if (
    (
      await db.query(
        'SELECT 1 FROM accounting_periods WHERE entity_id=$1 AND starts_on<=$2 AND ends_on>$2 AND closed_at IS NOT NULL',
        [entityId, date],
      )
    ).rowCount
  )
    throw new ConflictException('الفترة المحاسبية مقفلة');
  const id = randomUUID();
  await db.query(
    'INSERT INTO journals(id,entity_id,source_key,description,effective_on,created_by,approved_by,reversal_of) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      entityId,
      key,
      description,
      date,
      actor,
      options.approvedBy ?? null,
      options.reversalOf ?? null,
    ],
  );
  for (const l of nonzero)
    await db.query(
      'INSERT INTO journal_lines(journal_id,entity_id,account_code,debit,credit,party_id) VALUES($1,$2,$3,$4,$5,$6)',
      [
        id,
        entityId,
        l.account,
        (l.debit ?? 0n).toString(),
        (l.credit ?? 0n).toString(),
        l.partyId ?? null,
      ],
    );
  if (options.draft) {
    await audit(db, actor, 'finance.journal_drafted', null, { journalId: id });
    return id;
  }
  await db.query(
    "UPDATE journals SET status='posted',posted_at=now() WHERE id=$1",
    [id],
  );
  await audit(db, actor, 'finance.journal_posted', null, {
    journalId: id,
    entityId,
  });
  await emit(db, actor, 'JournalPosted', id, 1);
  return id;
}
@Injectable()
export class FinanceService {
  constructor(private readonly org: OrganizationService) {}
  async authorized(db: PoolClient, actor: string, clinicId: string) {
    const m = await this.org.membership(actor, clinicId, undefined, db);
    if (
      !m.capabilities.some((c: string) =>
        ['clinic_admin', 'clinic_accountant', 'cashier'].includes(c),
      )
    )
      throw new ForbiddenException('صلاحية مالية مطلوبة');
    return m;
  }
  async summary(actor: string, clinicId: string) {
    return transaction(async (db) => {
      await this.authorized(db, actor, clinicId);
      const id = await entity(db, clinicId);
      const balances = (
        await db.query(
          "SELECT a.code,a.name,coalesce(sum(l.debit),0)::text debit,coalesce(sum(l.credit),0)::text credit FROM ledger_accounts a LEFT JOIN journal_lines l ON l.entity_id=a.entity_id AND l.account_code=a.code AND EXISTS(SELECT 1 FROM journals j WHERE j.id=l.journal_id AND j.status='posted') WHERE a.entity_id=$1 GROUP BY a.code,a.name ORDER BY a.code",
          [id],
        )
      ).rows;
      const journals = (
        await db.query(
          "SELECT j.*,coalesce((SELECT jsonb_agg(jsonb_build_object('account',l.account_code,'debit',l.debit::text,'credit',l.credit::text,'partyId',l.party_id)) FROM journal_lines l WHERE l.journal_id=j.id),'[]') lines FROM journals j WHERE entity_id=$1 ORDER BY posted_at DESC LIMIT 100",
          [id],
        )
      ).rows;
      const approvals = (
        await db.query(
          'SELECT * FROM finance_approvals WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT 100',
          [clinicId],
        )
      ).rows;
      await audit(db, actor, 'finance.report_read', clinicId, { entityId: id });
      const vendorBills = (
        await db.query(
          "SELECT p.id,p.quantity,p.unit_cost::text,p.paid_minor::text,(p.quantity*p.unit_cost-p.paid_minor)::text outstanding_minor,p.due_on::text,v.name vendor_name,pr.name product_name FROM purchase_orders p JOIN vendors v ON v.id=p.vendor_id JOIN products pr ON pr.id=p.product_id WHERE p.clinic_id=$1 AND p.status='billed'",
          [clinicId],
        )
      ).rows;
      return {
        mode: 'sandbox',
        entityId: id,
        balances,
        journals,
        approvals,
        vendorBills,
      };
    });
  }
  async request(
    actor: string,
    clinicId: string,
    kind: 'vendor_payment' | 'reversal',
    sourceId: string,
    reason: string,
    amountMinor?: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      const m = await this.authorized(db, actor, clinicId);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'clinic_accountant'].includes(c),
        )
      )
        throw new ForbiddenException('يلزم معد مالي');
      const exists =
        kind === 'vendor_payment'
          ? await db.query(
              "SELECT 1 FROM purchase_orders WHERE id=$1 AND clinic_id=$2 AND status='billed'",
              [sourceId, clinicId],
            )
          : await db.query(
              "SELECT 1 FROM journals j JOIN ledger_entities e ON e.id=j.entity_id WHERE j.id=$1 AND e.clinic_id=$2 AND j.status='posted' AND j.source_key LIKE 'manual:%' AND j.reversal_of IS NULL",
              [sourceId, clinicId],
            );
      if (!exists.rowCount)
        throw new ConflictException('المصدر غير مؤهل لهذه العملية');
      let amount: string | null = null;
      if (kind === 'vendor_payment') {
        const p = (
          await db.query(
            'SELECT quantity,unit_cost,paid_minor FROM purchase_orders WHERE id=$1',
            [sourceId],
          )
        ).rows[0];
        const outstanding =
          BigInt(p.quantity) * BigInt(p.unit_cost) - BigInt(p.paid_minor);
        const value =
          amountMinor === undefined ? outstanding : BigInt(amountMinor);
        if (value <= 0n || value > outstanding)
          throw new ConflictException('المبلغ يتجاوز المستحق');
        amount = value.toString();
      } else if (amountMinor !== undefined)
        throw new BadRequestException('المبلغ لسداد المورد فقط');
      const r = (
        await db.query(
          'INSERT INTO finance_approvals(clinic_id,kind,source_id,created_by,reason,amount_minor) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [clinicId, kind, sourceId, actor, reason, amount],
        )
      ).rows[0];
      await audit(db, actor, 'finance.approval_requested', clinicId, {
        approvalId: r.id,
      });
      return r;
    });
  }
  async approve(actor: string, clinicId: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      const m = await this.authorized(db, actor, clinicId);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'cashier'].includes(c),
        )
      )
        throw new ForbiddenException('يلزم معتمد صرف');
      const a = (
        await db.query(
          'SELECT * FROM finance_approvals WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinicId],
        )
      ).rows[0];
      if (!a || a.status !== 'pending')
        throw new ConflictException('الطلب غير متاح');
      if (a.created_by === actor)
        throw new ForbiddenException('المعد لا يعتمد طلبه');
      const eid = await entity(db, clinicId);
      if (a.kind === 'vendor_payment') {
        const po = (
          await db.query(
            "SELECT * FROM purchase_orders WHERE id=$1 AND clinic_id=$2 AND status='billed' FOR UPDATE",
            [a.source_id, clinicId],
          )
        ).rows[0];
        if (!po) throw new ConflictException('فاتورة المورد غير مستحقة');
        const outstanding =
          BigInt(po.unit_cost) * BigInt(po.quantity) - BigInt(po.paid_minor);
        const amount =
          a.amount_minor === null ? outstanding : BigInt(a.amount_minor);
        if (amount <= 0n || amount > outstanding)
          throw new ConflictException('تغير المستحق؛ أعد طلب السداد');
        const journalId = await post(
          db,
          a.created_by,
          eid,
          `vendor-paid:${po.id}:${a.id}`,
          'صرف اختباري لفاتورة مورد',
          [
            { account: '2000', debit: amount, partyId: po.vendor_id },
            { account: '1000', credit: amount },
          ],
          { approvedBy: actor },
        );
        await db.query(
          "UPDATE purchase_orders SET paid_minor=paid_minor+$2,status=CASE WHEN paid_minor+$2=quantity*unit_cost THEN 'paid' ELSE 'billed' END WHERE id=$1",
          [po.id, amount.toString()],
        );
        await db.query(
          'INSERT INTO vendor_payments(po_id,clinic_id,amount_minor,journal_id,approval_id,paid_on) SELECT $1,$2,$3,id,$5,effective_on FROM journals WHERE id=$4',
          [po.id, clinicId, amount.toString(), journalId, a.id],
        );
      } else if (a.kind === 'manual_post') {
        const j = (
          await db.query(
            "SELECT * FROM journals WHERE id=$1 AND entity_id=$2 AND status='draft' FOR UPDATE",
            [a.source_id, eid],
          )
        ).rows[0];
        if (!j) throw new ConflictException();
        await db.query(
          "UPDATE journals SET status='posted',posted_at=now(),approved_by=$2 WHERE id=$1",
          [j.id, actor],
        );
        await emit(db, actor, 'JournalPosted', j.id, 1);
      } else {
        const original = (
          await db.query(
            'SELECT * FROM journals WHERE id=$1 AND entity_id=$2',
            [a.source_id, eid],
          )
        ).rows[0];
        if (!original) throw new ConflictException();
        const lines = (
          await db.query('SELECT * FROM journal_lines WHERE journal_id=$1', [
            original.id,
          ])
        ).rows;
        await post(
          db,
          a.created_by,
          eid,
          `reversal:${original.id}`,
          a.reason,
          lines.map((l) => ({
            account: l.account_code,
            debit: BigInt(l.credit),
            credit: BigInt(l.debit),
            partyId: l.party_id,
          })),
          { approvedBy: actor, reversalOf: original.id },
        );
      }
      await db.query(
        "UPDATE finance_approvals SET status='approved',reviewed_by=$2 WHERE id=$1",
        [id, actor],
      );
      await audit(db, actor, 'finance.approved', clinicId, { approvalId: id });
      return { status: 'approved' };
    });
  }
  async reject(actor: string, clinicId: string, id: string) {
    return transaction(async (db) => {
      const m = await this.authorized(db, actor, clinicId);
      const a = (
        await db.query(
          'SELECT * FROM finance_approvals WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinicId],
        )
      ).rows[0];
      if (!a || a.status !== 'pending')
        throw new ConflictException('الموافقة ليست معلقة');
      if (
        a.created_by !== actor &&
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'cashier'].includes(c),
        )
      )
        throw new ForbiddenException('يلزم المعد أو المعتمد');
      await db.query(
        "UPDATE finance_approvals SET status='rejected',reviewed_by=$2 WHERE id=$1",
        [id, actor],
      );
      await audit(db, actor, 'finance.approval_rejected', clinicId, {
        approvalId: id,
      });
      return { status: 'rejected' };
    });
  }
  async manual(
    actor: string,
    clinicId: string,
    key: string,
    description: string,
    date: string,
    lines: { account: string; debit: string; credit: string }[],
  ) {
    sandbox();
    return transaction(async (db) => {
      const m = await this.authorized(db, actor, clinicId);
      if (!m.capabilities.includes('clinic_accountant'))
        throw new ForbiddenException('يلزم محاسب العيادة');
      const eid = await entity(db, clinicId);
      const hash = createHash('sha256')
        .update(JSON.stringify({ description, date, lines }))
        .digest('hex');
      const old = (
        await db.query(
          'SELECT request_hash FROM journals WHERE entity_id=$1 AND source_key=$2',
          [eid, `manual:${key}`],
        )
      ).rows[0];
      if (old && old.request_hash !== hash)
        throw new ConflictException('المفتاح مستخدم لقيد مختلف');
      const id = await post(
        db,
        actor,
        eid,
        `manual:${key}`,
        description,
        lines.map((l) => ({
          account: l.account,
          debit: BigInt(l.debit),
          credit: BigInt(l.credit),
        })),
        { date, draft: true },
      );
      await db.query(
        "UPDATE journals SET request_hash=$2 WHERE id=$1 AND status='draft' AND request_hash IS NULL",
        [id, hash],
      );
      await db.query(
        "INSERT INTO finance_approvals(clinic_id,kind,source_id,created_by,reason) VALUES($1,'manual_post',$2,$3,$4) ON CONFLICT DO NOTHING",
        [clinicId, id, actor, description],
      );
      return { id, status: 'draft' };
    });
  }
  async close(
    actor: string,
    clinicId: string,
    startsOn: string,
    endsOn: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.org.membership(actor, clinicId, 'clinic_admin', db);
      const id = await entity(db, clinicId);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `ledger:${id}`,
      ]);
      if (startsOn >= endsOn || endsOn > new Date().toISOString().slice(0, 10))
        throw new BadRequestException('أقفل فترة منتهية فقط');
      if (
        (
          await db.query(
            "SELECT 1 FROM clinic_orders WHERE clinic_id=$1 AND status IN ('confirmed','packed','shipped')",
            [clinicId],
          )
        ).rowCount
      )
        throw new ConflictException('توجد طلبات معلقة؛ لا يمكن الإقفال');
      if (
        (
          await db.query(
            'SELECT 1 FROM bank_statement_lines WHERE clinic_id=$1 AND booked_on>=$2 AND booked_on<$3 AND journal_line_id IS NULL',
            [clinicId, startsOn, endsOn],
          )
        ).rowCount
      )
        throw new ConflictException('يوجد كشف مصرفي غير مطابق في الفترة');
      await db.query(
        'INSERT INTO accounting_periods(entity_id,starts_on,ends_on,closed_at,closed_by) VALUES($1,$2,$3,now(),$4)',
        [id, startsOn, endsOn, actor],
      );
      await audit(db, actor, 'finance.period_closed', clinicId, {
        startsOn,
        endsOn,
      });
      return { status: 'closed' };
    });
  }
}
