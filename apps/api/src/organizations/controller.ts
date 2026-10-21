import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { OrganizationService, audit, capabilities } from './service.js';
import {
  requireSession,
  requireAdmin,
  parse,
  uuid,
} from '../identity/session.js';
import { database, transaction } from '../database.js';
const caps = z
  .array(z.enum(capabilities))
  .min(1)
  .max(7)
  .refine((v) => new Set(v).size === v.length);
const name = z.string().trim().min(2).max(100);
@ApiTags('الهوية والعضويات')
@Controller('api/v1')
export class IdentityController {
  constructor(private readonly service: OrganizationService) {}
  @Get('me') me(@Req() req: Request) {
    return this.service.me(req);
  }
  @Get('me/workspaces') async workspaces(@Req() req: Request) {
    const s = await requireSession(req);
    return this.service.workspaces(s.user.id);
  }
  @Post('me/active-workspace') switch(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.service.switchWorkspace(
      req,
      parse(z.object({ workspaceId: z.string().max(100) }).strict(), body)
        .workspaceId,
    );
  }
  @Patch('me') async profile(@Req() req: Request, @Body() body: unknown) {
    const s = await requireSession(req);
    const input = parse(z.object({ name }).strict(), body);
    return transaction(async (db) => {
      await db.query(
        'UPDATE auth_users SET name=$2,"updatedAt"=now() WHERE id=$1',
        [s.user.id, input.name],
      );
      await audit(db, s.user.id, 'identity.profile_updated');
      return { status: 'updated' };
    });
  }
  @Get('me/applications') async applications(@Req() req: Request) {
    const s = await requireSession(req);
    return (
      await database.query(
        'SELECT id,kind,display_name,registration_number,status,clinic_id,review_reason,version,created_at FROM professional_applications WHERE user_id=$1 ORDER BY created_at DESC',
        [s.user.id],
      )
    ).rows;
  }
  @Post('applications') apply(@Req() req: Request, @Body() body: unknown) {
    return this.service.application(
      req,
      parse(
        z
          .object({
            kind: z.enum(['clinic', 'doctor', 'driver']),
            displayName: name,
            registrationNumber: z.string().trim().min(3).max(100),
            notes: z.string().trim().max(1000).default(''),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('me/invitations') async invitations(@Req() req: Request) {
    const s = await requireSession(req);
    return (
      await database.query(
        "SELECT i.id,i.clinic_id,c.name,i.capabilities,i.expires_at FROM clinic_invitations i JOIN clinics c ON c.id=i.clinic_id WHERE i.email=$1 AND i.status='pending' AND i.expires_at>now() AND c.verification_status='verified' ORDER BY i.created_at DESC",
        [s.user.email.toLowerCase()],
      )
    ).rows;
  }
  @Post('invitations/:id/accept') accept(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.service.acceptInvitation(req, uuid(id));
  }
  @Get('clinics/:id') async clinic(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const s = await requireSession(req);
    const clinicId = uuid(id);
    const membership = await this.service.membership(s.user.id, clinicId);
    const branches = (
      await database.query(
        'SELECT id,name,city FROM clinic_branches WHERE clinic_id=$1 ORDER BY created_at',
        [clinicId],
      )
    ).rows;
    return {
      id: clinicId,
      name: membership.name,
      capabilities: membership.capabilities,
      branches,
    };
  }
  @Post('clinics/:id/branches') async branch(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const s = await requireSession(req);
    const clinicId = uuid(id);
    const input = parse(z.object({ name, city: name }).strict(), body);
    return transaction(async (db) => {
      await this.service.membership(s.user.id, clinicId, 'clinic_admin', db);
      const result = await db.query(
        'INSERT INTO clinic_branches(clinic_id,name,city) VALUES($1,$2,$3) RETURNING id,name,city',
        [clinicId, input.name, input.city],
      );
      await audit(db, s.user.id, 'organization.branch_created', clinicId, {
        branchId: result.rows[0].id,
      });
      return result.rows[0];
    });
  }
  @Get('clinics/:id/members') async members(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const s = await requireSession(req);
    const clinicId = uuid(id);
    await this.service.membership(s.user.id, clinicId, 'clinic_admin');
    return (
      await database.query(
        'SELECT u.id,u.name,u.email,m.capabilities FROM clinic_memberships m JOIN auth_users u ON u.id=m.user_id WHERE m.clinic_id=$1 AND m.revoked_at IS NULL ORDER BY u.name',
        [clinicId],
      )
    ).rows;
  }
  @Post('clinics/:id/invitations') invite(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.invite(
      req,
      uuid(id),
      parse(
        z.object({ email: z.email().max(254), capabilities: caps }).strict(),
        body,
      ),
    );
  }
  @Patch('clinics/:id/members/:userId') changeMember(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.service.changeMember(
      req,
      uuid(id),
      uuid(userId),
      parse(
        z
          .object({ capabilities: caps, revoke: z.boolean().default(false) })
          .strict(),
        body,
      ),
    );
  }
  @Get('admin/applications') async queue(@Req() req: Request) {
    await requireAdmin(req);
    return (
      await database.query(
        'SELECT a.id,a.kind,a.display_name,a.registration_number,a.notes,a.status,a.version,a.review_reason,a.created_at,u.name AS applicant FROM professional_applications a JOIN auth_users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100',
      )
    ).rows;
  }
  @Post('admin/applications/:id/decision') decide(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.decide(
      req,
      uuid(id),
      parse(
        z
          .object({
            decision: z.enum(['approved', 'rejected', 'suspended']),
            reason: z.string().trim().min(10).max(1000),
            version: z.number().int().positive(),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('admin/audit') async auditEvents(@Req() req: Request) {
    await requireAdmin(req);
    return (
      await database.query(
        'SELECT id,action,actor_id,clinic_id,occurred_at,details FROM audit_events ORDER BY occurred_at DESC LIMIT 100',
      )
    ).rows;
  }
  @Get('me/affiliations') async affiliations(@Req() req: Request) {
    const s = await requireSession(req);
    return (
      await database.query(
        'SELECT a.id,a.clinic_id,c.name,a.status FROM doctor_affiliations a JOIN clinics c ON c.id=a.clinic_id WHERE a.doctor_id=$1',
        [s.user.id],
      )
    ).rows;
  }
  @Post('me/affiliations') async requestAffiliation(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const s = await requireSession(req);
    const input = parse(z.object({ clinicId: z.uuid() }).strict(), body);
    return transaction(async (db) => {
      if (
        !(
          await db.query(
            "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='doctor' AND status='verified'",
            [s.user.id],
          )
        ).rowCount
      )
        throw new ForbiddenException('هذه العملية متاحة للطبيب المعتمد فقط');
      if (
        !(
          await db.query(
            "SELECT 1 FROM clinics WHERE id=$1 AND verification_status='verified'",
            [input.clinicId],
          )
        ).rowCount
      )
        throw new NotFoundException('العيادة غير متاحة');
      const r = await db.query(
        "INSERT INTO doctor_affiliations(doctor_id,clinic_id) VALUES($1,$2) ON CONFLICT(doctor_id,clinic_id) DO UPDATE SET status='pending',updated_at=now() WHERE doctor_affiliations.status IN ('rejected','revoked') RETURNING id,status",
        [s.user.id, input.clinicId],
      );
      if (!r.rowCount)
        throw new ConflictException('يوجد طلب انتساب قيد المتابعة');
      await audit(
        db,
        s.user.id,
        'organization.affiliation_requested',
        input.clinicId,
        { affiliationId: r.rows[0].id },
      );
      return r.rows[0];
    });
  }
  @Get('clinics/:id/affiliations') async clinicAffiliations(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const s = await requireSession(req);
    const clinicId = uuid(id);
    await this.service.membership(s.user.id, clinicId, 'clinic_admin');
    return (
      await database.query(
        'SELECT a.id,a.status,a.doctor_id,u.name FROM doctor_affiliations a JOIN auth_users u ON u.id=a.doctor_id WHERE a.clinic_id=$1',
        [clinicId],
      )
    ).rows;
  }
  @Post('clinics/:id/affiliations/:affiliationId/decision')
  async decideAffiliation(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('affiliationId') affiliationId: string,
    @Body() body: unknown,
  ) {
    const s = await requireSession(req);
    const clinicId = uuid(id);
    const affiliation = uuid(affiliationId);
    const input = parse(
      z
        .object({ decision: z.enum(['approved', 'rejected', 'revoked']) })
        .strict(),
      body,
    );
    return transaction(async (db) => {
      await db.query('SELECT id FROM clinics WHERE id=$1 FOR UPDATE', [
        clinicId,
      ]);
      await this.service.membership(s.user.id, clinicId, 'clinic_admin', db);
      const a = (
        await db.query(
          'SELECT * FROM doctor_affiliations WHERE id=$1 AND clinic_id=$2 FOR UPDATE',
          [affiliation, clinicId],
        )
      ).rows[0];
      if (!a) throw new NotFoundException('الطلب غير موجود');
      if (!(
        (a.status === 'pending' && input.decision !== 'revoked') ||
        (a.status === 'approved' && input.decision === 'revoked')
      ))
        throw new ConflictException('الانتقال غير متاح');
      if (input.decision === 'approved') {
        if (
          !(
            await db.query(
              "SELECT 1 FROM professional_profiles WHERE user_id=$1 AND kind='doctor' AND status='verified'",
              [a.doctor_id],
            )
          ).rowCount
        )
          throw new ForbiddenException('اعتماد الطبيب غير سارٍ');
        await db.query(
          "INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,ARRAY['doctor_member']) ON CONFLICT(user_id,clinic_id) DO UPDATE SET capabilities=CASE WHEN clinic_memberships.revoked_at IS NOT NULL THEN ARRAY['doctor_member'] ELSE (SELECT ARRAY(SELECT DISTINCT unnest(clinic_memberships.capabilities || ARRAY['doctor_member']))) END,revoked_at=NULL",
          [a.doctor_id, clinicId],
        );
      } else if (input.decision === 'revoked')
        await db.query(
          "UPDATE clinic_memberships SET capabilities=array_remove(capabilities,'doctor_member'),revoked_at=CASE WHEN capabilities=ARRAY['doctor_member'] THEN now() ELSE revoked_at END WHERE user_id=$1 AND clinic_id=$2",
          [a.doctor_id, clinicId],
        );
      await db.query(
        'UPDATE doctor_affiliations SET status=$2,updated_at=now() WHERE id=$1',
        [affiliation, input.decision],
      );
      await audit(
        db,
        s.user.id,
        `organization.affiliation_${input.decision}`,
        clinicId,
        { affiliationId: affiliation },
      );
      return { status: input.decision };
    });
  }
}
