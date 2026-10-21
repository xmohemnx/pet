import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { transaction } from '../database.js';
import { CareService } from './service.js';
import { audit } from '../organizations/service.js';
@Injectable()
export class PetSafetyService {
  constructor(private readonly care: CareService) {}
  async list(actor: string, petId: string) {
    return transaction(async (db) => {
      await this.care.pet(db, actor, petId, 'profile', true);
      return (
        await db.query(
          'SELECT id,contact_name,contact_phone,message,expires_at,revoked_at,created_at FROM pet_safety_cards WHERE pet_id=$1 AND owner_id=$2 ORDER BY (revoked_at IS NULL AND expires_at>now()) DESC,created_at DESC LIMIT 20',
          [petId, actor],
        )
      ).rows;
    });
  }
  async create(
    actor: string,
    petId: string,
    i: {
      contactName: string;
      contactPhone: string;
      message: string;
      expiresAt: string;
    },
  ) {
    return transaction(async (db) => {
      const pet = await this.care.pet(db, actor, petId, 'profile', true);
      if (pet.archived_at) throw new BadRequestException('الحيوان مؤرشف');
      if (
        Date.parse(i.expiresAt) <= Date.now() ||
        Date.parse(i.expiresAt) > Date.now() + 365 * 86400000
      )
        throw new BadRequestException('اختر صلاحية مستقبلية ضمن سنة');
      if (
        (
          await db.query(
            'SELECT 1 FROM pet_safety_cards WHERE pet_id=$1 AND owner_id=$2 AND revoked_at IS NULL AND expires_at>now() LIMIT 10',
            [petId, actor],
          )
        ).rows.length >= 10
      )
        throw new BadRequestException(
          'الحد عشر بطاقات نشطة؛ ألغ القديمة أولًا',
        );
      const token = randomBytes(32).toString('base64url');
      const row = (
        await db.query(
          'INSERT INTO pet_safety_cards(pet_id,owner_id,token_hash,contact_name,contact_phone,message,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            petId,
            actor,
            createHash('sha256').update(token).digest('hex'),
            i.contactName,
            i.contactPhone,
            i.message,
            i.expiresAt,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'pet.safety_card_created', null, {
        petId,
        cardId: row.id,
      });
      return { id: row.id, token };
    });
  }
  async revoke(actor: string, petId: string, id: string) {
    return transaction(async (db) => {
      await this.care.pet(db, actor, petId, 'profile', true);
      if (
        !(
          await db.query(
            'UPDATE pet_safety_cards SET revoked_at=now() WHERE id=$1 AND pet_id=$2 AND owner_id=$3 RETURNING id',
            [id, petId, actor],
          )
        ).rowCount
      )
        throw new NotFoundException();
      await audit(db, actor, 'pet.safety_card_revoked', null, {
        petId,
        cardId: id,
      });
      return { status: 'revoked' };
    });
  }
  async publicCard(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException();
    return transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT p.name pet_name,p.species,c.contact_name,c.contact_phone,c.message,c.expires_at FROM pet_safety_cards c JOIN pets p ON p.id=c.pet_id AND p.owner_id=c.owner_id AND p.archived_at IS NULL WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>now()',
          [createHash('sha256').update(token).digest('hex')],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('بطاقة السلامة غير متاحة');
      return row;
    });
  }
  async passport(actor: string, petId: string) {
    return transaction(async (db) => {
      const p = await this.care.pet(db, actor, petId, 'medical', true);
      await audit(db, actor, 'medical.passport_exported', null, { petId });
      const visits = (
        await db.query(
          "SELECT e.id,e.signed_at,u.name doctor_name,c.name clinic_name,e.content->'vaccines' vaccines,e.content->'prescriptions' prescriptions,coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'note',a.note,'signed_at',a.signed_at) ORDER BY a.signed_at) FROM encounter_addenda a WHERE a.encounter_id=e.id),'[]'::jsonb) addenda FROM encounters e JOIN auth_users u ON u.id=e.doctor_id JOIN clinics c ON c.id=e.clinic_id WHERE e.pet_id=$1 AND e.signed_at IS NOT NULL ORDER BY e.signed_at DESC LIMIT 200",
          [petId],
        )
      ).rows;
      return {
        pet: {
          id: p.id,
          name: p.name,
          species: p.species,
          breed: p.breed,
          birth_date: p.birth_date,
          microchip: p.microchip,
          sex: p.sex,
        },
        visits,
        exportedAt: new Date().toISOString(),
      };
    });
  }
  async calendar(actor: string, month: string) {
    return transaction(async (db) => {
      const access =
        "(p.owner_id=$1 OR EXISTS(SELECT 1 FROM pet_guardians g WHERE g.pet_id=p.id AND g.user_id=$1 AND g.revoked_at IS NULL AND g.scopes @> ARRAY['medical']))";
      const tasks = (
        await db.query(
          `SELECT t.id,t.pet_id,p.name pet_name,t.title,t.due_at,t.expires_at,CASE WHEN t.status='planned' AND t.expires_at<=now() THEN 'expired' WHEN t.status='planned' AND t.due_at<=now() THEN 'due' ELSE t.status END status,t.created_by,t.encounter_id FROM care_tasks t JOIN pets p ON p.id=t.pet_id WHERE ${access} AND t.due_at>=($2::date::timestamp AT TIME ZONE 'Asia/Baghdad') AND t.due_at<(($2::date+interval '1 month')::timestamp AT TIME ZONE 'Asia/Baghdad') ORDER BY t.due_at LIMIT 500`,
          [actor, month + '-01'],
        )
      ).rows;
      const appointments = (
        await db.query(
          `SELECT a.id,a.pet_id,p.name pet_name,a.starts_at,a.ends_at,a.status,a.attendance_state,c.name clinic_name,u.name doctor_name FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clinics c ON c.id=a.clinic_id JOIN auth_users u ON u.id=a.doctor_id WHERE (p.owner_id=$1 OR EXISTS(SELECT 1 FROM pet_guardians g WHERE g.pet_id=p.id AND g.user_id=$1 AND g.revoked_at IS NULL AND g.scopes && ARRAY['medical','booking'])) AND a.starts_at>=($2::date::timestamp AT TIME ZONE 'Asia/Baghdad') AND a.starts_at<(($2::date+interval '1 month')::timestamp AT TIME ZONE 'Asia/Baghdad') ORDER BY a.starts_at LIMIT 500`,
          [actor, month + '-01'],
        )
      ).rows;
      return { tasks, appointments };
    });
  }
}
