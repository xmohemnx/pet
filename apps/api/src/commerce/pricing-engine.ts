import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  allocateDiscount,
  exclusiveTax,
  type CouponInput,
  type CheckoutQuote,
} from '../../../../packages/contracts/src/index.js';
import { storefrontJoin, sellableSql } from './catalog-sql.js';

export const pricingLock = async (db: PoolClient, clinic: string) => {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `pricing:${clinic}`,
  ]);
};
export const couponUsageSql = `SELECT count(*)::int uses,count(*) FILTER(WHERE o.user_id=$2)::int own_uses FROM clinic_orders c JOIN checkout_orders o ON o.id=c.parent_id WHERE c.coupon_id=$1 AND (o.status='captured' OR (o.status='reserved' AND o.expires_at>now()))`;
export function normalizeCoupons(coupons: CouponInput[]) {
  const result = coupons
    .map((i) => ({
      clinicId: i.clinicId.toLowerCase(),
      code: i.code.trim().toUpperCase(),
    }))
    .sort((a, b) => a.clinicId.localeCompare(b.clinicId));
  if (new Set(result.map((i) => i.clinicId)).size !== result.length)
    throw new BadRequestException('كوبون واحد لكل عيادة دون تكديس');
  return result;
}
export async function buildQuote(
  db: PoolClient,
  actor: string,
  items: { productId: string; quantity: number }[],
  input: CouponInput[],
) {
  const coupons = normalizeCoupons(input),
    sorted = items
      .map((i) => ({ ...i, productId: i.productId.toLowerCase() }))
      .sort((a, b) => a.productId.localeCompare(b.productId));
  if (new Set(sorted.map((i) => i.productId)).size !== sorted.length)
    throw new BadRequestException('ادمج الكمية للمنتج المتكرر');
  const products: {
    id: string;
    clinic_id: string;
    clinic_name: string;
    name: string;
    quantity: number;
    price_minor: string;
    cost_minor: string;
  }[] = [];
  for (const i of sorted) {
    const p = (
      await db.query(
        `SELECT p.*,c.name clinic_name FROM products p ${storefrontJoin} WHERE p.id=$1 AND ${sellableSql} FOR UPDATE OF p FOR SHARE OF s,c`,
        [i.productId],
      )
    ).rows[0];
    const available = p
      ? (await db.query('SELECT available_stock($1) n', [p.id])).rows[0].n
      : 0;
    if (!p || available < i.quantity)
      throw new ConflictException('أحد المنتجات غير متاح بالكمية المطلوبة');
    products.push({ ...p, quantity: i.quantity });
  }
  const clinics = [...new Set(products.map((p) => p.clinic_id))].sort();
  if (coupons.some((c) => !clinics.includes(c.clinicId)))
    throw new BadRequestException('الكوبون لا يخص عيادة في السلة');
  for (const clinic of clinics) await pricingLock(db, clinic);
  const groups: CheckoutQuote['groups'] = [],
    couponIds = new Map<string, string>();
  const policyVersions: unknown[] = [];
  for (const clinic of clinics) {
    const own = products.filter((p) => p.clinic_id === clinic),
      gross = own.map((p) => BigInt(p.price_minor) * BigInt(p.quantity)),
      subtotal = gross.reduce((a, b) => a + b, 0n);
    const tax = (
      await db.query('SELECT * FROM commerce_tax_settings WHERE clinic_id=$1', [
        clinic,
      ])
    ).rows[0];
    const requested = coupons.find((c) => c.clinicId === clinic);
    let discount = 0n,
      couponVersion = 0;
    if (requested) {
      const c = (
        await db.query(
          'SELECT * FROM commerce_coupons WHERE clinic_id=$1 AND code=$2 AND active AND starts_at<=now() AND ends_at>now()',
          [clinic, requested.code],
        )
      ).rows[0];
      if (!c || subtotal < BigInt(c.minimum_minor))
        throw new ConflictException('الكوبون غير متاح لهذه السلة');
      const use = (await db.query(couponUsageSql, [c.id, actor])).rows[0];
      if (use.uses >= c.max_uses || use.own_uses >= c.max_per_user)
        throw new ConflictException('الكوبون غير متاح لهذه السلة');
      discount =
        c.kind === 'fixed'
          ? BigInt(c.value)
          : (subtotal * BigInt(c.value)) / 10000n;
      if (
        c.maximum_discount_minor !== null &&
        discount > BigInt(c.maximum_discount_minor)
      )
        discount = BigInt(c.maximum_discount_minor);
      if (discount > subtotal) discount = subtotal;
      if (discount === 0n)
        throw new ConflictException('الكوبون غير متاح لهذه السلة');
      couponIds.set(clinic, c.id);
      couponVersion = c.version;
    }
    const portions = allocateDiscount(gross, discount),
      rate = tax?.rate_bps ?? 0;
    const lines = own.map((p, n) => {
      const net = gross[n]! - portions[n]!,
        tax = exclusiveTax(net, rate);
      return {
        productId: p.id,
        quantity: p.quantity,
        unitPriceMinor: p.price_minor,
        discountMinor: portions[n]!.toString(),
        taxMinor: tax.toString(),
        totalMinor: (net + tax).toString(),
      };
    });
    const taxTotal = lines.reduce((a, l) => a + BigInt(l.taxMinor), 0n);
    groups.push({
      clinicId: clinic,
      clinicName: own[0]!.clinic_name,
      couponCode: requested?.code ?? null,
      taxBps: rate,
      taxLabel: tax?.label ?? '',
      subtotalMinor: subtotal.toString(),
      discountMinor: discount.toString(),
      taxMinor: taxTotal.toString(),
      totalMinor: (subtotal - discount + taxTotal).toString(),
      lines,
    });
    policyVersions.push([
      clinic,
      tax?.version ?? 0,
      couponIds.get(clinic) ?? null,
      couponVersion,
    ]);
  }
  const sum = (
    field: 'subtotalMinor' | 'discountMinor' | 'taxMinor' | 'totalMinor',
  ) => groups.reduce((a, g) => a + BigInt(g[field]), 0n).toString();
  const quote: CheckoutQuote = {
    quoteHash: createHash('sha256')
      .update(JSON.stringify({ groups, policyVersions }))
      .digest('hex'),
    subtotalMinor: sum('subtotalMinor'),
    discountMinor: sum('discountMinor'),
    taxMinor: sum('taxMinor'),
    totalMinor: sum('totalMinor'),
    groups,
  };
  return { quote, products, couponIds };
}
