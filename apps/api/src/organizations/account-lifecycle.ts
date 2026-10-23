import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../identity/auth.js';
import { requireSession, requireAdmin } from '../identity/session.js';
import {
  accountPolicy,
  lockAccount,
  type AccountType,
} from '../identity/account-policy.js';
import { database, transaction } from '../database.js';
import type { PoolClient } from 'pg';
import { audit } from './service.js';

const retentionNotice =
  'يُغلق الدخول وتُلغى الجلسات وتُخفى المنشورات والملف الاجتماعي. تُحفظ السجلات الطبية والمالية والتدقيق اللازمة بصورة مقيدة، ولا يعني الإغلاق محواً شاملاً لهذه السجلات.';
async function canLeave(db: PoolClient, userId: string) {
  await db.query(
    "SELECT c.id FROM clinics c JOIN clinic_memberships m ON m.clinic_id=c.id WHERE m.user_id=$1 AND m.revoked_at IS NULL AND 'clinic_admin'=ANY(m.capabilities) ORDER BY c.id FOR UPDATE OF c",
    [userId],
  );
  if (
    (
      await db.query(
        "SELECT 1 FROM clinic_memberships m JOIN clinics c ON c.id=m.clinic_id WHERE m.user_id=$1 AND m.revoked_at IS NULL AND 'clinic_admin'=ANY(m.capabilities) AND c.verification_status='verified' AND NOT EXISTS(SELECT 1 FROM clinic_memberships other JOIN auth_users u ON u.id=other.user_id WHERE other.clinic_id=m.clinic_id AND other.user_id<>$1 AND other.revoked_at IS NULL AND 'clinic_admin'=ANY(other.capabilities) AND u.closed_at IS NULL)",
        [userId],
      )
    ).rowCount
  )
    throw new ConflictException(
      'عيّن مديراً آخر للعيادة قبل تغيير نوع الحساب أو حذفه.',
    );
  if (
    (
      await db.query(
        "SELECT 1 FROM rides WHERE (driver_id=$1 OR user_id=$1) AND status NOT IN ('completed','cancelled') LIMIT 1",
        [userId],
      )
    ).rowCount
  )
    throw new ConflictException(
      'أكمل الرحلات النشطة أو ألغها قبل تغيير نوع الحساب أو حذفه.',
    );
  if (
    (
      await db.query(
        "SELECT 1 FROM appointments WHERE doctor_id=$1 AND status='confirmed' AND ends_at>now() LIMIT 1",
        [userId],
      )
    ).rowCount
  )
    throw new ConflictException(
      'نسّق مواعيدك الطبية المؤكدة مع العيادة قبل تغيير النوع أو حذف الحساب.',
    );
}
@Injectable()
export class AccountLifecycle {
  async requests(req: Request) {
    const s = await requireSession(req);
    return (
      await database.query(
        'SELECT id,from_type,target_type,reason,status,review_reason,version,created_at FROM account_type_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
        [s.user.id],
      )
    ).rows;
  }
  async request(
    req: Request,
    input: { targetType: AccountType; reason: string },
  ) {
    const s = await requireSession(req);
    return transaction(async (db) => {
      await lockAccount(db, s.user.id);
      const type = await accountPolicy(s.user.id, db);
      if (type === input.targetType)
        throw new ConflictException('هذا هو نوع حسابك الحالي.');
      if (
        (
          await db.query(
            "SELECT 1 FROM account_type_requests WHERE user_id=$1 AND status='pending'",
            [s.user.id],
          )
        ).rowCount
      )
        throw new ConflictException('يوجد طلب تغيير قيد المراجعة.');
      const row = (
        await db.query(
          'INSERT INTO account_type_requests(user_id,from_type,target_type,reason) VALUES($1,$2,$3,$4) RETURNING id,status,version',
          [s.user.id, type, input.targetType, input.reason],
        )
      ).rows[0];
      await audit(db, s.user.id, 'identity.type_change_requested', null, {
        requestId: row.id,
        fromType: type,
        targetType: input.targetType,
      });
      return row;
    });
  }
  async queue(req: Request) {
    await requireAdmin(req);
    return (
      await database.query(
        'SELECT r.id,r.user_id,r.from_type,r.target_type,r.reason,r.status,r.review_reason,r.version,r.created_at,u.name applicant FROM account_type_requests r JOIN auth_users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100',
      )
    ).rows;
  }
  async decide(
    req: Request,
    id: string,
    input: {
      decision: 'approved' | 'rejected';
      reason: string;
      version: number;
    },
  ) {
    const admin = await requireAdmin(req);
    return transaction(async (db) => {
      const locator = (
        await db.query(
          'SELECT user_id FROM account_type_requests WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (!locator) throw new NotFoundException('الطلب غير موجود');
      if (locator.user_id === admin.user.id)
        throw new ForbiddenException('لا يمكنك مراجعة طلبك بنفسك.');
      await lockAccount(db, locator.user_id);
      const row = (
        await db.query(
          'SELECT * FROM account_type_requests WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      const current = await accountPolicy(row.user_id, db);
      if (
        row.status !== 'pending' ||
        row.version !== input.version ||
        current !== row.from_type
      )
        throw new ConflictException('تغير الطلب؛ حدّث القائمة قبل المراجعة.');
      if (input.decision === 'approved') await canLeave(db, row.user_id);
      await db.query(
        'UPDATE account_type_requests SET status=$2,review_reason=$3,reviewed_by=$4,reviewed_at=now(),version=version+1 WHERE id=$1',
        [id, input.decision, input.reason, admin.user.id],
      );
      if (input.decision === 'approved') {
        await db.query(
          "SELECT set_config('petra.account_type_request',$1,true)",
          [id],
        );
        await db.query(
          'UPDATE auth_users SET account_type=$2,"updatedAt"=now() WHERE id=$1',
          [row.user_id, row.target_type],
        );
        await db.query(
          "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1",
          [row.user_id],
        );
        await db.query(
          "UPDATE professional_applications SET status='suspended',review_reason='أُلغي الاعتماد السابق عند تغيير نوع الحساب',reviewed_by=$2,reviewed_at=now(),version=version+1 WHERE user_id=$1 AND status='approved'",
          [row.user_id, admin.user.id],
        );
        await db.query(
          "UPDATE professional_applications SET status='rejected',review_reason='تغير نوع الحساب قبل اكتمال الاعتماد',reviewed_by=$2,reviewed_at=now(),version=version+1 WHERE user_id=$1 AND status='pending'",
          [row.user_id, admin.user.id],
        );
        await db.query(
          'UPDATE clinic_memberships SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
          [row.user_id],
        );
        await db.query(
          "UPDATE doctor_affiliations SET status='revoked',updated_at=now() WHERE doctor_id=$1 AND status IN ('pending','approved')",
          [row.user_id],
        );
        await db.query(
          'UPDATE driver_vehicles SET available=false WHERE user_id=$1',
          [row.user_id],
        );
        await db.query('DELETE FROM auth_sessions WHERE "userId"=$1', [
          row.user_id,
        ]);
      }
      await audit(
        db,
        admin.user.id,
        'identity.type_change_' + input.decision,
        null,
        {
          requestId: id,
          userId: row.user_id,
          fromType: current,
          targetType: row.target_type,
        },
      );
      return { status: input.decision, version: row.version + 1 };
    });
  }
  async close(req: Request, input: { password: string; confirmation: string }) {
    const s = await requireSession(req);
    if (input.confirmation !== 'حذف حسابي')
      throw new ForbiddenException('اكتب «حذف حسابي» لتأكيد الإغلاق.');
    if (Date.now() - new Date(s.session.createdAt).getTime() > 15 * 60 * 1000)
      throw new ForbiddenException(
        'سجّل الدخول مجدداً قبل حذف الحساب؛ يلزم دخول خلال آخر 15 دقيقة.',
      );
    // Charge wrong-password attempts outside the deletion transaction, so rollback cannot reset the limit.
    const limit = (
      await database.query(
        `INSERT INTO auth_rate_limits(id,key,count,"lastRequest") VALUES(gen_random_uuid(),$1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limits."lastRequest"<$2-60000 THEN 1 ELSE auth_rate_limits.count+1 END,"lastRequest"=$2 RETURNING count`,
        ['account-close:' + s.user.id, Date.now()],
      )
    ).rows[0];
    if (limit.count > 5)
      throw new HttpException(
        'محاولات كثيرة؛ انتظر دقيقة قبل إعادة المحاولة.',
        429,
      );
    try {
      await auth.api.verifyPassword({
        headers: fromNodeHeaders(req.headers),
        body: { password: input.password },
      });
    } catch {
      throw new ForbiddenException(
        'كلمة المرور غير صحيحة أو انتهت الجلسة؛ لم يُحذف الحساب.',
      );
    }
    return transaction(async (db) => {
      await lockAccount(db, s.user.id);
      await accountPolicy(s.user.id, db);
      if (
        (
          await db.query(
            'SELECT 1 FROM admin_grants WHERE user_id=$1 AND revoked_at IS NULL',
            [s.user.id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'إغلاق حساب إدارة المنصة يتطلب نقل المسؤولية عبر الإدارة.',
        );
      await canLeave(db, s.user.id);
      await db.query(
        'INSERT INTO account_closures(user_id,retention_notice) VALUES($1,$2)',
        [s.user.id, retentionNotice],
      );
      await db.query(
        `UPDATE auth_users SET closed_at=now(),name='حساب محذوف',email=$2,"emailVerified"=false,image=NULL,"updatedAt"=now() WHERE id=$1`,
        [s.user.id, `closed-${s.user.id}@closed.petra.invalid`],
      );
      await db.query('DELETE FROM auth_accounts WHERE "userId"=$1', [
        s.user.id,
      ]);
      await db.query('DELETE FROM auth_two_factors WHERE "userId"=$1', [
        s.user.id,
      ]);
      await db.query('DELETE FROM auth_sessions WHERE "userId"=$1', [
        s.user.id,
      ]);
      await db.query(
        "UPDATE account_type_requests SET status='cancelled',version=version+1 WHERE user_id=$1 AND status='pending'",
        [s.user.id],
      );
      await db.query(
        "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1",
        [s.user.id],
      );
      await db.query(
        'UPDATE clinic_memberships SET revoked_at=now(),updated_at=now() WHERE user_id=$1',
        [s.user.id],
      );
      await db.query(
        'UPDATE driver_vehicles SET available=false WHERE user_id=$1',
        [s.user.id],
      );
      await db.query(
        "UPDATE social_profiles SET display_name='حساب محذوف',bio='',privacy='private',avatar_asset_id=NULL,handle='closed_'||substr(replace(gen_random_uuid()::text,'-',''),1,20) WHERE user_id=$1",
        [s.user.id],
      );
      await db.query(
        'UPDATE social_posts SET deleted_at=coalesce(deleted_at,now()),version=version+1 WHERE user_id=$1',
        [s.user.id],
      );
      await db.query('DELETE FROM social_comments WHERE user_id=$1', [
        s.user.id,
      ]);
      await db.query('DELETE FROM social_reactions WHERE user_id=$1', [
        s.user.id,
      ]);
      await db.query(
        'DELETE FROM social_follows WHERE follower_id=$1 OR followed_id=$1',
        [s.user.id],
      );
      await audit(db, s.user.id, 'identity.account_closed', null, {
        retained: 'restricted medical, financial and audit records',
      });
      return { status: 'closed', retentionNotice };
    });
  }
}
