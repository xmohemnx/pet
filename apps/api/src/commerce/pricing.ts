import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { CouponInput } from '../../../../packages/contracts/src/index.js';
import { transaction } from '../database.js';
import { audit, emit } from '../organizations/service.js';
import { FinanceService, sandbox } from '../finance/ledger.js';
import { CommerceService } from './service.js';
import { buildQuote, pricingLock, couponUsageSql } from './pricing-engine.js';
export interface CreateCoupon {
  code: string;
  kind: 'fixed' | 'percent';
  value: string;
  minimumMinor: string;
  maximumDiscountMinor: string | null;
  startsAt: string;
  endsAt: string;
  maxUses: number;
  maxPerUser: number;
}
@Injectable()
export class CommercePricingService {
  constructor(
    private readonly commerce: CommerceService,
    private readonly finance: FinanceService,
  ) {}
  quote(
    actor: string,
    items: { productId: string; quantity: number }[],
    coupons: CouponInput[],
  ) {
    sandbox();
    return transaction(
      async (db) => (await buildQuote(db, actor, items, coupons)).quote,
    );
  }
  dashboard(actor: string, clinic: string) {
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      const tax = (
        await db.query(
          'SELECT rate_bps,label,version FROM commerce_tax_settings WHERE clinic_id=$1',
          [clinic],
        )
      ).rows[0] ?? { rate_bps: 0, label: 'ضريبة اختبارية', version: 0 };
      const coupons = (
        await db.query(
          `SELECT coupon.*,u.uses FROM commerce_coupons coupon CROSS JOIN LATERAL (${couponUsageSql.replace('c.coupon_id=$1', 'c.coupon_id=coupon.id')}) u WHERE coupon.clinic_id=$1 ORDER BY coupon.created_at DESC LIMIT 200`,
          [clinic, actor],
        )
      ).rows;
      return { tax, coupons };
    });
  }
  create(actor: string, clinic: string, i: CreateCoupon) {
    sandbox();
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      await pricingLock(db, clinic);
      if (
        new Date(i.endsAt) <= new Date(i.startsAt) ||
        new Date(i.endsAt) <= new Date() ||
        new Date(i.endsAt).getTime() - new Date(i.startsAt).getTime() >
          366 * 86400000 ||
        BigInt(i.value) <= 0n ||
        (i.kind === 'percent' && BigInt(i.value) > 10000n) ||
        (i.maximumDiscountMinor !== null &&
          BigInt(i.maximumDiscountMinor) <= 0n)
      )
        throw new BadRequestException('قيمة أو فترة الكوبون غير صالحة');
      if (
        (
          await db.query(
            'SELECT count(*)::int n FROM commerce_coupons WHERE clinic_id=$1',
            [clinic],
          )
        ).rows[0].n >= 200
      )
        throw new ConflictException('حد الكوبونات 200؛ عطل الرموز القديمة');
      const c = (
        await db.query(
          'INSERT INTO commerce_coupons(clinic_id,code,kind,value,minimum_minor,maximum_discount_minor,starts_at,ends_at,max_uses,max_per_user,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(clinic_id,code) DO NOTHING RETURNING id',
          [
            clinic,
            i.code,
            i.kind,
            i.value,
            i.minimumMinor,
            i.maximumDiscountMinor,
            i.startsAt,
            i.endsAt,
            i.maxUses,
            i.maxPerUser,
            actor,
          ],
        )
      ).rows[0];
      if (!c) throw new ConflictException('الرمز مستخدم؛ اختر رمزاً جديداً');
      await audit(db, actor, 'commerce.coupon_created', clinic, {
        couponId: c.id,
      });
      await emit(db, actor, 'CouponCreated', c.id, 1, clinic);
      return c;
    });
  }
  toggle(
    actor: string,
    clinic: string,
    id: string,
    active: boolean,
    version: number,
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      await pricingLock(db, clinic);
      const c = (
        await db.query(
          'SELECT version FROM commerce_coupons WHERE id=$1 AND clinic_id=$2',
          [id, clinic],
        )
      ).rows[0];
      if (!c) throw new NotFoundException();
      if (c.version !== version)
        throw new ConflictException('حدث الكوبون قبل التعديل');
      await db.query(
        'UPDATE commerce_coupons SET active=$2,version=version+1 WHERE id=$1',
        [id, active],
      );
      await audit(db, actor, 'commerce.coupon_toggled', clinic, {
        couponId: id,
        active,
      });
      await emit(db, actor, 'CouponUpdated', id, version + 1, clinic);
      return { version: version + 1 };
    });
  }
  tax(
    actor: string,
    clinic: string,
    i: { rateBps: number; label: string; version: number },
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      await this.finance.authorized(db, actor, clinic);
      await pricingLock(db, clinic);
      const old = (
        await db.query(
          'SELECT version FROM commerce_tax_settings WHERE clinic_id=$1',
          [clinic],
        )
      ).rows[0];
      if ((old?.version ?? 0) !== i.version)
        throw new ConflictException('حدث إعداد الضريبة قبل التعديل');
      const saved = (
        await db.query(
          'INSERT INTO commerce_tax_settings(clinic_id,rate_bps,label,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(clinic_id) DO UPDATE SET rate_bps=excluded.rate_bps,label=excluded.label,version=commerce_tax_settings.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING id',
          [clinic, i.rateBps, i.label, actor],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.tax_configured', clinic, {
        rateBps: i.rateBps,
        version: i.version + 1,
      });
      await emit(
        db,
        actor,
        'CommerceTaxUpdated',
        saved.id,
        i.version + 1,
        clinic,
      );
      return { version: i.version + 1 };
    });
  }
}
