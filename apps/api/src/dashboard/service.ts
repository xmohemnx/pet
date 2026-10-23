import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { transaction, database } from '../database.js';
import { audit, OrganizationService } from '../organizations/service.js';
import { requireAccountType } from '../identity/account-policy.js';
import { CareService } from '../care/service.js';
import type {
  BannerInput,
  CaseReportInput,
} from '../../../../packages/contracts/src/index.js';
@Injectable()
export class DashboardService {
  constructor(
    private readonly org: OrganizationService,
    private readonly care: CareService,
  ) {}
  async overview(actor: string, kind: string, clinicId?: string) {
    return transaction(async (db) => {
      await requireAccountType(actor, [kind], db);
      const verified =
        (
          await db.query(
            "SELECT 1 FROM account_verification_requests WHERE user_id=$1 AND status='verified'",
            [actor],
          )
        ).rowCount !== 0;
      let metrics: { label: string; value: number; href: string }[] = [];
      const count = async (sql: string, args: unknown[]) =>
        Number((await db.query(sql, args)).rows[0].n);
      if (kind === 'customer')
        metrics = [
          {
            label: 'حيواناتي',
            value: await count(
              'SELECT count(*)::int n FROM pets WHERE owner_id=$1 AND archived_at IS NULL',
              [actor],
            ),
            href: '/care',
          },
          {
            label: 'مواعيد قادمة',
            value: await count(
              "SELECT count(*)::int n FROM appointments WHERE requester_id=$1 AND status='confirmed' AND ends_at>now()",
              [actor],
            ),
            href: '/care/calendar',
          },
          {
            label: 'طلبات المتجر',
            value: await count(
              'SELECT count(*)::int n FROM checkout_orders WHERE user_id=$1',
              [actor],
            ),
            href: '/marketplace',
          },
        ];
      if (kind === 'doctor') {
        if (
          !(
            await db.query(
              "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='doctor' AND status='verified' FOR SHARE",
              [actor],
            )
          ).rowCount
        )
          throw new ForbiddenException('يلزم اعتماد الطبيب');
        metrics = [
          {
            label: 'زيارات مكتملة',
            value: await count(
              "SELECT count(*)::int n FROM appointments WHERE doctor_id=$1 AND status='completed'",
              [actor],
            ),
            href: '/doctor',
          },
          {
            label: 'نتائج موثقة',
            value: await count(
              "SELECT count(*)::int n FROM professional_case_reports WHERE doctor_id=$1 AND status='approved'",
              [actor],
            ),
            href: '/doctor/portfolio',
          },
          {
            label: 'عيادات الانتساب',
            value: await count(
              "SELECT count(*)::int n FROM doctor_affiliations f JOIN clinics c ON c.id=f.clinic_id JOIN clinic_memberships m ON m.clinic_id=f.clinic_id AND m.user_id=f.doctor_id WHERE f.doctor_id=$1 AND f.status='approved' AND c.verification_status='verified' AND m.revoked_at IS NULL AND 'doctor_member'=ANY(m.capabilities)",
              [actor],
            ),
            href: '/doctor/planning',
          },
        ];
      }
      if (kind === 'clinic') {
        if (!clinicId) throw new BadRequestException('حدد العيادة');
        const membership = await this.org.membership(
          actor,
          clinicId,
          undefined,
          db,
        );
        metrics = [
          {
            label: 'فروع العيادة',
            value: await count(
              'SELECT count(*)::int n FROM clinic_branches WHERE clinic_id=$1',
              [clinicId],
            ),
            href: `/clinic/${clinicId}`,
          },
        ];
        if (
          membership.capabilities.some((c: string) =>
            ['clinic_admin', 'receptionist'].includes(c),
          )
        )
          metrics.push({
            label: 'مواعيد قادمة',
            value: await count(
              "SELECT count(*)::int n FROM appointments WHERE clinic_id=$1 AND status='confirmed' AND ends_at>now()",
              [clinicId],
            ),
            href: `/clinic/${clinicId}/calendar`,
          });
        if (
          membership.capabilities.some((c: string) =>
            ['clinic_admin', 'commerce_manager'].includes(c),
          )
        )
          metrics.push({
            label: 'أقسام المتجر',
            value: await count(
              'SELECT count(*)::int n FROM catalog_categories WHERE clinic_id=$1 AND deleted_at IS NULL',
              [clinicId],
            ),
            href: `/clinic/${clinicId}/catalog`,
          });
      }
      if (kind === 'driver') {
        if (
          !(
            await db.query(
              "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='driver' AND status='verified' FOR SHARE",
              [actor],
            )
          ).rowCount
        )
          throw new ForbiddenException('يلزم اعتماد السائق');
        metrics = [
          {
            label: 'رحلات مكتملة',
            value: await count(
              "SELECT count(*)::int n FROM rides WHERE driver_id=$1 AND status='completed'",
              [actor],
            ),
            href: '/driver',
          },
          {
            label: 'رحلات جارية',
            value: await count(
              "SELECT count(*)::int n FROM rides WHERE driver_id=$1 AND status IN ('accepted','driver_en_route','arrived','in_transit')",
              [actor],
            ),
            href: '/driver',
          },
        ];
      }
      return { kind, verified, metrics };
    });
  }
  async adminOverview() {
    const r = await database.query(
      `SELECT (SELECT count(*)::int FROM auth_users WHERE closed_at IS NULL) users,(SELECT count(*)::int FROM clinics WHERE verification_status='verified') clinics,(SELECT count(*)::int FROM professional_applications WHERE status='pending') applications,(SELECT count(*)::int FROM account_verification_requests WHERE status='pending') verifications,(SELECT count(*)::int FROM professional_case_reports WHERE status='pending') reports,(SELECT count(*)::int FROM site_banners WHERE published AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())) banners`,
    );
    return r.rows[0];
  }
  async banners(admin = false) {
    return (
      await database.query(
        `SELECT id,title,body,asset_id,image_alt,href,position,published,starts_at,ends_at,version FROM site_banners WHERE deleted_at IS NULL ${admin ? '' : 'AND published AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())'} ORDER BY position,created_at DESC LIMIT ${admin ? 100 : 12}`,
      )
    ).rows;
  }
  async saveBanner(
    actor: string,
    input: BannerInput,
    id?: string,
    version?: number,
  ) {
    return transaction(async (db) => {
      let old;
      if (id) {
        old = (
          await db.query(
            'SELECT * FROM site_banners WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!old) throw new NotFoundException();
        if (old.version !== version)
          throw new ConflictException('تغير البنر؛ أعد تحميله');
      }
      if (
        input.assetId &&
        (!old || input.assetId !== old.asset_id) &&
        !(
          await db.query(
            "SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='image' AND status='ready' AND pet_id IS NULL AND chat_peer_id IS NULL AND NOT EXISTS(SELECT 1 FROM grooming_photos g WHERE g.asset_id=media_assets.id) FOR UPDATE",
            [input.assetId, actor],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'اختر صورة جاهزة مرفوعة من حسابك دون نطاق طبي أو محادثة',
        );
      const values = [
        actor,
        input.title,
        input.body,
        input.assetId,
        input.imageAlt,
        input.href,
        input.position,
        input.published,
        input.startsAt,
        input.endsAt,
      ];
      const row = id
        ? (
            await db.query(
              'UPDATE site_banners SET updated_by=$1,title=$2,body=$3,asset_id=$4,image_alt=$5,href=$6,position=$7,published=$8,starts_at=$9,ends_at=$10,version=version+1 WHERE id=$11 RETURNING *',
              [...values, id],
            )
          ).rows[0]
        : (
            await db.query(
              'INSERT INTO site_banners(created_by,updated_by,title,body,asset_id,image_alt,href,position,published,starts_at,ends_at) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
              values,
            )
          ).rows[0];
      await audit(
        db,
        actor,
        id ? 'content.banner_updated' : 'content.banner_created',
        null,
        { bannerId: row.id, published: row.published },
      );
      return row;
    });
  }
  async deleteBanner(actor: string, id: string, version: number) {
    return transaction(async (db) => {
      const r = await db.query(
        'UPDATE site_banners SET deleted_at=now(),published=false,updated_by=$3,version=version+1 WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING id',
        [id, version, actor],
      );
      if (!r.rowCount) throw new ConflictException('حدّث البنر قبل حذفه');
      await audit(db, actor, 'content.banner_deleted', null, { bannerId: id });
      return { deleted: true };
    });
  }
  async verifications(actor?: string) {
    return (
      await database.query(
        `SELECT v.*,u.name applicant,u.account_type FROM account_verification_requests v JOIN auth_users u ON u.id=v.user_id WHERE u.closed_at IS NULL ${actor ? 'AND v.user_id=$1' : ''} ORDER BY (v.status='pending') DESC,v.created_at LIMIT 100`,
        actor ? [actor] : [],
      )
    ).rows;
  }
  async requestVerification(actor: string, reference: string) {
    return transaction(async (db) => {
      await db.query('SELECT id FROM auth_users WHERE id=$1 FOR UPDATE', [
        actor,
      ]);
      if (
        (
          await db.query(
            "SELECT 1 FROM account_verification_requests WHERE user_id=$1 AND status IN ('pending','verified')",
            [actor],
          )
        ).rowCount
      )
        throw new ConflictException('لديك طلب جارٍ أو توثيق فعال');
      const row = (
        await db.query(
          'INSERT INTO account_verification_requests(user_id,reference) VALUES($1,$2) RETURNING *',
          [actor, reference],
        )
      ).rows[0];
      await audit(db, actor, 'identity.verification_requested', null, {
        requestId: row.id,
      });
      return row;
    });
  }
  async reviewVerification(
    actor: string,
    id: string,
    decision: string,
    reason: string,
    version: number,
  ) {
    return transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT * FROM account_verification_requests WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      if (row.user_id === actor)
        throw new ForbiddenException('لا تراجع توثيقك بنفسك');
      if (
        row.version !== version ||
        !(
          (row.status === 'pending' &&
            ['verified', 'rejected'].includes(decision)) ||
          (row.status === 'verified' && decision === 'revoked')
        )
      )
        throw new ConflictException('حدّث الطلب قبل مراجعته');
      await db.query(
        'UPDATE account_verification_requests SET status=$2,review_reason=$3,reviewed_by=$4,reviewed_at=now(),version=version+1 WHERE id=$1',
        [id, decision, reason, actor],
      );
      await audit(db, actor, 'identity.verification_reviewed', null, {
        requestId: id,
        decision,
        reason,
      });
      return { status: decision };
    });
  }
  async reports(actor?: string, clinic?: string) {
    return transaction(async (db) => {
      if (clinic) await this.org.membership(actor!, clinic, 'clinic_admin', db);
      return (
        await db.query(
          `SELECT r.*,d.name doctor_name,c.name clinic_name FROM professional_case_reports r JOIN auth_users d ON d.id=r.doctor_id JOIN clinics c ON c.id=r.clinic_id ${clinic ? 'WHERE r.clinic_id=$1' : actor ? 'WHERE r.doctor_id=$1' : ''} ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100`,
          clinic ? [clinic] : actor ? [actor] : [],
        )
      ).rows;
    });
  }
  async submitReport(actor: string, i: CaseReportInput) {
    return transaction(async (db) => {
      const a = (
        await db.query(
          "SELECT a.* FROM appointments a JOIN encounters e ON e.appointment_id=a.id WHERE a.id=$1 AND a.status='completed' AND e.signed_at IS NOT NULL FOR SHARE OF a,e",
          [i.appointmentId],
        )
      ).rows[0];
      if (!a || a.doctor_id !== actor)
        throw new NotFoundException('اختر زيارة مكتملة وموقعة مسندة إليك');
      await this.care.doctor(db, actor, a.clinic_id);
      if (
        (
          await db.query(
            'SELECT 1 FROM professional_case_reports WHERE appointment_id=$1',
            [a.id],
          )
        ).rowCount
      )
        throw new ConflictException('لهذه الزيارة تقرير نتيجة بالفعل');
      const row = (
        await db.query(
          'INSERT INTO professional_case_reports(appointment_id,doctor_id,clinic_id,submitted_by,procedure_kind,public_title,outcome,charitable,evidence_reference) VALUES($1,$2,$3,$2,$4,$5,$6,$7,$8) RETURNING *',
          [
            a.id,
            actor,
            a.clinic_id,
            i.procedureKind,
            i.publicTitle,
            i.outcome,
            i.charitable,
            i.evidenceReference,
          ],
        )
      ).rows[0];
      await audit(db, actor, 'professional.report_submitted', a.clinic_id, {
        reportId: row.id,
      });
      return row;
    });
  }
  async reviewReport(
    actor: string,
    id: string,
    decision: string,
    reason: string,
    version: number,
  ) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          'SELECT * FROM professional_case_reports WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      if ([r.doctor_id, r.submitted_by].includes(actor))
        throw new ForbiddenException('لا تعتمد نتائجك بنفسك');
      if (
        r.version !== version ||
        !(
          (r.status === 'pending' &&
            ['approved', 'rejected'].includes(decision)) ||
          (r.status === 'approved' && decision === 'revoked')
        )
      )
        throw new ConflictException('حدّث التقرير قبل اتخاذ القرار');
      await db.query(
        'UPDATE professional_case_reports SET status=$2,review_reason=$3,reviewed_by=$4,reviewed_at=now(),version=version+1 WHERE id=$1',
        [id, decision, reason, actor],
      );
      await audit(db, actor, 'professional.report_reviewed', r.clinic_id, {
        reportId: id,
        decision,
        reason,
      });
      return { status: decision };
    });
  }
  async portfolio(kind: 'doctor' | 'clinic', id: string) {
    return transaction(async (db) => {
      const info =
        kind === 'doctor'
          ? (
              await db.query(
                "SELECT u.id,u.name,EXISTS(SELECT 1 FROM account_verification_requests v WHERE v.user_id=u.id AND v.status='verified') identity_verified,coalesce(p.bio,'') bio,coalesce(p.specialty,'') specialty,coalesce(p.languages,'{}') languages FROM auth_users u JOIN professional_profiles v ON v.user_id=u.id AND v.kind='doctor' AND v.status='verified' LEFT JOIN doctor_public_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.closed_at IS NULL",
                [id],
              )
            ).rows[0]
          : (
              await db.query(
                "SELECT c.id,c.name,EXISTS(SELECT 1 FROM account_verification_requests v JOIN clinic_memberships m ON m.user_id=v.user_id AND m.clinic_id=c.id WHERE v.status='verified' AND m.revoked_at IS NULL AND 'clinic_admin'=ANY(m.capabilities)) identity_verified,coalesce(s.description,'') bio,'' specialty,ARRAY[]::text[] languages FROM clinics c LEFT JOIN clinic_storefronts s ON s.clinic_id=c.id AND s.is_primary AND s.published WHERE c.id=$1 AND c.verification_status='verified'",
                [id],
              )
            ).rows[0];
      if (!info) throw new NotFoundException('الملف المهني غير متاح');
      const field = kind === 'doctor' ? 'doctor_id' : 'clinic_id';
      const statistics = (
        await db.query(
          `SELECT count(*)::int total,count(*) FILTER(WHERE procedure_kind='surgery')::int surgeries,count(*) FILTER(WHERE outcome='successful')::int successful,count(*) FILTER(WHERE outcome='unsuccessful')::int unsuccessful,count(*) FILTER(WHERE outcome='pending')::int pending,count(*) FILTER(WHERE charitable)::int charitable FROM professional_case_reports WHERE ${field}=$1 AND status='approved'`,
          [id],
        )
      ).rows[0];
      const highlights = (
        await db.query(
          `SELECT id,procedure_kind,public_title,outcome,charitable,reviewed_at FROM professional_case_reports WHERE ${field}=$1 AND status='approved' ORDER BY reviewed_at DESC LIMIT 20`,
          [id],
        )
      ).rows;
      const completedVisits = Number(
        (
          await db.query(
            `SELECT count(*)::int n FROM appointments WHERE ${field}=$1 AND status='completed'`,
            [id],
          )
        ).rows[0].n,
      );
      return {
        id: info.id,
        name: info.name,
        bio: info.bio,
        specialty: info.specialty,
        languages: info.languages,
        kind,
        professionalVerified: true,
        identityVerified: info.identity_verified,
        statistics,
        completedVisits,
        highlights,
      };
    });
  }
}
