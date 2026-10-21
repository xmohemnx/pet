import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  refundCommission,
  quantityRefund,
  type CouponInput,
} from '../../../../packages/contracts/src/index.js';
import { buildQuote, normalizeCoupons, pricingLock } from './pricing-engine.js';
import { transaction } from '../database.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';
import type { PoolClient } from 'pg';
import {
  storefrontJoin,
  sellableSql,
  publicProductSql,
  productImagesSql,
} from './catalog-sql.js';
@Injectable()
export class CommerceService {
  constructor(private readonly org: OrganizationService) {}
  async staff(
    db: PoolClient,
    actor: string,
    clinic: string,
    kind = 'commerce',
  ) {
    const m = await this.org.membership(actor, clinic, undefined, db);
    if (
      !m.capabilities.some((c: string) =>
        [
          'clinic_admin',
          kind === 'stock' ? 'inventory_clerk' : 'commerce_manager',
        ].includes(c),
      )
    )
      throw new ForbiddenException('صلاحية تجارة/مخزون مطلوبة');
  }
  async cart(actor: string, items?: { productId: string; quantity: number }[]) {
    return transaction(async (db) => {
      if (items) {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `cart:${actor}`,
        ]);
        if (new Set(items.map((i) => i.productId)).size !== items.length)
          throw new BadRequestException('منتج متكرر');
        for (const i of items)
          if (
            !(
              await db.query(
                `SELECT 1 FROM products p ${storefrontJoin} WHERE p.id=$1 AND ${sellableSql}`,
                [i.productId],
              )
            ).rowCount
          )
            throw new ConflictException('منتج غير متاح');
        await db.query('DELETE FROM cart_items WHERE user_id=$1', [actor]);
        for (const i of items)
          await db.query(
            'INSERT INTO cart_items(user_id,product_id,quantity) VALUES($1,$2,$3)',
            [actor, i.productId, i.quantity],
          );
      }
      return (
        await db.query(
          'SELECT product_id,quantity FROM cart_items WHERE user_id=$1',
          [actor],
        )
      ).rows;
    });
  }
  async wishlist(actor: string, id?: string, enabled?: boolean) {
    return transaction(async (db) => {
      if (id) {
        if (
          !(
            await db.query(
              `SELECT 1 FROM products p ${storefrontJoin} WHERE p.id=$1 AND ${sellableSql}`,
              [id],
            )
          ).rowCount
        )
          throw new NotFoundException();
        if (enabled)
          await db.query(
            'INSERT INTO product_wishlist(user_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [actor, id],
          );
        else
          await db.query(
            'DELETE FROM product_wishlist WHERE user_id=$1 AND product_id=$2',
            [actor, id],
          );
      }
      return (
        await db.query(
          'SELECT product_id FROM product_wishlist WHERE user_id=$1',
          [actor],
        )
      ).rows.map((r) => r.product_id);
    });
  }
  async reviews(
    actor: string,
    product: string,
    input?: { orderLineId: string; rating: number; body: string },
  ) {
    return transaction(async (db) => {
      if (input) {
        if (
          !(
            await db.query(
              "SELECT 1 FROM order_lines l JOIN clinic_orders c ON c.id=l.order_id JOIN checkout_orders o ON o.id=c.parent_id WHERE l.id=$1 AND l.product_id=$2 AND o.user_id=$3 AND c.status IN ('delivered','returned')",
              [input.orderLineId, product, actor],
            )
          ).rowCount
        )
          throw new ForbiddenException('التقييم لعملية شراء تم تسليمها فقط');
        await db.query(
          'INSERT INTO product_reviews(user_id,product_id,order_line_id,rating,body) VALUES($1,$2,$3,$4,$5)',
          [actor, product, input.orderLineId, input.rating, input.body],
        );
        await audit(db, actor, 'commerce.verified_review_created', null, {
          productId: product,
        });
      }
      return (
        await db.query(
          'SELECT r.id,r.rating,r.body,r.created_at,u.name FROM product_reviews r JOIN auth_users u ON u.id=r.user_id WHERE product_id=$1 ORDER BY created_at DESC LIMIT 100',
          [product],
        )
      ).rows;
    });
  }
  async catalog(clinic?: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT ${publicProductSql} FROM products p ${storefrontJoin} WHERE ${sellableSql} AND ($1::uuid IS NULL OR p.clinic_id=$1) ORDER BY p.name,p.id LIMIT 200`,
            [clinic ?? null],
          )
        ).rows,
    );
  }
  async clinic(actor: string, id: string) {
    return transaction(async (db) => {
      await this.staff(db, actor, id);
      return {
        products: (
          await db.query(
            `SELECT p.*,p.price_minor::text,p.cost_minor::text,${productImagesSql} images,product_variant_attributes(p.id) variant_attributes,(SELECT dimensions FROM product_variant_matrices WHERE parent_product_id=p.id) matrix_dimensions FROM products p WHERE clinic_id=$1 ORDER BY name`,
            [id],
          )
        ).rows,
        orders: (
          await db.query(
            'SELECT co.*,co.total_minor::text,co.commission_minor::text,customer.address delivery_address,(SELECT row_to_json(s) FROM shipments s WHERE s.order_id=co.id) shipment FROM clinic_orders co JOIN checkout_orders customer ON customer.id=co.parent_id WHERE co.clinic_id=$1 ORDER BY co.id DESC LIMIT 100',
            [id],
          )
        ).rows,
        vendors: (
          await db.query('SELECT * FROM vendors WHERE clinic_id=$1', [id])
        ).rows,
        purchases: (
          await db.query(
            'SELECT po.*,p.name product_name,v.name vendor_name,po.unit_cost::text FROM purchase_orders po JOIN products p ON p.id=po.product_id JOIN vendors v ON v.id=po.vendor_id WHERE po.clinic_id=$1 ORDER BY po.id DESC',
            [id],
          )
        ).rows,
        returns: (
          await db.query(
            'SELECT r.*,l.name product_name,l.order_id FROM return_requests r JOIN order_lines l ON l.id=r.line_id WHERE l.clinic_id=$1 ORDER BY r.created_at DESC',
            [id],
          )
        ).rows,
      };
    });
  }
  async product(
    actor: string,
    clinic: string,
    input: {
      sku: string;
      name: string;
      description: string;
      species: string;
      priceMinor: string;
      costMinor: string;
      parentProductId?: string;
      variantLabel?: string;
    },
  ) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic);
      if (input.parentProductId) {
        if (!input.variantLabel?.trim())
          throw new BadRequestException('اسم الخيار مطلوب');
        if (
          !(
            await db.query(
              'SELECT 1 FROM products WHERE id=$1 AND clinic_id=$2 AND parent_product_id IS NULL AND NOT EXISTS(SELECT 1 FROM product_variant_matrices WHERE parent_product_id=$1) FOR SHARE',
              [input.parentProductId, clinic],
            )
          ).rowCount
        )
          throw new BadRequestException(
            'المنتج الأصلي يجب أن يكون من العيادة نفسها دون أصل آخر',
          );
      } else if (input.variantLabel)
        throw new BadRequestException('اختر المنتج الأصلي للخيار');
      const p = (
        await db.query(
          'INSERT INTO products(clinic_id,sku,name,description,species,price_minor,cost_minor,parent_product_id,variant_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [
            clinic,
            input.sku,
            input.name,
            input.description,
            input.species,
            input.priceMinor,
            input.costMinor,
            input.parentProductId ?? null,
            input.variantLabel ?? '',
          ],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.product_created', clinic, {
        productId: p.id,
      });
      return p;
    });
  }
  async editProduct(
    actor: string,
    clinic: string,
    id: string,
    input: {
      name: string;
      description: string;
      priceMinor: string;
      active: boolean;
      version: number;
    },
  ) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic);
      const r = await db.query(
        'UPDATE products SET name=$3,description=$4,price_minor=$5,active=$6,version=version+1 WHERE id=$1 AND clinic_id=$2 AND version=$7 RETURNING id,version',
        [
          id,
          clinic,
          input.name,
          input.description,
          input.priceMinor,
          input.active,
          input.version,
        ],
      );
      if (!r.rowCount)
        throw new ConflictException('تغير المنتج أو لا تملك الوصول');
      await audit(db, actor, 'commerce.product_updated', clinic, {
        productId: id,
      });
      return r.rows[0];
    });
  }
  async vendor(actor: string, clinic: string, name: string, contact: string) {
    return transaction(async (db) => {
      await this.staff(db, actor, clinic, 'stock');
      const r = (
        await db.query(
          'INSERT INTO vendors(clinic_id,name,contact) VALUES($1,$2,$3) RETURNING *',
          [clinic, name, contact],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.vendor_created', clinic, {
        vendorId: r.id,
      });
      return r;
    });
  }
  async purchase(
    actor: string,
    clinic: string,
    productId: string,
    vendorId: string,
    quantity: number,
    unitCost: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await this.staff(db, actor, clinic, 'stock');
      if (
        !(
          await db.query(
            'SELECT 1 FROM products p JOIN vendors v ON v.clinic_id=p.clinic_id WHERE p.id=$1 AND v.id=$2 AND p.clinic_id=$3',
            [productId, vendorId, clinic],
          )
        ).rowCount
      )
        throw new NotFoundException();
      const r = (
        await db.query(
          'INSERT INTO purchase_orders(clinic_id,product_id,vendor_id,quantity,unit_cost,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [clinic, productId, vendorId, quantity, unitCost, actor],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.purchase_created', clinic, {
        purchaseId: r.id,
      });
      return r;
    });
  }
  async receive(actor: string, clinic: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.staff(db, actor, clinic, 'stock');
      const po = (
        await db.query(
          'SELECT * FROM purchase_orders WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (!po) throw new NotFoundException();
      if (po.status !== 'ordered')
        throw new ConflictException('استلم الطلب سابقًا');
      const receivedQuantity = po.quantity - po.received_quantity;
      await db.query(
        'UPDATE products SET on_hand=on_hand+$2,version=version+1 WHERE id=$1',
        [po.product_id, receivedQuantity],
      );
      await db.query(
        'INSERT INTO inventory_layers(product_id,remaining,unit_cost) VALUES($1,$2,$3)',
        [po.product_id, receivedQuantity, po.unit_cost],
      );
      await db.query(
        "INSERT INTO stock_movements(product_id,clinic_id,quantity,kind,source_key,actor_id) VALUES($1,$2,$3,'receipt',$4,$5)",
        [po.product_id, clinic, receivedQuantity, `receipt:${id}`, actor],
      );
      const amount = BigInt(po.unit_cost) * BigInt(receivedQuantity);
      if (amount > 0n)
        await post(
          db,
          actor,
          await entity(db, clinic),
          `receipt:${id}`,
          'استلام مخزون اختباري',
          [
            { account: '1300', debit: amount },
            { account: '2050', credit: amount },
          ],
        );
      await db.query(
        "UPDATE purchase_orders SET status='received',received_quantity=quantity WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'commerce.goods_received', clinic, {
        purchaseId: id,
      });
      return { status: 'received' };
    });
  }
  async bill(actor: string, clinic: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.staff(db, actor, clinic, 'stock');
      const po = (
        await db.query(
          'SELECT * FROM purchase_orders WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (!po || po.status !== 'received')
        throw new ConflictException('الفاتورة تتطلب استلامًا مطابقًا');
      const amount = BigInt(po.quantity) * BigInt(po.unit_cost);
      if (amount > 0n)
        await post(
          db,
          actor,
          await entity(db, clinic),
          `bill:${id}`,
          'فاتورة مورد مطابقة للاستلام',
          [
            { account: '2050', debit: amount },
            { account: '2000', credit: amount, partyId: po.vendor_id },
          ],
        );
      await db.query("UPDATE purchase_orders SET status='billed' WHERE id=$1", [
        id,
      ]);
      await audit(db, actor, 'commerce.vendor_billed', clinic, {
        purchaseId: id,
      });
      return { status: 'billed' };
    });
  }
  async checkout(
    actor: string,
    key: string,
    items: { productId: string; quantity: number }[],
    address: string | undefined,
    addressId?: string,
    couponInput: CouponInput[] = [],
    quoteHash?: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      const coupons = normalizeCoupons(couponInput);
      const sorted = items
        .map((i) => ({ ...i, productId: i.productId.toLowerCase() }))
        .sort((a, b) => a.productId.localeCompare(b.productId));
      if (new Set(sorted.map((i) => i.productId)).size !== sorted.length)
        throw new BadRequestException('ادمج الكمية للمنتج المتكرر');
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            items: sorted,
            address: addressId ? { id: addressId } : address,
            ...(coupons.length ? { coupons } : {}),
            ...(quoteHash ? { quoteHash } : {}),
          }),
        )
        .digest('hex');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `checkout:${actor}:${key}`,
      ]);
      const old = (
        await db.query(
          'SELECT * FROM checkout_orders WHERE user_id=$1 AND idempotency_key=$2',
          [actor, key],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new ConflictException('المفتاح مستخدم لمحتوى مختلف');
        return old;
      }
      let snapshot: Record<string, unknown> | null = null;
      if (addressId) {
        snapshot =
          (
            await db.query(
              'SELECT label,contact_name,phone,province,city,area,street,building,landmark FROM delivery_addresses WHERE id=$1 AND user_id=$2 FOR SHARE',
              [addressId, actor],
            )
          ).rows[0] ?? null;
        if (!snapshot) throw new NotFoundException('العنوان غير متاح');
        address = Object.values(snapshot).filter(Boolean).join('، ');
      }
      const { quote, products, couponIds } = await buildQuote(
        db,
        actor,
        sorted,
        coupons,
      );
      if (
        (quoteHash && quoteHash !== quote.quoteHash) ||
        (!quoteHash && (coupons.length > 0 || BigInt(quote.taxMinor) > 0n))
      )
        throw new ConflictException('راجع السعر النهائي من جديد قبل حجز الطلب');
      const parent = (
        await db.query(
          'INSERT INTO checkout_orders(user_id,idempotency_key,request_hash,total_minor,address,shipping_address,subtotal_minor,discount_minor,tax_minor,quote_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [
            actor,
            key,
            hash,
            quote.totalMinor,
            address,
            snapshot ? JSON.stringify(snapshot) : null,
            quote.subtotalMinor,
            quote.discountMinor,
            quote.taxMinor,
            quote.quoteHash,
          ],
        )
      ).rows[0];
      const bps = BigInt(
        (await db.query('SELECT commission_bps FROM sandbox_policy')).rows[0]
          .commission_bps,
      );
      for (const g of quote.groups) {
        const commission =
          ((BigInt(g.subtotalMinor) - BigInt(g.discountMinor)) * bps) / 10000n;
        const order = (
          await db.query(
            'INSERT INTO clinic_orders(parent_id,clinic_id,total_minor,commission_minor,subtotal_minor,discount_minor,tax_minor,tax_bps,tax_label,coupon_id,coupon_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
            [
              parent.id,
              g.clinicId,
              g.totalMinor,
              commission.toString(),
              g.subtotalMinor,
              g.discountMinor,
              g.taxMinor,
              g.taxBps,
              g.taxLabel,
              couponIds.get(g.clinicId) ?? null,
              g.couponCode,
            ],
          )
        ).rows[0];
        for (const l of g.lines) {
          const p = products.find((p) => p.id === l.productId)!;
          await db.query(
            'INSERT INTO order_lines(order_id,clinic_id,product_id,name,quantity,unit_price,unit_cost,discount_minor,tax_minor,tax_bps) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [
              order.id,
              g.clinicId,
              p.id,
              p.name,
              p.quantity,
              p.price_minor,
              p.cost_minor,
              l.discountMinor,
              l.taxMinor,
              g.taxBps,
            ],
          );
          await db.query(
            'UPDATE products SET reserved=reserved+$2 WHERE id=$1',
            [p.id, p.quantity],
          );
        }
      }
      for (const i of sorted)
        await db.query(
          'DELETE FROM cart_items WHERE user_id=$1 AND product_id=$2',
          [actor, i.productId],
        );
      await audit(db, actor, 'commerce.checkout_reserved', null, {
        orderId: parent.id,
      });
      await emit(db, actor, 'OrderReserved', parent.id, 1);
      return parent;
    });
  }
  async orders(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            `SELECT o.*,o.total_minor::text,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'clinic_id',c.clinic_id,'clinic_name',cl.name,'status',c.status,'shipment',(SELECT jsonb_build_object('carrier',s.carrier,'tracking_code',s.tracking_code,'version',s.version) FROM shipments s WHERE s.order_id=c.id),'shipment_events',coalesce((SELECT jsonb_agg(jsonb_build_object('status',se.status,'created_at',se.created_at) ORDER BY se.created_at,se.id) FROM shipment_events se WHERE se.order_id=c.id),'[]'),'total_minor',c.total_minor::text,'subtotal_minor',c.subtotal_minor::text,'discount_minor',c.discount_minor::text,'tax_minor',c.tax_minor::text,'tax_bps',c.tax_bps,'tax_label',c.tax_label,'coupon_code',c.coupon_code,'lines',(SELECT jsonb_agg(jsonb_build_object('id',l.id,'product_id',l.product_id,'name',l.name,'quantity',l.quantity,'returned_quantity',l.returned_quantity,'unit_price',l.unit_price::text,'discount_minor',l.discount_minor::text,'tax_minor',l.tax_minor::text,'total_minor',l.total_minor::text)) FROM order_lines l WHERE l.order_id=c.id))) FROM clinic_orders c JOIN clinics cl ON cl.id=c.clinic_id WHERE c.parent_id=o.id),'[]') children FROM checkout_orders o WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 100`,
            [actor],
          )
        ).rows,
    );
  }
  async capture(actor: string, id: string, eventKey: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const o = (
        await db.query(
          'SELECT * FROM checkout_orders WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!o) throw new NotFoundException();
      if (o.status === 'captured') return { status: 'captured' };
      const clinics = (
        await db.query(
          'SELECT clinic_id FROM clinic_orders WHERE parent_id=$1 ORDER BY clinic_id',
          [id],
        )
      ).rows;
      for (const c of clinics) await pricingLock(db, c.clinic_id);
      if (o.status !== 'reserved' || new Date(o.expires_at) <= new Date())
        throw new ConflictException('انتهى حجز الطلب');
      await db.query(
        'INSERT INTO sandbox_captures(order_id,event_key) VALUES($1,$2)',
        [id, eventKey],
      );
      const platform = await entity(db, null);
      const children = (
        await db.query(
          'SELECT * FROM clinic_orders WHERE parent_id=$1 ORDER BY clinic_id',
          [id],
        )
      ).rows;
      for (const c of children) {
        const amount = BigInt(c.total_minor);
        if (amount > 0n) {
          await post(
            db,
            actor,
            platform,
            `capture:${c.id}`,
            'تحصيل اختباري نيابة عن العيادة',
            [
              { account: '1100', debit: amount },
              { account: '2000', credit: amount, partyId: c.clinic_id },
            ],
          );
          await post(
            db,
            actor,
            await entity(db, c.clinic_id),
            `capture:${c.id}`,
            'دفعة عميل اختبارية مؤجلة',
            [
              { account: '1200', debit: amount },
              { account: '2100', credit: amount },
            ],
          );
        }
      }
      await db.query(
        "UPDATE checkout_orders SET status='captured' WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE clinic_orders SET status='confirmed' WHERE parent_id=$1",
        [id],
      );
      await audit(db, actor, 'sandbox.order_captured', null, { orderId: id });
      await emit(db, actor, 'OrderCaptured', id, 2);
      return { status: 'captured' };
    });
  }
  async release(
    db: PoolClient,
    id: string,
    state: 'cancelled' | 'expired',
    actor: string,
  ) {
    const lines = (
      await db.query(
        'SELECT l.* FROM order_lines l JOIN clinic_orders c ON c.id=l.order_id WHERE c.parent_id=$1 ORDER BY l.product_id',
        [id],
      )
    ).rows;
    for (const l of lines)
      await db.query('UPDATE products SET reserved=reserved-$2 WHERE id=$1', [
        l.product_id,
        l.quantity,
      ]);
    await db.query('UPDATE checkout_orders SET status=$2 WHERE id=$1', [
      id,
      state,
    ]);
    await db.query(
      "UPDATE clinic_orders SET status='cancelled' WHERE parent_id=$1",
      [id],
    );
    await emit(db, actor, 'OrderReservationReleased', id, 2);
  }
  async cancel(actor: string, id: string) {
    return transaction(async (db) => {
      const o = (
        await db.query(
          'SELECT * FROM checkout_orders WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!o) throw new NotFoundException();
      if (o.status !== 'reserved')
        throw new ConflictException('الإلغاء هنا للطلب قبل التحصيل فقط');
      await this.release(db, id, 'cancelled', actor);
      await audit(db, actor, 'commerce.order_cancelled', null, { orderId: id });
      return { status: 'cancelled' };
    });
  }
  async fulfill(
    actor: string,
    clinic: string,
    id: string,
    status: 'packed' | 'shipped' | 'delivered',
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.staff(db, actor, clinic);
      const o = (
        await db.query(
          'SELECT * FROM clinic_orders WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (
        !o ||
        { packed: 'confirmed', shipped: 'packed', delivered: 'shipped' }[
          status
        ] !== o.status
      )
        throw new ConflictException('انتقال الطلب غير مسموح');
      const lines = (
        await db.query(
          'SELECT * FROM order_lines WHERE order_id=$1 ORDER BY product_id',
          [id],
        )
      ).rows;
      const eid = await entity(db, clinic);
      if (status === 'shipped') {
        let cost = 0n;
        for (const l of lines) {
          await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [
            l.product_id,
          ]);
          let remaining = l.quantity,
            lineCost = 0n;
          const layers = (
            await db.query(
              "SELECT * FROM inventory_layers WHERE product_id=$1 AND remaining>0 AND NOT quarantined AND (expires_on IS NULL OR expires_on>=(now() AT TIME ZONE 'Asia/Baghdad')::date) ORDER BY created_at,id FOR UPDATE",
              [l.product_id],
            )
          ).rows;
          for (const layer of layers) {
            const qty = Math.min(remaining, layer.remaining);
            if (!qty) break;
            lineCost += BigInt(layer.unit_cost) * BigInt(qty);
            await db.query(
              'UPDATE inventory_layers SET remaining=remaining-$2 WHERE id=$1',
              [layer.id, qty],
            );
            await db.query(
              'INSERT INTO inventory_allocations(line_id,layer_id,quantity,unit_cost) VALUES($1,$2,$3,$4)',
              [l.id, layer.id, qty, layer.unit_cost],
            );
            remaining -= qty;
          }
          if (remaining)
            throw new ConflictException(
              'طبقات تكلفة المخزون غير مطابقة؛ أوقف الشحن للمراجعة',
            );
          await db.query('UPDATE order_lines SET cost_total=$2 WHERE id=$1', [
            l.id,
            lineCost.toString(),
          ]);
          cost += lineCost;
          await db.query(
            'UPDATE products SET on_hand=on_hand-$2,reserved=reserved-$2 WHERE id=$1',
            [l.product_id, l.quantity],
          );
          await db.query(
            "INSERT INTO stock_movements(product_id,clinic_id,quantity,kind,source_key,actor_id) VALUES($1,$2,$3,'sale',$4,$5)",
            [l.product_id, clinic, -l.quantity, `ship:${l.id}`, actor],
          );
        }
        if (cost > 0n)
          await post(db, actor, eid, `ship:${id}`, 'نقل مخزون للشحن', [
            { account: '1350', debit: cost },
            { account: '1300', credit: cost },
          ]);
      }
      if (status === 'delivered') {
        const amount = BigInt(o.total_minor),
          tax = BigInt(o.tax_minor),
          fee = BigInt(o.commission_minor),
          cost = lines.reduce((s, l) => s + BigInt(l.cost_total), 0n);
        if (amount > 0n)
          await post(db, actor, eid, `sale:${id}`, 'إثبات تسليم وبيع اختباري', [
            { account: '2100', debit: amount },
            { account: '4000', credit: amount - tax },
            { account: '2400', credit: tax },
          ]);
        if (cost > 0n)
          await post(db, actor, eid, `cogs:${id}`, 'تكلفة بيع FIFO', [
            { account: '5000', debit: cost },
            { account: '1350', credit: cost },
          ]);
        if (fee > 0n) {
          await post(
            db,
            actor,
            eid,
            `commission:${id}`,
            'عمولة سياسة الاختبار',
            [
              { account: '5100', debit: fee },
              { account: '1200', credit: fee },
            ],
          );
          await post(
            db,
            actor,
            await entity(db, null),
            `commission:${id}`,
            'عمولة منصة اختبارية',
            [
              { account: '2000', debit: fee, partyId: clinic },
              { account: '4000', credit: fee },
            ],
          );
        }
      }
      await db.query('UPDATE clinic_orders SET status=$2 WHERE id=$1', [
        id,
        status,
      ]);
      await db.query(
        'INSERT INTO shipment_events(order_id,clinic_id,status,recorded_by) VALUES($1,$2,$3,$4)',
        [id, clinic, status, actor],
      );
      await audit(db, actor, `commerce.order_${status}`, clinic, {
        orderId: id,
      });
      await emit(
        db,
        actor,
        `Order${status}`,
        id,
        { packed: 1, shipped: 2, delivered: 3 }[status],
        clinic,
      );
      return { status };
    });
  }
  async requestReturn(
    actor: string,
    lineId: string,
    quantity: number,
    reason: string,
  ) {
    return transaction(async (db) => {
      const l = (
        await db.query(
          "SELECT l.* FROM order_lines l JOIN clinic_orders c ON c.id=l.order_id JOIN checkout_orders o ON o.id=c.parent_id WHERE l.id=$1 AND o.user_id=$2 AND c.status='delivered' FOR UPDATE OF l",
          [lineId, actor],
        )
      ).rows[0];
      if (!l || quantity > l.quantity - l.returned_quantity)
        throw new ConflictException('البند غير مؤهل للإرجاع');
      if (
        (
          await db.query(
            "SELECT 1 FROM return_requests WHERE line_id=$1 AND status='pending'",
            [lineId],
          )
        ).rowCount
      )
        throw new ConflictException('للبند طلب إرجاع معلق');
      const r = (
        await db.query(
          'INSERT INTO return_requests(line_id,user_id,quantity,reason) VALUES($1,$2,$3,$4) RETURNING *',
          [lineId, actor, quantity, reason],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.return_requested', l.clinic_id, {
        returnId: r.id,
      });
      return r;
    });
  }
  async approveReturn(
    actor: string,
    clinic: string,
    id: string,
    restock: boolean,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.staff(db, actor, clinic);
      const r = (
        await db.query(
          'SELECT r.* FROM return_requests r JOIN order_lines l ON l.id=r.line_id WHERE r.id=$1 AND l.clinic_id=$2 FOR UPDATE OF r',
          [id, clinic],
        )
      ).rows[0];
      if (!r || r.status !== 'pending')
        throw new ConflictException('المرتجع حسم سابقًا');
      const line0 = (
        await db.query('SELECT * FROM order_lines WHERE id=$1', [r.line_id])
      ).rows[0];
      const o = (
        await db.query('SELECT * FROM clinic_orders WHERE id=$1 FOR UPDATE', [
          line0.order_id,
        ])
      ).rows[0];
      const l = (
        await db.query('SELECT * FROM order_lines WHERE id=$1 FOR UPDATE', [
          r.line_id,
        ])
      ).rows[0];
      if (
        o.status !== 'delivered' ||
        l.returned_quantity + r.quantity > l.quantity
      )
        throw new ConflictException('كمية الإرجاع غير صالحة');
      const oldRefund = BigInt(
        (
          await db.query(
            'SELECT coalesce(sum(floor((unit_price*quantity-discount_minor)::numeric*returned_quantity/quantity)),0)::text total FROM order_lines WHERE order_id=$1',
            [o.id],
          )
        ).rows[0].total,
      );
      const net = quantityRefund(
          BigInt(l.unit_price) * BigInt(l.quantity) - BigInt(l.discount_minor),
          l.quantity,
          l.returned_quantity,
          r.quantity,
        ),
        tax = quantityRefund(
          BigInt(l.tax_minor),
          l.quantity,
          l.returned_quantity,
          r.quantity,
        ),
        amount = net + tax,
        total = BigInt(o.subtotal_minor) - BigInt(o.discount_minor);
      const fee = refundCommission(
        BigInt(o.commission_minor),
        total,
        oldRefund,
        net,
      );
      let skip = l.returned_quantity,
        remaining = r.quantity,
        cost = 0n;
      const allocations = (
        await db.query(
          'SELECT a.*,i.created_at,i.warehouse_id,i.batch_code,i.expires_on::text FROM inventory_allocations a JOIN inventory_layers i ON i.id=a.layer_id WHERE a.line_id=$1 ORDER BY i.created_at,i.id',
          [l.id],
        )
      ).rows;
      for (const a of allocations) {
        const ignored = Math.min(skip, a.quantity);
        skip -= ignored;
        const qty = Math.min(remaining, a.quantity - ignored);
        if (qty > 0) {
          cost += BigInt(qty) * BigInt(a.unit_cost);
          if (restock)
            await db.query(
              'INSERT INTO inventory_layers(product_id,remaining,unit_cost,warehouse_id,batch_code,expires_on) VALUES($1,$2,$3,$4,$5,$6)',
              [
                l.product_id,
                qty,
                a.unit_cost,
                a.warehouse_id,
                a.batch_code,
                a.expires_on,
              ],
            );
          remaining -= qty;
        }
      }
      if (remaining) throw new ConflictException('تكلفة المرتجع غير مطابقة');
      const platformId = await entity(db, null);
      const payable = BigInt(
        (
          await db.query(
            "SELECT coalesce(sum(l.credit-l.debit),0)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.account_code='2000' AND l.party_id=$2 AND j.status='posted'",
            [platformId, clinic],
          )
        ).rows[0].amount,
      );
      const held = BigInt(
        (
          await db.query(
            "SELECT coalesce(sum(amount_minor),0)::text amount FROM sandbox_payouts WHERE kind='clinic' AND party_id=$1 AND status='pending'",
            [clinic],
          )
        ).rows[0].amount,
      );
      if (amount - fee > payable - held)
        throw new ConflictException(
          'تحتاج العيادة تسوية مستحقاتها قبل رد هذا المبلغ؛ لم ينفذ أي رد',
        );
      const eid = await entity(db, clinic);
      if (amount > 0n) {
        await post(db, actor, eid, `return-sale:${id}`, 'إشعار دائن لمرتجع', [
          { account: '4000', debit: net },
          { account: '2400', debit: tax },
          { account: '1200', credit: amount },
        ]);
        await post(
          db,
          actor,
          await entity(db, null),
          `return-payment:${id}`,
          'رد اختبار من التحصيل',
          [
            { account: '2000', debit: amount - fee, partyId: clinic },
            { account: '4000', debit: fee },
            { account: '1100', credit: amount },
          ],
        );
      }
      if (fee > 0n)
        await post(db, actor, eid, `return-fee:${id}`, 'عكس عمولة المرتجع', [
          { account: '1200', debit: fee },
          { account: '5100', credit: fee },
        ]);
      if (restock) {
        await db.query('UPDATE products SET on_hand=on_hand+$2 WHERE id=$1', [
          l.product_id,
          r.quantity,
        ]);
        await db.query(
          "INSERT INTO stock_movements(product_id,clinic_id,quantity,kind,source_key,actor_id) VALUES($1,$2,$3,'return',$4,$5)",
          [l.product_id, clinic, r.quantity, `return:${id}`, actor],
        );
        if (cost > 0n)
          await post(
            db,
            actor,
            eid,
            `return-stock:${id}`,
            'استعادة مخزون مرتجع صالح',
            [
              { account: '1300', debit: cost },
              { account: '5000', credit: cost },
            ],
          );
      }
      await db.query(
        'UPDATE order_lines SET returned_quantity=returned_quantity+$2 WHERE id=$1',
        [l.id, r.quantity],
      );
      await db.query(
        "UPDATE return_requests SET status='approved',reviewed_by=$2 WHERE id=$1",
        [id, actor],
      );
      if (
        !(
          await db.query(
            'SELECT 1 FROM order_lines WHERE order_id=$1 AND returned_quantity<quantity',
            [o.id],
          )
        ).rowCount
      )
        await db.query(
          "UPDATE clinic_orders SET status='returned' WHERE id=$1",
          [o.id],
        );
      await audit(db, actor, 'commerce.return_approved', clinic, {
        returnId: id,
        restock,
      });
      await emit(db, actor, 'ReturnApproved', id, 1, clinic);
      return { status: 'approved', amountMinor: amount.toString() };
    });
  }
}
