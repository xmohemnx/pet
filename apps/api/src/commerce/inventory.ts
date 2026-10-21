import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { transaction } from '../database.js';
import { CommerceService } from './service.js';
import { FinanceService, sandbox, entity, post } from '../finance/ledger.js';
import { audit, emit } from '../organizations/service.js';
const hash = (i: unknown) =>
  createHash('sha256').update(JSON.stringify(i)).digest('hex');
export interface ReceiptInput {
  idempotencyKey: string;
  quantity: number;
  warehouseId: string;
  batchCode: string;
  expiresOn: string | null;
}
@Injectable()
export class InventoryService {
  constructor(
    private readonly commerce: CommerceService,
    private readonly finance: FinanceService,
  ) {}
  async dashboard(actor: string, clinic: string) {
    return transaction(async (db) => {
      try {
        await this.commerce.staff(db, actor, clinic, 'stock');
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
        await this.finance.authorized(db, actor, clinic);
      }
      await audit(db, actor, 'inventory.read', clinic);
      return {
        warehouses: (
          await db.query(
            'SELECT * FROM warehouses WHERE clinic_id=$1 ORDER BY is_primary DESC,name',
            [clinic],
          )
        ).rows,
        purchases: (
          await db.query(
            'SELECT po.id,po.quantity,po.received_quantity,po.unit_cost::text,po.status,p.name product_name,v.name vendor_name FROM purchase_orders po JOIN products p ON p.id=po.product_id JOIN vendors v ON v.id=po.vendor_id WHERE po.clinic_id=$1 ORDER BY po.created_at DESC LIMIT 200',
            [clinic],
          )
        ).rows,
        products: (
          await db.query(
            'SELECT id,name,sku,on_hand,reserved,eligible_stock(id) eligible,available_stock(id) available FROM products WHERE clinic_id=$1 ORDER BY name LIMIT 500',
            [clinic],
          )
        ).rows,
        layers: (
          await db.query(
            "SELECT l.*,l.unit_cost::text,p.name product_name,w.name warehouse_name,(l.expires_on IS NOT NULL AND l.expires_on<(now() AT TIME ZONE 'Asia/Baghdad')::date) expired FROM inventory_layers l JOIN products p ON p.id=l.product_id JOIN warehouses w ON w.id=l.warehouse_id WHERE l.clinic_id=$1 AND l.remaining>0 ORDER BY l.expires_on NULLS LAST,l.created_at,l.id LIMIT 500",
            [clinic],
          )
        ).rows,
        requests: (
          await db.query(
            'SELECT r.*,p.name product_name FROM inventory_requests r JOIN inventory_layers l ON l.id=r.layer_id JOIN products p ON p.id=l.product_id WHERE r.clinic_id=$1 ORDER BY r.created_at DESC LIMIT 100',
            [clinic],
          )
        ).rows,
        receipts: (
          await db.query(
            'SELECT r.*,p.name product_name FROM purchase_receipts r JOIN purchase_orders po ON po.id=r.po_id JOIN products p ON p.id=po.product_id WHERE r.clinic_id=$1 ORDER BY r.created_at DESC LIMIT 100',
            [clinic],
          )
        ).rows,
        transfers: (
          await db.query(
            'SELECT * FROM inventory_transfers WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT 100',
            [clinic],
          )
        ).rows,
      };
    });
  }
  async warehouse(
    actor: string,
    clinic: string,
    name: string,
    branchId?: string,
  ) {
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      if (
        branchId &&
        !(
          await db.query(
            'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2',
            [branchId, clinic],
          )
        ).rowCount
      )
        throw new BadRequestException('الفرع ليس تابعاً للعيادة');
      const r = (
        await db.query(
          'INSERT INTO warehouses(clinic_id,name,branch_id) VALUES($1,$2,$3) RETURNING *',
          [clinic, name, branchId ?? null],
        )
      ).rows[0];
      await audit(db, actor, 'inventory.warehouse_created', clinic, {
        warehouseId: r.id,
      });
      return r;
    });
  }
  async receive(actor: string, clinic: string, poId: string, i: ReceiptInput) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.commerce.staff(db, actor, clinic, 'stock');
      const po = (
        await db.query(
          'SELECT * FROM purchase_orders WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [poId, clinic],
        )
      ).rows[0];
      if (!po) throw new NotFoundException();
      const fingerprint = hash(i),
        old = (
          await db.query(
            'SELECT * FROM purchase_receipts WHERE po_id=$1 AND idempotency_key=$2',
            [poId, i.idempotencyKey],
          )
        ).rows[0];
      if (old) {
        if (old.request_hash !== fingerprint)
          throw new ConflictException('المفتاح مستخدم لمحتوى آخر');
        return { id: old.id, quantity: old.quantity };
      }
      if (
        po.status !== 'ordered' ||
        po.received_quantity + i.quantity > po.quantity
      )
        throw new ConflictException('الكمية تتجاوز المتبقي من أمر الشراء');
      if (
        !(
          await db.query(
            'SELECT 1 FROM warehouses WHERE id=$1 AND clinic_id=$2',
            [i.warehouseId, clinic],
          )
        ).rowCount
      )
        throw new NotFoundException();
      await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [
        po.product_id,
      ]);
      const layer = (
        await db.query(
          'INSERT INTO inventory_layers(product_id,warehouse_id,batch_code,expires_on,remaining,unit_cost) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            po.product_id,
            i.warehouseId,
            i.batchCode,
            i.expiresOn,
            i.quantity,
            po.unit_cost,
          ],
        )
      ).rows[0];
      const receipt = (
        await db.query(
          'INSERT INTO purchase_receipts(po_id,clinic_id,quantity,warehouse_id,layer_id,idempotency_key,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            poId,
            clinic,
            i.quantity,
            i.warehouseId,
            layer.id,
            i.idempotencyKey,
            fingerprint,
            actor,
          ],
        )
      ).rows[0];
      await db.query(
        'UPDATE products SET on_hand=on_hand+$2,version=version+1 WHERE id=$1',
        [po.product_id, i.quantity],
      );
      await db.query(
        "UPDATE purchase_orders SET received_quantity=received_quantity+$2,status=CASE WHEN received_quantity+$2=quantity THEN 'received' ELSE 'ordered' END WHERE id=$1",
        [poId, i.quantity],
      );
      await db.query(
        "INSERT INTO stock_movements(product_id,clinic_id,quantity,kind,source_key,actor_id) VALUES($1,$2,$3,'receipt',$4,$5)",
        [po.product_id, clinic, i.quantity, `grn:${receipt.id}`, actor],
      );
      const amount = BigInt(po.unit_cost) * BigInt(i.quantity);
      if (amount > 0n)
        await post(
          db,
          actor,
          await entity(db, clinic),
          `grn:${receipt.id}`,
          'استلام جزئي موثق',
          [
            { account: '1300', debit: amount },
            { account: '2050', credit: amount },
          ],
        );
      await audit(db, actor, 'inventory.partial_receipt', clinic, {
        receiptId: receipt.id,
        purchaseId: poId,
      });
      await emit(db, actor, 'InventoryReceived', receipt.id, 1);
      return { id: receipt.id, quantity: i.quantity };
    });
  }
  async quarantine(
    actor: string,
    clinic: string,
    id: string,
    quarantined: boolean,
    reason: string,
  ) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.commerce.staff(db, actor, clinic, 'stock');
      const info = (
        await db.query(
          'SELECT product_id FROM inventory_layers WHERE id=$1 AND clinic_id=$2',
          [id, clinic],
        )
      ).rows[0];
      if (!info) throw new NotFoundException();
      const p = (
        await db.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [
          info.product_id,
        ])
      ).rows[0];
      const l = (
        await db.query(
          'SELECT *,expires_on::text FROM inventory_layers WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (quarantined && !l.quarantined) {
        const eligible = (await db.query('SELECT eligible_stock($1) n', [p.id]))
          .rows[0].n;
        const sellable =
          !l.expires_on ||
          String(l.expires_on).slice(0, 10) >=
            (
              await db.query(
                "SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text business_day",
              )
            ).rows[0].business_day;
        if (eligible - (sellable ? l.remaining : 0) < p.reserved)
          throw new ConflictException(
            'الدفعة تغطي حجوزات قائمة؛ عالج الطلبات أولاً',
          );
      }
      await db.query('UPDATE inventory_layers SET quarantined=$2 WHERE id=$1', [
        id,
        quarantined,
      ]);
      await audit(db, actor, 'inventory.quarantine_changed', clinic, {
        layerId: id,
        quarantined,
        reason,
      });
      return { quarantined };
    });
  }
  async transfer(
    actor: string,
    clinic: string,
    i: {
      layerId: string;
      warehouseId: string;
      quantity: number;
      idempotencyKey: string;
    },
  ) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.commerce.staff(db, actor, clinic, 'stock');
      const fingerprint = hash(i),
        old = (
          await db.query(
            'SELECT * FROM inventory_transfers WHERE clinic_id=$1 AND created_by=$2 AND idempotency_key=$3',
            [clinic, actor, i.idempotencyKey],
          )
        ).rows[0];
      if (old) {
        if (old.request_hash !== fingerprint)
          throw new ConflictException('المفتاح مستخدم');
        return old;
      }
      const info = (
        await db.query(
          'SELECT product_id FROM inventory_layers WHERE id=$1 AND clinic_id=$2',
          [i.layerId, clinic],
        )
      ).rows[0];
      if (!info) throw new NotFoundException();
      await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [
        info.product_id,
      ]);
      const l = (
        await db.query(
          'SELECT *,expires_on::text FROM inventory_layers WHERE id=$1 FOR UPDATE',
          [i.layerId],
        )
      ).rows[0];
      if (l.remaining < i.quantity || l.warehouse_id === i.warehouseId)
        throw new ConflictException('كمية أو وجهة غير صالحة');
      if (
        !(
          await db.query(
            'SELECT 1 FROM warehouses WHERE id=$1 AND clinic_id=$2',
            [i.warehouseId, clinic],
          )
        ).rowCount
      )
        throw new NotFoundException();
      const target = (
        await db.query(
          'INSERT INTO inventory_layers(product_id,warehouse_id,remaining,unit_cost,created_at,batch_code,expires_on,quarantined) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            l.product_id,
            i.warehouseId,
            i.quantity,
            l.unit_cost,
            l.created_at,
            l.batch_code,
            l.expires_on,
            l.quarantined,
          ],
        )
      ).rows[0];
      await db.query(
        'UPDATE inventory_layers SET remaining=remaining-$2 WHERE id=$1',
        [l.id, i.quantity],
      );
      const r = (
        await db.query(
          'INSERT INTO inventory_transfers(clinic_id,source_layer,target_layer,quantity,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            clinic,
            l.id,
            target.id,
            i.quantity,
            actor,
            i.idempotencyKey,
            fingerprint,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'inventory.transferred', clinic, {
        transferId: r.id,
      });
      await emit(db, actor, 'InventoryTransferred', r.id, 1);
      return r;
    });
  }
  async requestWriteoff(
    actor: string,
    clinic: string,
    i: {
      layerId: string;
      quantity: number;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      await this.commerce.staff(db, actor, clinic, 'stock');
      const fingerprint = hash(i),
        old = (
          await db.query(
            'SELECT * FROM inventory_requests WHERE clinic_id=$1 AND created_by=$2 AND idempotency_key=$3',
            [clinic, actor, i.idempotencyKey],
          )
        ).rows[0];
      if (old) {
        if (old.request_hash !== fingerprint)
          throw new ConflictException('المفتاح مستخدم');
        return old;
      }
      if (
        !(
          await db.query(
            'SELECT 1 FROM inventory_layers WHERE id=$1 AND clinic_id=$2 AND remaining>=$3',
            [i.layerId, clinic, i.quantity],
          )
        ).rowCount
      )
        throw new ConflictException('الدفعة غير متاحة بهذه الكمية');
      const r = (
        await db.query(
          'INSERT INTO inventory_requests(clinic_id,layer_id,quantity,reason,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            clinic,
            i.layerId,
            i.quantity,
            i.reason,
            actor,
            i.idempotencyKey,
            fingerprint,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'inventory.writeoff_requested', clinic, {
        requestId: r.id,
      });
      return r;
    });
  }
  async decide(
    actor: string,
    clinic: string,
    id: string,
    decision: 'approved' | 'rejected',
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const m = await this.finance.authorized(db, actor, clinic);
      if (
        !m.capabilities.some((c: string) =>
          ['cashier', 'clinic_admin'].includes(c),
        )
      )
        throw new ForbiddenException('صلاحية اعتماد مطلوبة');
      const r = (
        await db.query(
          'SELECT * FROM inventory_requests WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      if (r.created_by === actor)
        throw new ForbiddenException('المعد لا يعتمد طلبه');
      if (r.status === decision) return { status: r.status };
      if (r.status !== 'pending')
        throw new ConflictException('حسم الطلب سابقاً');
      if (decision === 'approved') {
        const info = (
          await db.query(
            'SELECT product_id FROM inventory_layers WHERE id=$1',
            [r.layer_id],
          )
        ).rows[0];
        const p = (
          await db.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [
            info.product_id,
          ])
        ).rows[0];
        const l = (
          await db.query(
            'SELECT *,expires_on::text FROM inventory_layers WHERE id=$1 FOR UPDATE',
            [r.layer_id],
          )
        ).rows[0];
        if (l.remaining < r.quantity || p.on_hand - r.quantity < p.reserved)
          throw new ConflictException('لا تكفي الكمية غير المحجوزة');
        const n = (await db.query('SELECT eligible_stock($1) n', [p.id]))
          .rows[0].n;
        const day = (
          await db.query(
            "SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date::text business_day",
          )
        ).rows[0].business_day;
        if (
          !l.quarantined &&
          (!l.expires_on || l.expires_on >= day) &&
          n - r.quantity < p.reserved
        )
          throw new ConflictException('الكمية محجوزة لطلبات');
        await db.query(
          'UPDATE inventory_layers SET remaining=remaining-$2 WHERE id=$1',
          [l.id, r.quantity],
        );
        await db.query(
          'UPDATE products SET on_hand=on_hand-$2,version=version+1 WHERE id=$1',
          [p.id, r.quantity],
        );
        await db.query(
          "INSERT INTO stock_movements(product_id,clinic_id,quantity,kind,source_key,actor_id) VALUES($1,$2,$3,'adjustment',$4,$5)",
          [p.id, clinic, -r.quantity, `writeoff:${id}`, actor],
        );
        const amount = BigInt(l.unit_cost) * BigInt(r.quantity);
        if (amount > 0n)
          await post(
            db,
            r.created_by,
            await entity(db, clinic),
            `writeoff:${id}`,
            'إتلاف مخزون معتمد',
            [
              { account: '5200', debit: amount },
              { account: '1300', credit: amount },
            ],
            { approvedBy: actor },
          );
      }
      await db.query(
        'UPDATE inventory_requests SET status=$2,approved_by=$3 WHERE id=$1',
        [id, decision, actor],
      );
      await audit(db, actor, 'inventory.writeoff_decided', clinic, {
        requestId: id,
        decision,
      });
      await emit(db, actor, 'InventoryWriteoffDecided', id, 1);
      return { status: decision };
    });
  }
}
