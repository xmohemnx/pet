import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { transaction } from '../database.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { CareService } from '../care/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';
@Injectable()
export class RescueService {
  constructor(
    private readonly org: OrganizationService,
    private readonly care: CareService,
  ) {}
  async listings() {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT a.id,a.version,a.title,a.description,a.city,a.requirements,p.name pet_name,p.species,p.breed,a.owner_id FROM adoption_listings a JOIN pets p ON p.id=a.pet_id WHERE a.status='active' ORDER BY a.created_at DESC LIMIT 100",
          )
        ).rows,
    );
  }
  async mine(actor: string) {
    return transaction(async (db) => ({
      listings: (
        await db.query(
          'SELECT * FROM adoption_listings WHERE owner_id=$1 ORDER BY created_at DESC',
          [actor],
        )
      ).rows,
      applications: (
        await db.query(
          'SELECT a.*,l.title FROM adoption_applications a JOIN adoption_listings l ON l.id=a.listing_id WHERE a.user_id=$1 ORDER BY a.created_at DESC',
          [actor],
        )
      ).rows,
      cases: (
        await db.query(
          'SELECT * FROM rescue_cases WHERE user_id=$1 ORDER BY created_at DESC',
          [actor],
        )
      ).rows,
      donations: (
        await db.query(
          'SELECT d.*,d.amount_minor::text,c.name FROM sandbox_donations d JOIN donation_campaigns c ON c.id=d.campaign_id WHERE d.user_id=$1 ORDER BY d.created_at DESC',
          [actor],
        )
      ).rows,
    }));
  }
  async create(
    actor: string,
    i: {
      petId: string;
      title: string;
      description: string;
      city: string;
      requirements: string;
    },
  ) {
    return transaction(async (db) => {
      await this.care.pet(db, actor, i.petId, 'profile', true);
      const r = (
        await db.query(
          'INSERT INTO adoption_listings(owner_id,pet_id,title,description,city,requirements) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [actor, i.petId, i.title, i.description, i.city, i.requirements],
        )
      ).rows[0];
      await audit(db, actor, 'rescue.adoption_submitted', null, {
        listingId: r.id,
      });
      return r;
    });
  }
  async apply(actor: string, id: string, details: string) {
    return transaction(async (db) => {
      const l = (
        await db.query(
          "SELECT * FROM adoption_listings WHERE id=$1 AND status='active' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!l || l.owner_id === actor)
        throw new ConflictException('الإعلان غير متاح للتقديم');
      return (
        await db.query(
          'INSERT INTO adoption_applications(listing_id,user_id,private_details) VALUES($1,$2,$3) RETURNING id,status',
          [id, actor, details],
        )
      ).rows[0];
    });
  }
  async applications(actor: string, id: string) {
    return transaction(async (db) => {
      if (
        !(
          await db.query(
            'SELECT 1 FROM adoption_listings WHERE id=$1 AND owner_id=$2',
            [id, actor],
          )
        ).rowCount
      )
        throw new NotFoundException();
      await audit(db, actor, 'rescue.applications_read', null, {
        listingId: id,
      });
      return (
        await db.query(
          'SELECT a.*,u.display_name FROM adoption_applications a JOIN users u ON u.id=a.user_id WHERE listing_id=$1 ORDER BY created_at',
          [id],
        )
      ).rows;
    });
  }
  async decide(
    actor: string,
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    return transaction(async (db) => {
      const loc = (
        await db.query(
          'SELECT listing_id FROM adoption_applications WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (!loc) throw new NotFoundException();
      const l = (
        await db.query(
          'SELECT * FROM adoption_listings WHERE id=$1 AND owner_id=$2 FOR UPDATE',
          [loc.listing_id, actor],
        )
      ).rows[0];
      if (!l) throw new NotFoundException();
      if (!['active', 'paused'].includes(l.status))
        throw new ConflictException();
      const r = await db.query(
        "UPDATE adoption_applications SET status=$2,reason=$3 WHERE id=$1 AND status='pending' RETURNING id",
        [id, decision, reason],
      );
      if (!r.rowCount) throw new ConflictException();
      if (decision === 'approved')
        await db.query(
          "UPDATE adoption_listings SET status='paused',version=version+1 WHERE id=$1",
          [l.id],
        );
      await audit(db, actor, 'rescue.adoption_decided', null, {
        applicationId: id,
        decision,
      });
      return { status: decision };
    });
  }
  async handover(actor: string, id: string) {
    return transaction(async (db) => {
      const loc = (
        await db.query(
          'SELECT listing_id FROM adoption_applications WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (!loc) throw new NotFoundException();
      const l0 = (
        await db.query('SELECT pet_id FROM adoption_listings WHERE id=$1', [
          loc.listing_id,
        ])
      ).rows[0];
      await db.query('SELECT id FROM pets WHERE id=$1 FOR UPDATE', [l0.pet_id]);
      const l = (
        await db.query(
          'SELECT * FROM adoption_listings WHERE id=$1 FOR UPDATE',
          [loc.listing_id],
        )
      ).rows[0];
      const a = (
        await db.query(
          "SELECT * FROM adoption_applications WHERE id=$1 AND user_id=$2 AND status='approved' FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      const currentOwner = (
        await db.query('SELECT owner_id FROM pets WHERE id=$1', [l.pet_id])
      ).rows[0];
      if (currentOwner.owner_id !== l.owner_id)
        throw new ConflictException(
          'تغير مالك الحيوان؛ لا يمكن إتمام الإعلان السابق',
        );
      if (!a || l.status !== 'paused')
        throw new ConflictException('لا يوجد قبول صالح للتسليم');
      if (
        (
          await db.query(
            "SELECT 1 FROM appointments WHERE pet_id=$1 AND status='confirmed'",
            [l.pet_id],
          )
        ).rowCount
      )
        throw new ConflictException('توجد مواعيد نشطة');
      if (
        (
          await db.query(
            "SELECT 1 FROM boarding_bookings WHERE pet_id=$1 AND status IN ('confirmed','checked_in')",
            [l.pet_id],
          )
        ).rowCount
      )
        throw new ConflictException('توجد إقامة نشطة');
      await db.query(
        "UPDATE pet_transfers SET status='cancelled' WHERE pet_id=$1 AND status='pending'",
        [l.pet_id],
      );
      const t = (
        await db.query(
          "INSERT INTO pet_transfers(pet_id,from_id,to_id,status) VALUES($1,$2,$3,'accepted') RETURNING id",
          [l.pet_id, l.owner_id, actor],
        )
      ).rows[0];
      await db.query(
        'UPDATE pets SET owner_id=$2,version=version+1 WHERE id=$1 AND owner_id=$3',
        [l.pet_id, actor, l.owner_id],
      );
      await db.query(
        'UPDATE pet_guardians SET revoked_at=now() WHERE pet_id=$1',
        [l.pet_id],
      );
      await db.query(
        'UPDATE medical_consents SET revoked_at=now() WHERE pet_id=$1',
        [l.pet_id],
      );
      await db.query(
        'INSERT INTO pet_ownership_history(pet_id,from_id,to_id,transfer_id) VALUES($1,$2,$3,$4)',
        [l.pet_id, l.owner_id, actor, t.id],
      );
      await db.query(
        "UPDATE adoption_applications SET status='completed' WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE adoption_listings SET status='adopted',version=version+1 WHERE id=$1",
        [l.id],
      );
      await audit(db, actor, 'rescue.handover_confirmed', null, {
        listingId: l.id,
        applicationId: id,
      });
      return { status: 'completed' };
    });
  }
  async case(
    actor: string,
    i: {
      kind: string;
      title: string;
      description: string;
      city: string;
      privateLocation: string;
      species?: string;
    },
  ) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          'INSERT INTO rescue_cases(user_id,kind,title,description,city,private_location,species) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status',
          [
            actor,
            i.kind,
            i.title,
            i.description,
            i.city,
            i.privateLocation,
            i.species ?? 'unknown',
          ],
        )
      ).rows[0];
      await audit(db, actor, 'rescue.case_submitted', null, { caseId: r.id });
      return r;
    });
  }
  async publicCases() {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT id,kind,title,description,city,status FROM rescue_cases WHERE status IN ('verified','assigned','in_progress','resolved') ORDER BY created_at DESC LIMIT 100",
          )
        ).rows,
    );
  }
  async queue() {
    return transaction(async (db) => ({
      listings: (
        await db.query(
          "SELECT * FROM adoption_listings WHERE status='pending' LIMIT 100",
        )
      ).rows,
      cases: (
        await db.query(
          "SELECT id,kind,title,description,city,status FROM rescue_cases WHERE status IN ('submitted','verified') ORDER BY created_at LIMIT 100",
        )
      ).rows,
    }));
  }
  async verify(
    actor: string,
    kind: 'listing' | 'case',
    id: string,
    approved: boolean,
  ) {
    return transaction(async (db) => {
      const sql =
        kind === 'listing'
          ? "UPDATE adoption_listings SET status=$2,version=version+1 WHERE id=$1 AND status='pending' RETURNING id"
          : "UPDATE rescue_cases SET status=$2 WHERE id=$1 AND status='submitted' RETURNING id";
      const state =
        kind === 'listing'
          ? approved
            ? 'active'
            : 'removed'
          : approved
            ? 'verified'
            : 'rejected';
      if (!(await db.query(sql, [id, state])).rowCount)
        throw new ConflictException();
      await audit(db, actor, 'rescue.content_reviewed', null, {
        kind,
        resourceId: id,
        approved,
      });
      return { status: state };
    });
  }
  async acceptCase(actor: string, id: string, clinic: string) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const r = await db.query(
        "UPDATE rescue_cases SET status='assigned',clinic_id=$2,assigned_to=$3 WHERE id=$1 AND status='verified' RETURNING id",
        [id, clinic, actor],
      );
      if (!r.rowCount) throw new ConflictException('البلاغ قُبل أو غير متاح');
      await audit(db, actor, 'rescue.case_accepted', clinic, { caseId: id });
      await emit(db, actor, 'RescueCaseAccepted', id, 1, clinic);
      return { status: 'assigned' };
    });
  }
  async assignedCases(actor: string, clinic: string) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      await audit(db, actor, 'rescue.private_location_read', clinic);
      return (
        await db.query(
          'SELECT * FROM rescue_cases WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT 100',
          [clinic],
        )
      ).rows;
    });
  }
  async caseStatus(
    actor: string,
    id: string,
    status: 'in_progress' | 'resolved',
  ) {
    return transaction(async (db) => {
      const c = (await db.query('SELECT * FROM rescue_cases WHERE id=$1', [id]))
        .rows[0];
      if (!c || !c.clinic_id) throw new NotFoundException();
      await this.org.membership(actor, c.clinic_id, 'clinic_admin', db);
      const previous = status === 'in_progress' ? 'assigned' : 'in_progress';
      if (
        !(
          await db.query(
            'UPDATE rescue_cases SET status=$2 WHERE id=$1 AND status=$3 RETURNING id',
            [id, status, previous],
          )
        ).rowCount
      )
        throw new ConflictException();
      await audit(db, actor, 'rescue.case_transition', c.clinic_id, {
        caseId: id,
        status,
      });
      return { status };
    });
  }
  async campaigns() {
    return transaction(
      async (db) =>
        (
          await db.query(
            "SELECT c.*,c.goal_minor::text,(SELECT count(*)::int FROM sandbox_donations all_d WHERE all_d.campaign_id=c.id) donation_count,coalesce((SELECT sum(d.amount_minor)::text FROM sandbox_donations d WHERE d.campaign_id=c.id AND d.status='captured'),'0') collected_minor FROM donation_campaigns c ORDER BY c.created_at DESC LIMIT 100",
          )
        ).rows,
    );
  }
  async campaign(
    actor: string,
    i: {
      name: string;
      purpose: string;
      beneficiary: string;
      goalMinor: string;
    },
  ) {
    sandbox();
    return transaction(async (db) => {
      const r = (
        await db.query(
          'INSERT INTO donation_campaigns(name,purpose,beneficiary,goal_minor,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [i.name, i.purpose, i.beneficiary, i.goalMinor, actor],
        )
      ).rows[0];
      await audit(db, actor, 'sandbox.campaign_created', null, {
        campaignId: r.id,
      });
      return r;
    });
  }
  async donate(
    actor: string,
    id: string,
    amount: string,
    key: string,
    anonymous: boolean,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const old = (
        await db.query(
          'SELECT * FROM sandbox_donations WHERE user_id=$1 AND idempotency_key=$2',
          [actor, key],
        )
      ).rows[0];
      if (old) {
        if (
          old.campaign_id !== id ||
          old.amount_minor !== amount ||
          old.anonymous !== anonymous
        )
          throw new ConflictException();
        return old;
      }
      if (
        !(
          await db.query(
            "SELECT 1 FROM donation_campaigns WHERE id=$1 AND status='active' FOR UPDATE",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('الحملة مغلقة');
      const d = (
        await db.query(
          'INSERT INTO sandbox_donations(campaign_id,user_id,amount_minor,idempotency_key,anonymous) VALUES($1,$2,$3,$4,$5) RETURNING id,status',
          [id, actor, amount, key, anonymous],
        )
      ).rows[0];
      await post(
        db,
        actor,
        await entity(db, null),
        `donation:${d.id}`,
        'تحصيل تبرع اختباري مقيد؛ ليس إيرادًا',
        [
          { account: '1100', debit: BigInt(amount) },
          { account: '2300', credit: BigInt(amount), partyId: id },
        ],
      );
      await audit(db, actor, 'sandbox.donation_captured', null, {
        donationId: d.id,
      });
      return d;
    });
  }
  async refund(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const d = (
        await db.query(
          'SELECT * FROM sandbox_donations WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, actor],
        )
      ).rows[0];
      if (!d) throw new NotFoundException();
      if (d.status !== 'captured') throw new ConflictException('رد سابق');
      const eid = await entity(db, null);
      const available = BigInt(
        (
          await db.query(
            "SELECT coalesce(sum(l.credit-l.debit),0)::text amount FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.account_code='2300' AND l.party_id=$2 AND j.status='posted'",
            [eid, d.campaign_id],
          )
        ).rows[0].amount,
      );
      const held = BigInt(
        (
          await db.query(
            "SELECT coalesce(sum(amount_minor),0)::text amount FROM sandbox_payouts WHERE kind='fund' AND party_id=$1 AND status='pending'",
            [d.campaign_id],
          )
        ).rows[0].amount,
      );
      if (available - held < BigInt(d.amount_minor))
        throw new ConflictException(
          'يتطلب رد مبلغ مصروف تسوية مستقلة؛ لم ينفذ رد',
        );
      await post(
        db,
        actor,
        await entity(db, null),
        `donation-refund:${id}`,
        'عكس تبرع اختباري',
        [
          {
            account: '2300',
            debit: BigInt(d.amount_minor),
            partyId: d.campaign_id,
          },
          { account: '1100', credit: BigInt(d.amount_minor) },
        ],
      );
      await db.query(
        "UPDATE sandbox_donations SET status='refunded' WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'sandbox.donation_refunded', null, {
        donationId: id,
      });
      return { status: 'refunded' };
    });
  }
}
