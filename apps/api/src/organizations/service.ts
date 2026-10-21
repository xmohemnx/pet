import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Request } from 'express';
import { database, transaction } from '../database.js';
import { requireSession, requireAdmin } from '../identity/session.js';
import { sendMail, origin } from '../identity/auth.js';
export const capabilities = [
  'clinic_admin',
  'receptionist',
  'commerce_manager',
  'inventory_clerk',
  'clinic_accountant',
  'cashier',
  'doctor_member',
  'service_staff',
] as const;
export async function audit(
  db: PoolClient,
  actor: string,
  action: string,
  clinic: string | null = null,
  details: Record<string, unknown> = {},
) {
  await db.query(
    'INSERT INTO audit_events(id,actor_id,action,clinic_id,request_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(), actor, action, clinic, randomUUID(), details],
  );
}
export async function emit(
  db: PoolClient,
  actor: string,
  type: string,
  aggregateId: string,
  version: number,
  clinicId: string | null = null,
) {
  await db.query(
    'INSERT INTO outbox_messages(event_id,aggregate_id,aggregate_version,event_type,payload) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), aggregateId, version, type, { actorId: actor, clinicId }],
  );
}
@Injectable()
export class OrganizationService {
  async membership(
    userId: string,
    clinicId: string,
    capability?: string,
    db: PoolClient | typeof database = database,
  ) {
    const result = await db.query(
      "SELECT m.capabilities,c.name,c.verification_status FROM clinic_memberships m JOIN clinics c ON c.id=m.clinic_id WHERE m.user_id=$1 AND m.clinic_id=$2 AND m.revoked_at IS NULL AND c.verification_status='verified'",
      [userId, clinicId],
    );
    const row = result.rows[0];
    if (!row || (capability && !row.capabilities.includes(capability)))
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذه العيادة');
    return row;
  }
  async workspaces(userId: string) {
    const list: {
      id: string;
      persona: string;
      name: string;
      clinicId: string | null;
      capabilities: string[];
    }[] = [
      {
        id: 'customer',
        persona: 'customer',
        name: 'مساحتي الشخصية',
        clinicId: null,
        capabilities: [],
      },
    ];
    const clinics = await database.query(
      "SELECT c.id,c.name,m.capabilities FROM clinics c JOIN clinic_memberships m ON m.clinic_id=c.id WHERE m.user_id=$1 AND m.revoked_at IS NULL AND c.verification_status='verified' ORDER BY c.name",
      [userId],
    );
    for (const c of clinics.rows)
      list.push({
        id: `clinic:${c.id}`,
        persona: 'clinic_member',
        name: c.name,
        clinicId: c.id,
        capabilities: c.capabilities,
      });
    const profiles = await database.query(
      "SELECT kind FROM professional_profiles WHERE user_id=$1 AND status='verified'",
      [userId],
    );
    for (const p of profiles.rows)
      list.push({
        id: p.kind,
        persona: p.kind,
        name: p.kind === 'doctor' ? 'مساحة الطبيب' : 'مساحة السائق',
        clinicId: null,
        capabilities: [],
      });
    const admin = await database.query(
      'SELECT capabilities FROM admin_grants WHERE user_id=$1 AND revoked_at IS NULL',
      [userId],
    );
    if (admin.rowCount)
      list.push({
        id: 'admin',
        persona: 'platform_admin',
        name: 'إدارة المنصة',
        clinicId: null,
        capabilities: admin.rows[0].capabilities,
      });
    return list;
  }
  async me(req: Request) {
    const s = await requireSession(req);
    const workspaces = await this.workspaces(s.user.id);
    const active = await database.query(
      'SELECT workspace_id FROM active_workspaces WHERE session_id=$1',
      [s.session.id],
    );
    const activeWorkspace =
      workspaces.find((w) => w.id === active.rows[0]?.workspace_id) ||
      workspaces[0]!;
    return {
      user: {
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        emailVerified: s.user.emailVerified,
        twoFactorEnabled: !!s.user.twoFactorEnabled,
      },
      sessionId: s.session.id,
      workspaces,
      activeWorkspace,
    };
  }
  async switchWorkspace(req: Request, id: string) {
    const s = await requireSession(req);
    const match = (await this.workspaces(s.user.id)).find((w) => w.id === id);
    if (!match)
      throw new ForbiddenException('مساحة العمل غير متاحة لهذا الحساب');
    if (match.persona === 'platform_admin') await requireAdmin(req);
    await transaction(async (db) => {
      await db.query(
        'INSERT INTO active_workspaces(session_id,workspace_id) VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id,updated_at=now()',
        [s.session.id, id],
      );
      await audit(
        db,
        s.user.id,
        'identity.workspace_selected',
        match.clinicId,
        { workspace: id },
      );
    });
    return match;
  }
  async application(
    req: Request,
    input: {
      kind: string;
      displayName: string;
      registrationNumber: string;
      notes: string;
    },
  ) {
    const s = await requireSession(req);
    return transaction(async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        s.user.id,
      ]);
      if (
        (
          await db.query(
            "SELECT id FROM professional_applications WHERE user_id=$1 AND kind=$2 AND status IN ('pending','approved')",
            [s.user.id, input.kind],
          )
        ).rowCount
      )
        throw new ConflictException(
          'يوجد طلب قيد المراجعة أو معتمد لهذا النوع',
        );
      const result = await db.query(
        'INSERT INTO professional_applications(user_id,kind,display_name,registration_number,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,status',
        [
          s.user.id,
          input.kind,
          input.displayName,
          input.registrationNumber,
          input.notes,
        ],
      );
      await emit(db, s.user.id, 'VerificationSubmitted', result.rows[0].id, 1);
      await audit(db, s.user.id, 'verification.submitted', null, {
        applicationId: result.rows[0].id,
        kind: input.kind,
      });
      return result.rows[0];
    });
  }
  async decide(
    req: Request,
    id: string,
    input: {
      decision: 'approved' | 'rejected' | 'suspended';
      reason: string;
      version: number;
    },
  ) {
    const s = await requireAdmin(req);
    return transaction(async (db) => {
      const application = (
        await db.query(
          'SELECT * FROM professional_applications WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!application) throw new NotFoundException('الطلب غير موجود');
      if (application.user_id === s.user.id)
        throw new ForbiddenException('لا يمكنك مراجعة طلبك المهني');
      if (
        application.version !== input.version ||
        !(
          (application.status === 'pending' &&
            ['approved', 'rejected'].includes(input.decision)) ||
          (application.status === 'approved' && input.decision === 'suspended')
        )
      )
        throw new ConflictException('تغير الطلب أو أن هذا الانتقال غير مسموح');
      let clinicId = application.clinic_id;
      if (input.decision === 'approved') {
        if (application.kind === 'clinic') {
          clinicId = randomUUID();
          await db.query(
            "INSERT INTO clinics(id,name,created_by,verification_status) VALUES($1,$2,$3,'verified')",
            [clinicId, application.display_name, application.user_id],
          );
          await db.query(
            "INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,ARRAY['clinic_admin'])",
            [application.user_id, clinicId],
          );
        } else
          await db.query(
            "INSERT INTO professional_profiles(user_id,kind,application_id,status) VALUES($1,$2,$3,'verified') ON CONFLICT(user_id,kind) DO UPDATE SET application_id=EXCLUDED.application_id,status='verified'",
            [application.user_id, application.kind, id],
          );
      } else if (input.decision === 'suspended') {
        if (application.kind === 'clinic')
          await db.query(
            "UPDATE clinics SET verification_status='suspended' WHERE id=$1",
            [clinicId],
          );
        else
          await db.query(
            "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1 AND kind=$2",
            [application.user_id, application.kind],
          );
      }
      if (input.decision === 'suspended' && application.kind === 'doctor') {
        await db.query(
          "UPDATE clinic_memberships SET capabilities=array_remove(capabilities,'doctor_member'),revoked_at=CASE WHEN capabilities=ARRAY['doctor_member'] THEN now() ELSE revoked_at END,updated_at=now() WHERE user_id=$1 AND 'doctor_member'=ANY(capabilities)",
          [application.user_id],
        );
        await db.query(
          "UPDATE doctor_affiliations SET status='revoked',updated_at=now() WHERE doctor_id=$1 AND status='approved'",
          [application.user_id],
        );
      }
      const result = await db.query(
        'UPDATE professional_applications SET status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now(),clinic_id=$5,version=version+1 WHERE id=$1 RETURNING id,status,version,clinic_id',
        [id, input.decision, s.user.id, input.reason, clinicId],
      );
      const eventType =
        input.decision === 'approved'
          ? application.kind === 'clinic'
            ? 'ClinicVerificationApproved'
            : application.kind === 'doctor'
              ? 'DoctorVerificationApproved'
              : 'DriverVerificationApproved'
          : input.decision === 'rejected'
            ? 'VerificationRejected'
            : 'ProfessionalSuspended';
      await emit(
        db,
        s.user.id,
        eventType,
        id,
        application.version + 1,
        clinicId,
      );
      await audit(db, s.user.id, `verification.${input.decision}`, clinicId, {
        applicationId: id,
        kind: application.kind,
      });
      return result.rows[0];
    });
  }
  async invite(
    req: Request,
    clinicId: string,
    input: { email: string; capabilities: string[] },
  ) {
    const s = await requireSession(req);
    const result = await transaction(async (db) => {
      await db.query('SELECT id FROM clinics WHERE id=$1 FOR UPDATE', [
        clinicId,
      ]);
      await this.membership(s.user.id, clinicId, 'clinic_admin', db);
      const email = input.email.toLowerCase();
      const member = await db.query(
        'SELECT 1 FROM clinic_memberships m JOIN auth_users u ON u.id=m.user_id WHERE m.clinic_id=$1 AND lower(u.email)=$2 AND m.revoked_at IS NULL',
        [clinicId, email],
      );
      if (member.rowCount) throw new ConflictException('هذا الحساب عضو بالفعل');
      await db.query(
        "UPDATE clinic_invitations SET status='revoked' WHERE clinic_id=$1 AND email=$2 AND status='pending'",
        [clinicId, email],
      );
      const row = (
        await db.query(
          'INSERT INTO clinic_invitations(clinic_id,email,capabilities,invited_by) VALUES($1,$2,$3,$4) RETURNING id,email,expires_at',
          [clinicId, email, input.capabilities, s.user.id],
        )
      ).rows[0];
      await emit(db, s.user.id, 'ClinicInvitationCreated', row.id, 1, clinicId);
      await audit(db, s.user.id, 'organization.invited', clinicId, {
        invitationId: row.id,
        capabilities: input.capabilities,
      });
      return row;
    });
    // Invitation stays visible to its verified recipient even when SMTP delivery fails.
    try {
      await sendMail(
        input.email,
        'Petra — دعوة للانضمام إلى عيادة',
        `لديك دعوة للانضمام إلى فريق عيادة. سجل الدخول ببريدك الموثق ثم راجع الدعوات:\n${origin}/app?invitation=${result.id}`,
      );
      return { ...result, delivery: 'sent' };
    } catch {
      return {
        ...result,
        delivery: 'failed',
        message:
          'حُفظت الدعوة، لكن تعذر إرسال البريد. تظهر للمدعو بعد تسجيل الدخول.',
      };
    }
  }
  async acceptInvitation(req: Request, id: string) {
    const s = await requireSession(req);
    return transaction(async (db) => {
      const locator = (
        await db.query('SELECT clinic_id FROM clinic_invitations WHERE id=$1', [
          id,
        ])
      ).rows[0];
      if (!locator) throw new NotFoundException('الدعوة غير متاحة');
      await db.query('SELECT id FROM clinics WHERE id=$1 FOR UPDATE', [
        locator.clinic_id,
      ]);
      const inv = (
        await db.query(
          'SELECT i.*,c.verification_status FROM clinic_invitations i JOIN clinics c ON c.id=i.clinic_id WHERE i.id=$1 FOR UPDATE OF i',
          [id],
        )
      ).rows[0];
      if (!inv || inv.email !== s.user.email.toLowerCase())
        throw new NotFoundException('الدعوة غير متاحة لهذا الحساب');
      if (
        inv.status !== 'pending' ||
        new Date(inv.expires_at) <= new Date() ||
        inv.verification_status !== 'verified'
      )
        throw new ConflictException('الدعوة منتهية أو غير متاحة');
      await this.membership(inv.invited_by, inv.clinic_id, 'clinic_admin', db);
      await db.query(
        'INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,$3) ON CONFLICT(user_id,clinic_id) DO UPDATE SET capabilities=EXCLUDED.capabilities,revoked_at=NULL,updated_at=now()',
        [s.user.id, inv.clinic_id, inv.capabilities],
      );
      await db.query(
        "UPDATE clinic_invitations SET status='accepted' WHERE id=$1",
        [id],
      );
      await emit(
        db,
        s.user.id,
        'ClinicInvitationAccepted',
        id,
        2,
        inv.clinic_id,
      );
      await audit(
        db,
        s.user.id,
        'organization.invitation_accepted',
        inv.clinic_id,
        { invitationId: id },
      );
      return { status: 'accepted', clinicId: inv.clinic_id };
    });
  }
  async changeMember(
    req: Request,
    clinicId: string,
    userId: string,
    input: { capabilities: string[]; revoke: boolean },
  ) {
    const s = await requireSession(req);
    if (s.user.id === userId)
      throw new ForbiddenException('لا يمكنك تعديل صلاحياتك بنفسك');
    return transaction(async (db) => {
      await db.query('SELECT id FROM clinics WHERE id=$1 FOR UPDATE', [
        clinicId,
      ]);
      await this.membership(s.user.id, clinicId, 'clinic_admin', db);
      const member = (
        await db.query(
          'SELECT capabilities FROM clinic_memberships WHERE clinic_id=$1 AND user_id=$2 AND revoked_at IS NULL FOR UPDATE',
          [clinicId, userId],
        )
      ).rows[0];
      if (!member) throw new NotFoundException('العضو غير موجود');
      if (
        member.capabilities.includes('clinic_admin') &&
        (input.revoke || !input.capabilities.includes('clinic_admin'))
      ) {
        const admins = await db.query(
          "SELECT 1 FROM clinic_memberships WHERE clinic_id=$1 AND revoked_at IS NULL AND 'clinic_admin'=ANY(capabilities)",
          [clinicId],
        );
        if ((admins.rowCount || 0) <= 1)
          throw new ConflictException('لا يمكن إزالة آخر مدير عيادة');
      }
      await db.query(
        'UPDATE clinic_memberships SET capabilities=$3,revoked_at=CASE WHEN $4 THEN now() ELSE NULL END,updated_at=now() WHERE clinic_id=$1 AND user_id=$2',
        [clinicId, userId, input.capabilities, input.revoke],
      );
      if (input.revoke)
        await db.query(
          "UPDATE clinic_invitations SET status='revoked' WHERE clinic_id=$1 AND invited_by=$2 AND status='pending'",
          [clinicId, userId],
        );
      await audit(
        db,
        s.user.id,
        input.revoke
          ? 'organization.membership_revoked'
          : 'organization.permissions_changed',
        clinicId,
        { subjectId: userId, capabilities: input.capabilities },
      );
      return { status: 'updated' };
    });
  }
}
