import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { OrganizationService, audit } from '../organizations/service.js';
import { sandbox } from './ledger.js';
@Injectable()
export class BankService {
  constructor(private readonly org: OrganizationService) {}
  async list(actor: string, clinic: string) {
    return transaction(async (db) => {
      const m = await this.org.membership(actor, clinic, undefined, db);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'clinic_accountant', 'cashier'].includes(c),
        )
      )
        throw new ForbiddenException();
      return {
        accounts: (
          await db.query(
            'SELECT id,name,account_reference FROM bank_accounts WHERE clinic_id=$1',
            [clinic],
          )
        ).rows,
        lines: (
          await db.query(
            'SELECT l.*,l.amount_minor::text,l.booked_on::text,b.name bank_name FROM bank_statement_lines l JOIN bank_accounts b ON b.id=l.bank_account_id WHERE l.clinic_id=$1 ORDER BY l.booked_on DESC LIMIT 200',
            [clinic],
          )
        ).rows,
        journalLines: (
          await db.query(
            "SELECT l.id,j.description,l.debit::text,l.credit::text,j.effective_on::text FROM journal_lines l JOIN journals j ON j.id=l.journal_id JOIN ledger_entities e ON e.id=l.entity_id WHERE e.clinic_id=$1 AND j.status='posted' AND l.account_code='1010' AND NOT EXISTS(SELECT 1 FROM bank_statement_lines b WHERE b.journal_line_id=l.id) ORDER BY j.effective_on DESC LIMIT 200",
            [clinic],
          )
        ).rows,
      };
    });
  }
  async account(
    actor: string,
    clinic: string,
    name: string,
    reference: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const r = (
        await db.query(
          'INSERT INTO bank_accounts(clinic_id,name,account_reference,created_by) VALUES($1,$2,$3,$4) RETURNING id',
          [clinic, name, reference, actor],
        )
      ).rows[0];
      await audit(db, actor, 'finance.bank_created', clinic, { bankId: r.id });
      return r;
    });
  }
  async import(
    actor: string,
    clinic: string,
    bank: string,
    lines: { reference: string; bookedOn: string; amountMinor: string }[],
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_accountant', db);
      if (
        !(
          await db.query(
            'SELECT 1 FROM bank_accounts WHERE id=$1 AND clinic_id=$2',
            [bank, clinic],
          )
        ).rowCount
      )
        throw new NotFoundException();
      for (const l of lines) {
        const old = (
          await db.query(
            'SELECT amount_minor,booked_on::text FROM bank_statement_lines WHERE bank_account_id=$1 AND reference=$2',
            [bank, l.reference],
          )
        ).rows[0];
        if (old) {
          if (
            old.amount_minor !== l.amountMinor ||
            old.booked_on !== l.bookedOn
          )
            throw new ConflictException('مرجع كشف مستخدم بمحتوى آخر');
          continue;
        }
        await db.query(
          'INSERT INTO bank_statement_lines(bank_account_id,clinic_id,reference,booked_on,amount_minor) VALUES($1,$2,$3,$4,$5)',
          [bank, clinic, l.reference, l.bookedOn, l.amountMinor],
        );
      }
      await audit(db, actor, 'finance.bank_imported', clinic, {
        bankId: bank,
        count: lines.length,
      });
      return { status: 'imported' };
    });
  }
  async match(actor: string, clinic: string, id: string, lineId: string) {
    sandbox();
    return transaction(async (db) => {
      const m = await this.org.membership(actor, clinic, undefined, db);
      if (
        !m.capabilities.some((c: string) =>
          ['clinic_admin', 'cashier'].includes(c),
        )
      )
        throw new ForbiddenException();
      const bank = (
        await db.query(
          'SELECT * FROM bank_statement_lines WHERE id=$1 AND clinic_id=$2 AND journal_line_id IS NULL FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      const journal = (
        await db.query(
          "SELECT l.*,j.effective_on::text FROM journal_lines l JOIN journals j ON j.id=l.journal_id JOIN ledger_entities e ON e.id=l.entity_id WHERE l.id=$1 AND e.clinic_id=$2 AND l.account_code='1010' AND j.status='posted'",
          [lineId, clinic],
        )
      ).rows[0];
      if (!bank || !journal) throw new NotFoundException();
      if (
        BigInt(bank.amount_minor) !==
        BigInt(journal.debit) - BigInt(journal.credit)
      )
        throw new ConflictException('مبلغ الكشف لا يطابق القيد');
      await db.query(
        'UPDATE bank_statement_lines SET journal_line_id=$2,matched_by=$3,matched_at=now() WHERE id=$1',
        [id, lineId, actor],
      );
      await audit(db, actor, 'finance.bank_matched', clinic, {
        statementLineId: id,
        journalLineId: lineId,
      });
      return { status: 'matched' };
    });
  }
}
