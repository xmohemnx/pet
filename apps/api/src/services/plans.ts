import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { usageRecognition } from '../../../../packages/contracts/src/index.js';
import { transaction } from '../database.js';
import { OrganizationService, audit, emit } from '../organizations/service.js';
import { CareService } from '../care/service.js';
import { entity, post, sandbox } from '../finance/ledger.js';

export const planEntitlementsSql = `(SELECT jsonb_agg(jsonb_build_object('service_id',e.service_id,'service_name',cs.name,'uses',e.uses) ORDER BY e.service_id) FROM care_plan_entitlements e JOIN clinic_services cs ON cs.id=e.service_id WHERE e.plan_id=p.id)`;
export const subscriptionEntitlementsSql = `(SELECT jsonb_agg(jsonb_build_object('service_id',e.service_id,'service_name',e.service_name,'uses',e.uses,'used',(SELECT count(*)::int FROM entitlement_usage u WHERE u.subscription_id=s.id AND u.service_id=e.service_id)) ORDER BY e.service_id) FROM care_subscription_entitlements e WHERE e.subscription_id=s.id)`;
export const subscriptionStateSql = `CASE WHEN s.status<>'active' THEN s.status WHEN s.expires_at<=clock_timestamp() THEN 'expired' WHEN s.uses_used>=s.uses_total THEN 'exhausted' WHEN s.paused_until>clock_timestamp() THEN 'paused' WHEN s.available_at>clock_timestamp() THEN 'waiting' ELSE 'active' END`;
export interface PlanInput {
  name: string;
  category: string;
  priceMinor: string;
  validDays: number;
  branchId: string | null;
  waitingDays: number;
  maxPauseDays: number;
  entitlements: { serviceId: string; uses: number }[];
}
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
@Injectable()
export class CarePlansService {
  constructor(
    private readonly org: OrganizationService,
    private readonly care: CareService,
  ) {}
  create(actor: string, clinic: string, i: PlanInput) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const ids = i.entitlements.map((e) => e.serviceId);
      if (
        new Set(ids).size !== ids.length ||
        i.entitlements.reduce((n, e) => n + e.uses, 0) > 100 ||
        i.waitingDays >= i.validDays
      )
        throw new BadRequestException(
          'خدمات فريدة، مئة استخدام كحد أقصى وانتظار أقل من الصلاحية',
        );
      if (
        i.branchId &&
        !(
          await db.query(
            'SELECT 1 FROM clinic_branches WHERE id=$1 AND clinic_id=$2 FOR SHARE',
            [i.branchId, clinic],
          )
        ).rowCount
      )
        throw new NotFoundException('الفرع غير متاح');
      if (
        (
          await db.query(
            'SELECT id FROM clinic_services WHERE id=ANY($1::uuid[]) AND clinic_id=$2 AND active ORDER BY id FOR SHARE',
            [ids, clinic],
          )
        ).rowCount !== ids.length
      )
        throw new NotFoundException('الخدمة غير متاحة في العيادة');
      const p = (
        await db.query(
          'INSERT INTO care_plans(clinic_id,service_id,name,price_minor,uses,valid_days,category,branch_id,waiting_days,max_pause_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *,price_minor::text',
          [
            clinic,
            ids[0],
            i.name,
            i.priceMinor,
            i.entitlements.reduce((n, e) => n + e.uses, 0),
            i.validDays,
            i.category,
            i.branchId,
            i.waitingDays,
            i.maxPauseDays,
          ],
        )
      ).rows[0];
      for (const e of i.entitlements)
        await db.query(
          'INSERT INTO care_plan_entitlements(plan_id,clinic_id,service_id,uses) VALUES($1,$2,$3,$4)',
          [p.id, clinic, e.serviceId, e.uses],
        );
      await audit(db, actor, 'services.plan_created', clinic, { planId: p.id });
      await emit(db, actor, 'CarePlanCreated', p.id, 1, clinic);
      return p;
    });
  }
  availability(
    actor: string,
    clinic: string,
    id: string,
    version: number,
    active: boolean,
  ) {
    return transaction(async (db) => {
      await this.org.membership(actor, clinic, 'clinic_admin', db);
      const p = (
        await db.query(
          'UPDATE care_plans SET active=$4,version=version+1 WHERE id=$1 AND clinic_id=$2 AND version=$3 RETURNING id,active,version',
          [id, clinic, version, active],
        )
      ).rows[0];
      if (!p) throw new ConflictException('حدّث الباقات قبل تغيير الإتاحة');
      await audit(db, actor, 'services.plan_availability', clinic, {
        planId: id,
        active,
      });
      await emit(
        db,
        actor,
        'CarePlanAvailabilityChanged',
        id,
        p.version,
        clinic,
      );
      return p;
    });
  }
  async owner(db: PoolClient, actor: string, id: string) {
    const s = (
      await db.query(
        `SELECT s.*,clock_timestamp() db_now,${subscriptionStateSql} state FROM care_subscriptions s WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE OF s`,
        [id, actor],
      )
    ).rows[0];
    if (!s) throw new NotFoundException();
    const pet = await this.care.pet(db, actor, s.pet_id, 'profile', true);
    if (pet.archived_at) throw new ConflictException('الحيوان مؤرشف');
    return s;
  }
  async book(
    db: PoolClient,
    actor: string,
    planId: string,
    petId: string,
    key: string,
    predecessor: string | null,
    operation: 'buy' | 'renew' | 'upgrade',
    expectedPrice?: string,
  ) {
    const old = (
      await db.query(
        'SELECT *,price_minor::text FROM care_subscriptions WHERE user_id=$1 AND idempotency_key=$2',
        [actor, key],
      )
    ).rows[0];
    if (old) {
      if (
        old.plan_id !== planId ||
        old.pet_id !== petId ||
        old.predecessor_id !== predecessor ||
        old.operation !== operation ||
        (expectedPrice !== undefined && old.price_minor !== expectedPrice)
      )
        throw new ConflictException('المفتاح مستخدم لطلب مختلف');
      return old;
    }
    const p = (
      await db.query(
        "SELECT p.*,p.price_minor::text FROM care_plans p JOIN clinics c ON c.id=p.clinic_id WHERE p.id=$1 AND p.active AND c.verification_status='verified' FOR SHARE OF p,c",
        [planId],
      )
    ).rows[0];
    if (!p) throw new NotFoundException('الباقة غير متاحة');
    if (expectedPrice !== undefined && p.price_minor !== expectedPrice)
      throw new ConflictException('السعر تغير، راجع الباقة');
    const terms = (
      await db.query(
        'SELECT e.service_id,e.uses,cs.name,cs.active FROM care_plan_entitlements e JOIN clinic_services cs ON cs.id=e.service_id WHERE e.plan_id=$1 ORDER BY e.service_id FOR SHARE OF cs',
        [planId],
      )
    ).rows;
    if (!terms.length || terms.some((e) => !e.active))
      throw new ConflictException('خدمة مشمولة غير متاحة');
    let previous: Awaited<ReturnType<CarePlansService['owner']>> | undefined;
    if (predecessor) {
      previous = await this.owner(db, actor, predecessor);
      if (
        previous.pet_id !== petId ||
        previous.clinic_id !== p.clinic_id ||
        (operation === 'renew' && previous.plan_id !== planId)
      )
        throw new ConflictException('الاشتراك لا يطابق الطلب');
      if (
        (
          await db.query(
            'SELECT 1 FROM care_subscriptions WHERE predecessor_id=$1',
            [predecessor],
          )
        ).rowCount
      )
        throw new ConflictException('لهذا الاشتراك تجديد أو ترقية مسجلة');
      if (operation === 'renew') {
        if (!['expired', 'exhausted'].includes(previous.state))
          throw new ConflictException(
            'التجديد بعد انتهاء الاشتراك أو استنفاده',
          );
      } else {
        const prior = (
          await db.query(
            'SELECT service_id,uses FROM care_subscription_entitlements WHERE subscription_id=$1',
            [predecessor],
          )
        ).rows;
        const original = (
          await db.query(
            'SELECT valid_days,waiting_days FROM care_plans WHERE id=$1',
            [previous.plan_id],
          )
        ).rows[0];
        if (
          previous.status !== 'active' ||
          previous.uses_used !== 0 ||
          new Date(previous.expires_at) <= new Date(previous.db_now) ||
          Date.parse(previous.db_now) - Date.parse(previous.created_at) >
            7 * 86400000 ||
          BigInt(p.price_minor) <= BigInt(previous.price_minor) ||
          p.branch_id !== previous.branch_id ||
          p.valid_days < original.valid_days ||
          p.max_pause_days < previous.max_pause_days ||
          p.waiting_days > original.waiting_days ||
          prior.some(
            (e) =>
              !terms.some(
                (t) => t.service_id === e.service_id && t.uses >= e.uses,
              ),
          )
        )
          throw new ConflictException(
            'الترقية خلال سبعة أيام لغير المستخدم، وباقة أعلى سعراً لا تنقص الحقوق أو الصلاحية ولا تزيد الانتظار',
          );
      }
    }
    const s = (
      await db.query(
        'INSERT INTO care_subscriptions(plan_id,pet_id,user_id,uses_total,price_minor,expires_at,idempotency_key,clinic_id,branch_id,available_at,max_pause_days,predecessor_id,operation) VALUES($1,$2,$3,$4,$5,clock_timestamp()+make_interval(days=>$6),$7,$8,$9,clock_timestamp()+make_interval(days=>$10),$11,$12,$13) RETURNING *,price_minor::text',
        [
          planId,
          petId,
          actor,
          p.uses,
          p.price_minor,
          p.valid_days,
          key,
          p.clinic_id,
          p.branch_id,
          p.waiting_days,
          p.max_pause_days,
          predecessor,
          operation,
        ],
      )
    ).rows[0];
    for (const e of terms)
      await db.query(
        'INSERT INTO care_subscription_entitlements(subscription_id,clinic_id,service_id,service_name,uses) VALUES($1,$2,$3,$4,$5)',
        [s.id, p.clinic_id, e.service_id, e.name, e.uses],
      );
    if (operation === 'upgrade') {
      await this.reverse(
        db,
        actor,
        previous!,
        `plan-upgrade:${previous!.id}`,
        false,
      );
      await db.query(
        "UPDATE care_subscriptions SET status='upgraded',version=version+1 WHERE id=$1",
        [previous!.id],
      );
    }
    const amount = BigInt(p.price_minor);
    await post(
      db,
      actor,
      await entity(db, p.clinic_id),
      `plan:${s.id}`,
      'اشتراك رعاية اختباري مؤجل',
      [
        { account: '1200', debit: amount },
        { account: '2100', credit: amount },
      ],
    );
    await post(
      db,
      actor,
      await entity(db, null),
      `plan:${s.id}`,
      'تحصيل اشتراك اختباري',
      [
        { account: '1100', debit: amount },
        { account: '2000', credit: amount, partyId: p.clinic_id },
      ],
    );
    await audit(db, actor, 'services.subscription_created', p.clinic_id, {
      subscriptionId: s.id,
      operation,
      predecessor,
    });
    await emit(db, actor, 'SubscriptionCreated', s.id, 1, p.clinic_id);
    if (operation === 'upgrade')
      await emit(
        db,
        actor,
        'SubscriptionUpgraded',
        previous!.id,
        previous!.version + 1,
        p.clinic_id,
      );
    return s;
  }
  buy(
    actor: string,
    planId: string,
    petId: string,
    key: string,
    expectedPrice?: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const pet = await this.care.pet(db, actor, petId, 'profile', true);
      if (pet.archived_at) throw new ConflictException('الحيوان مؤرشف');
      return this.book(
        db,
        actor,
        planId,
        petId,
        key,
        null,
        'buy',
        expectedPrice,
      );
    });
  }
  replace(
    actor: string,
    id: string,
    operation: 'renew' | 'upgrade',
    planId: string | undefined,
    key: string,
    expectedPrice: string,
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const s = await this.owner(db, actor, id);
      return this.book(
        db,
        actor,
        planId ?? s.plan_id,
        s.pet_id,
        key,
        id,
        operation,
        expectedPrice,
      );
    });
  }
  pause(
    actor: string,
    id: string,
    action: 'pause' | 'resume',
    version: number,
    days: number | undefined,
    key: string,
  ) {
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const s = await this.owner(db, actor, id),
        hash = digest({ id, action, version, days: days ?? null });
      const old = (
        await db.query(
          'SELECT * FROM care_subscription_events WHERE actor_id=$1 AND idempotency_key=$2',
          [actor, key],
        )
      ).rows[0];
      if (old) {
        if (old.input_hash !== hash)
          throw new ConflictException('المفتاح مستخدم لطلب مختلف');
        return { id: s.id, version: s.version };
      }
      if (
        s.version !== version ||
        s.status !== 'active' ||
        ['expired', 'exhausted'].includes(s.state)
      )
        throw new ConflictException('حدّث الاشتراك وتحقق من صلاحيته');
      if (action === 'pause') {
        if (
          !days ||
          s.state === 'paused' ||
          Number(s.pause_seconds) + days * 86400 > s.max_pause_days * 86400
        )
          throw new ConflictException(
            'مدة التعليق تتجاوز الحد المتبقي أو الاشتراك معلق',
          );
        await db.query(
          'UPDATE care_subscriptions SET paused_until=$3::timestamptz+make_interval(days=>$2),pause_seconds=pause_seconds+$2*86400,expires_at=expires_at+make_interval(days=>$2),available_at=CASE WHEN available_at>$3::timestamptz THEN available_at+make_interval(days=>$2) ELSE available_at END,version=version+1 WHERE id=$1',
          [id, days, s.db_now],
        );
      } else {
        if (s.state !== 'paused')
          throw new ConflictException('الاشتراك غير معلق');
        await db.query(
          "UPDATE care_subscriptions SET expires_at=expires_at-greatest(paused_until-$2::timestamptz,interval '0'),available_at=CASE WHEN available_at>$2::timestamptz THEN available_at-greatest(paused_until-$2::timestamptz,interval '0') ELSE available_at END,pause_seconds=pause_seconds-extract(epoch FROM greatest(paused_until-$2::timestamptz,interval '0')),paused_until=NULL,version=version+1 WHERE id=$1",
          [id, s.db_now],
        );
      }
      await db.query(
        "INSERT INTO care_subscription_events(subscription_id,actor_id,action,idempotency_key,input_hash,occurred_at,effective_until) SELECT id,$2,$3,$4,$5,$6,CASE WHEN $3='pause' THEN paused_until ELSE NULL END FROM care_subscriptions WHERE id=$1",
        [id, actor, action, key, hash, s.db_now],
      );
      await audit(db, actor, `services.subscription_${action}`, s.clinic_id, {
        subscriptionId: id,
        days,
      });
      await emit(
        db,
        actor,
        action === 'pause' ? 'SubscriptionPaused' : 'SubscriptionResumed',
        id,
        s.version + 1,
        s.clinic_id,
      );
      return { id, version: s.version + 1 };
    });
  }
  redeem(actor: string, id: string, encounterId: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const s = (
        await db.query(
          `SELECT s.*,${subscriptionStateSql} state FROM care_subscriptions s WHERE s.id=$1 FOR UPDATE OF s`,
          [id],
        )
      ).rows[0];
      if (!s) throw new NotFoundException();
      const pet = await this.care.medical(db, actor, s.pet_id, s.clinic_id);
      if (pet.owner_id !== s.user_id || pet.archived_at)
        throw new ConflictException(
          'الملكية الحالية أو حالة الحيوان لا تسمح باستخدام الاشتراك',
        );
      const old = (
        await db.query(
          'SELECT * FROM entitlement_usage WHERE subscription_id=$1 AND encounter_id=$2',
          [id, encounterId],
        )
      ).rows[0];
      if (old) return old;
      if (s.state !== 'active')
        throw new ConflictException(
          'الاشتراك في الانتظار أو معلق أو منتهٍ أو مستنفد',
        );
      const e = (
        await db.query(
          'SELECT sl.service_id,e.signed_at,a.starts_at,sl.branch_id FROM encounters e JOIN appointments a ON a.id=e.appointment_id JOIN appointment_slots sl ON sl.id=a.slot_id WHERE e.id=$1 AND e.pet_id=$2 AND e.clinic_id=$3 AND e.signed_at IS NOT NULL',
          [encounterId, s.pet_id, s.clinic_id],
        )
      ).rows[0];
      if (
        !e ||
        Date.parse(e.starts_at) < Date.parse(s.available_at) ||
        Date.parse(e.starts_at) >= Date.parse(s.expires_at) ||
        (s.branch_id && e.branch_id !== s.branch_id)
      )
        throw new ConflictException(
          'الزيارة الموقعة لا تطابق فرع الاشتراك أو فترة أهليته',
        );
      if (
        (
          await db.query(
            "SELECT 1 FROM care_subscription_events ev WHERE ev.subscription_id=$1 AND ev.action='pause' AND ev.occurred_at<=$2 AND $2::timestamptz<least(ev.effective_until,coalesce((SELECT min(r.occurred_at) FROM care_subscription_events r WHERE r.subscription_id=ev.subscription_id AND r.action='resume' AND r.occurred_at>ev.occurred_at),ev.effective_until))",
            [id, e.starts_at],
          )
        ).rowCount
      )
        throw new ConflictException('الزيارة جرت أثناء تعليق الاشتراك');
      const term = (
        await db.query(
          'SELECT e.uses,(SELECT count(*)::int FROM entitlement_usage u WHERE u.subscription_id=e.subscription_id AND u.service_id=e.service_id) used FROM care_subscription_entitlements e WHERE subscription_id=$1 AND service_id=$2',
          [id, e.service_id],
        )
      ).rows[0];
      if (!term || term.used >= term.uses)
        throw new ConflictException('الخدمة غير مشمولة أو حصتها مستنفدة');
      if (
        (
          await db.query(
            'SELECT 1 FROM entitlement_usage WHERE encounter_id=$1',
            [encounterId],
          )
        ).rowCount
      )
        throw new ConflictException('احتسبت هذه الزيارة بالفعل');
      const amount = usageRecognition(
        BigInt(s.price_minor),
        s.uses_used,
        s.uses_total,
      );
      const u = (
        await db.query(
          'INSERT INTO entitlement_usage(subscription_id,encounter_id,actor_id,service_id,recognized_minor) VALUES($1,$2,$3,$4,$5) RETURNING *,recognized_minor::text',
          [id, encounterId, actor, e.service_id, amount.toString()],
        )
      ).rows[0];
      await db.query(
        'UPDATE care_subscriptions SET uses_used=uses_used+1,version=version+1 WHERE id=$1',
        [id],
      );
      if (amount > 0n)
        await post(
          db,
          actor,
          await entity(db, s.clinic_id),
          `usage:${u.id}`,
          'اعتراف بخدمة اشتراك منفذة',
          [
            { account: '2100', debit: amount },
            { account: '4100', credit: amount },
          ],
        );
      await audit(db, actor, 'services.entitlement_used', s.clinic_id, {
        usageId: u.id,
      });
      await emit(
        db,
        actor,
        'SubscriptionEntitlementUsed',
        id,
        s.version + 1,
        s.clinic_id,
      );
      return u;
    });
  }
  async reverse(
    db: PoolClient,
    actor: string,
    s: { id: string; clinic_id: string; price_minor: string },
    reference: string,
    checkAvailable: boolean,
  ) {
    const platform = await entity(db, null),
      amount = BigInt(s.price_minor);
    if (checkAvailable) {
      const available = (
        await db.query(
          "SELECT coalesce((SELECT sum(l.credit-l.debit) FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.entity_id=$1 AND l.party_id=$2 AND l.account_code='2000' AND j.status='posted'),0)-coalesce((SELECT sum(amount_minor) FROM sandbox_payouts WHERE kind='clinic' AND party_id=$2 AND status='pending'),0) amount",
          [platform, s.clinic_id],
        )
      ).rows[0].amount;
      if (BigInt(available) < amount)
        throw new ConflictException('تحتاج العيادة تسوية المستحق قبل الرد');
    }
    await post(
      db,
      actor,
      await entity(db, s.clinic_id),
      reference,
      'عكس اشتراك غير مستخدم',
      [
        { account: '2100', debit: amount },
        { account: '1200', credit: amount },
      ],
    );
    await post(db, actor, platform, reference, 'رد اشتراك اختباري', [
      { account: '2000', debit: amount, partyId: s.clinic_id },
      { account: '1100', credit: amount },
    ]);
  }
  cancel(actor: string, id: string) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const s = await this.owner(db, actor, id);
      if (
        s.status !== 'active' ||
        s.uses_used !== 0 ||
        Date.parse(s.db_now) - Date.parse(s.created_at) > 7 * 86400000
      )
        throw new ConflictException(
          'الإلغاء لاشتراك غير مستخدم خلال سبعة أيام',
        );
      await this.reverse(db, actor, s, `plan-cancel:${id}`, true);
      await db.query(
        "UPDATE care_subscriptions SET status='cancelled',version=version+1 WHERE id=$1",
        [id],
      );
      await audit(db, actor, 'services.subscription_cancelled', s.clinic_id, {
        subscriptionId: id,
      });
      await emit(
        db,
        actor,
        'SubscriptionCancelled',
        id,
        s.version + 1,
        s.clinic_id,
      );
      return { status: 'cancelled' };
    });
  }
}
