import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { CommerceService } from './service.js';
import { audit } from '../organizations/service.js';
export interface AddressInput {
  label: string;
  contactName: string;
  phone: string;
  province: string;
  city: string;
  area: string;
  street: string;
  building: string;
  landmark: string;
}
@Injectable()
export class DeliveryService {
  constructor(private readonly commerce: CommerceService) {}
  async addresses(actor: string) {
    return transaction(
      async (db) =>
        (
          await db.query(
            'SELECT id,label,contact_name,phone,province,city,area,street,building,landmark,version FROM delivery_addresses WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
            [actor],
          )
        ).rows,
    );
  }
  async save(actor: string, i: AddressInput, id?: string, version?: number) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `addresses:${actor}`,
      ]);
      const values = [
        actor,
        i.label,
        i.contactName,
        i.phone,
        i.province,
        i.city,
        i.area,
        i.street,
        i.building,
        i.landmark,
      ];
      let row;
      if (id) {
        const old = (
          await db.query(
            'SELECT version FROM delivery_addresses WHERE id=$1 AND user_id=$2 FOR UPDATE',
            [id, actor],
          )
        ).rows[0];
        if (!old) throw new NotFoundException();
        if (old.version !== version)
          throw new ConflictException('تغير العنوان؛ حدّث الصفحة');
        row = (
          await db.query(
            'UPDATE delivery_addresses SET label=$2,contact_name=$3,phone=$4,province=$5,city=$6,area=$7,street=$8,building=$9,landmark=$10,version=version+1 WHERE user_id=$1 AND id=$11 RETURNING id,version',
            [...values, id],
          )
        ).rows[0];
      } else {
        if (
          (
            await db.query(
              'SELECT count(*)::int n FROM delivery_addresses WHERE user_id=$1',
              [actor],
            )
          ).rows[0].n >= 20
        )
          throw new BadRequestException('الحد عشرون عنواناً');
        row = (
          await db.query(
            'INSERT INTO delivery_addresses(user_id,label,contact_name,phone,province,city,area,street,building,landmark) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,version',
            values,
          )
        ).rows[0];
      }
      await audit(db, actor, 'commerce.delivery_address_saved');
      return row;
    });
  }
  async remove(actor: string, id: string) {
    return transaction(async (db) => {
      if (
        !(
          await db.query(
            'DELETE FROM delivery_addresses WHERE id=$1 AND user_id=$2',
            [id, actor],
          )
        ).rowCount
      )
        throw new NotFoundException();
      await audit(db, actor, 'commerce.delivery_address_deleted');
      return { deleted: true };
    });
  }
  async tracking(
    actor: string,
    clinic: string,
    id: string,
    i: { carrier: string; trackingCode: string; version: number },
  ) {
    return transaction(async (db) => {
      await this.commerce.staff(db, actor, clinic);
      const o = (
        await db.query(
          'SELECT status FROM clinic_orders WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [id, clinic],
        )
      ).rows[0];
      if (!o) throw new NotFoundException();
      if (!['confirmed', 'packed', 'shipped', 'delivered'].includes(o.status))
        throw new ConflictException('التتبع لطلب مؤكد');
      const previous = (
        await db.query('SELECT version FROM shipments WHERE order_id=$1', [id])
      ).rows[0];
      if ((previous?.version ?? 0) !== i.version)
        throw new ConflictException('تغير التتبع؛ حدّث الصفحة');
      const r = (
        await db.query(
          'INSERT INTO shipments(order_id,clinic_id,carrier,tracking_code) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET carrier=$3,tracking_code=$4,version=shipments.version+1,updated_at=now() RETURNING version',
          [id, clinic, i.carrier, i.trackingCode],
        )
      ).rows[0];
      await audit(db, actor, 'commerce.tracking_updated', clinic, {
        orderId: id,
      });
      return r;
    });
  }
}
