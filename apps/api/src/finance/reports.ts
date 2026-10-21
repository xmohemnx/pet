import { Injectable, BadRequestException } from '@nestjs/common';
import { FinanceService, entity } from './ledger.js';
import { transaction } from '../database.js';
import { audit } from '../organizations/service.js';
@Injectable()
export class FinancialReports {
  constructor(private readonly finance: FinanceService) {}
  async read(actor: string, clinic: string, asOf: string) {
    return transaction(async (db) => {
      await this.finance.authorized(db, actor, clinic);
      const day = (
        await db.query(
          "SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text business_day",
        )
      ).rows[0].business_day;
      if (asOf > day || asOf < '2000-01-01')
        throw new BadRequestException('تاريخ التقرير خارج النطاق');
      const eid = await entity(db, clinic);
      const balances = (
        await db.query(
          "SELECT a.code,a.name,coalesce(sum(l.debit),0)::text debit,coalesce(sum(l.credit),0)::text credit FROM ledger_accounts a LEFT JOIN journal_lines l ON l.entity_id=a.entity_id AND l.account_code=a.code AND EXISTS(SELECT 1 FROM journals j WHERE j.id=l.journal_id AND j.status='posted' AND j.effective_on<=$2) WHERE a.entity_id=$1 GROUP BY a.code,a.name ORDER BY a.code",
          [eid, asOf],
        )
      ).rows;
      const total = (prefix: string, credit = false) =>
        balances
          .filter((a) => a.code.startsWith(prefix))
          .reduce(
            (n, a) =>
              n +
              (credit
                ? BigInt(a.credit) - BigInt(a.debit)
                : BigInt(a.debit) - BigInt(a.credit)),
            0n,
          );
      const assets = total('1'),
        liabilities = total('2', true),
        equity = total('3', true),
        revenue = total('4', true),
        expenses = total('5'),
        profit = revenue - expenses;
      const payables = (
        await db.query(
          "SELECT p.id,v.name vendor_name,p.due_on::text,(p.quantity*p.unit_cost-coalesce((SELECT sum(amount_minor) FROM vendor_payments vp WHERE vp.po_id=p.id AND vp.paid_on<=$2),0))::text outstanding_minor,greatest(0,$2::date-p.due_on)::int days_overdue FROM purchase_orders p JOIN vendors v ON v.id=p.vendor_id WHERE p.clinic_id=$1 AND EXISTS(SELECT 1 FROM journals j JOIN ledger_entities e ON e.id=j.entity_id WHERE e.clinic_id=p.clinic_id AND j.source_key='bill:'||p.id::text AND j.status='posted' AND j.effective_on<=$2) ORDER BY p.due_on,p.id",
          [clinic, asOf],
        )
      ).rows.filter((p) => BigInt(p.outstanding_minor) > 0n);
      const aging: Record<string, bigint> = {
        current: 0n,
        days1to30: 0n,
        days31to60: 0n,
        days61to90: 0n,
        over90: 0n,
      };
      for (const p of payables) {
        const key =
          p.days_overdue === 0
            ? 'current'
            : p.days_overdue <= 30
              ? 'days1to30'
              : p.days_overdue <= 60
                ? 'days31to60'
                : p.days_overdue <= 90
                  ? 'days61to90'
                  : 'over90';
        aging[key]! += BigInt(p.outstanding_minor);
      }
      await audit(db, actor, 'finance.statements_read', clinic, { asOf });
      return {
        asOf,
        mode: 'sandbox',
        balances,
        statements: {
          assets: assets.toString(),
          liabilities: liabilities.toString(),
          equity: equity.toString(),
          revenue: revenue.toString(),
          expenses: expenses.toString(),
          profit: profit.toString(),
          difference: (assets - liabilities - equity - profit).toString(),
        },
        payables,
        aging: Object.fromEntries(
          Object.entries(aging).map(([k, v]) => [k, v.toString()]),
        ),
      };
    });
  }
}
