import {
  Injectable,
  Controller,
  Post,
  Patch,
  Req,
  Param,
  Body,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { transaction } from '../database.js';
import { CareService } from '../care/service.js';
import { audit } from '../organizations/service.js';
import { sandbox } from '../finance/ledger.js';
import {
  requireSession,
  requireAdmin,
  parse,
  uuid,
} from '../identity/session.js';
@Injectable()
export class RescueLifecycleService {
  constructor(private readonly care: CareService) {}
  async listing(
    actor: string,
    id: string,
    version: number,
    input?: {
      title: string;
      description: string;
      city: string;
      requirements: string;
    },
  ) {
    return transaction(async (db) => {
      const ref = (
        await db.query(
          'SELECT pet_id FROM adoption_listings WHERE id=$1 AND owner_id=$2',
          [id, actor],
        )
      ).rows[0];
      if (!ref) throw new NotFoundException();
      await this.care.pet(db, actor, ref.pet_id, 'profile', true);
      const listing = (
        await db.query(
          'SELECT * FROM adoption_listings WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!input && listing.status === 'removed') return { status: 'removed' };
      if (
        listing.version !== version ||
        ['adopted', 'removed', 'rejected'].includes(listing.status)
      )
        throw new ConflictException('تغير الإعلان أو أغلق');
      if (
        input &&
        (
          await db.query(
            "SELECT 1 FROM adoption_applications WHERE listing_id=$1 AND status IN ('pending','approved')",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'يوجد طلب تبنٍ جارٍ؛ احسمه قبل تغيير الشروط',
        );
      await db.query(
        "INSERT INTO rescue_content_history(resource_id,kind,actor_id,version,previous_content) VALUES($1,'adoption',$2,$3,$4)",
        [
          id,
          actor,
          listing.version,
          {
            title: listing.title,
            description: listing.description,
            city: listing.city,
            requirements: listing.requirements,
            status: listing.status,
          },
        ],
      );
      if (input)
        await db.query(
          "UPDATE adoption_listings SET title=$2,description=$3,city=$4,requirements=$5,status='pending',version=version+1 WHERE id=$1",
          [id, input.title, input.description, input.city, input.requirements],
        );
      else {
        await db.query(
          "UPDATE adoption_listings SET status='removed',version=version+1 WHERE id=$1",
          [id],
        );
        await db.query(
          "UPDATE adoption_applications SET status='rejected',reason='أغلق صاحب الإعلان طلبات التبني' WHERE listing_id=$1 AND status IN ('pending','approved')",
          [id],
        );
      }
      await audit(
        db,
        actor,
        input ? 'rescue.adoption_resubmitted' : 'rescue.adoption_closed',
        null,
        { listingId: id },
      );
      return { status: input ? 'pending' : 'removed' };
    });
  }
  async campaign(
    actor: string,
    id: string,
    version: number,
    reason: string,
    input?: {
      name: string;
      purpose: string;
      beneficiary: string;
      goalMinor: string;
    },
  ) {
    sandbox();
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(823702)');
      const c = (
        await db.query(
          'SELECT * FROM donation_campaigns WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!c) throw new NotFoundException();
      if (!input && c.status === 'closed') return { status: 'closed' };
      if (c.version !== version || c.status !== 'active')
        throw new ConflictException('تغيرت الحملة أو أغلقت');
      if (
        input &&
        (
          await db.query(
            'SELECT 1 FROM sandbox_donations WHERE campaign_id=$1',
            [id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'شروط حملة تلقت تبرعات محفوظة؛ يمكن إيقاف التبرعات فقط',
        );
      await db.query(
        "INSERT INTO rescue_content_history(resource_id,kind,actor_id,version,previous_content) VALUES($1,'campaign',$2,$3,$4)",
        [
          id,
          actor,
          c.version,
          {
            name: c.name,
            purpose: c.purpose,
            beneficiary: c.beneficiary,
            goalMinor: c.goal_minor,
            status: c.status,
          },
        ],
      );
      if (input)
        await db.query(
          'UPDATE donation_campaigns SET name=$2,purpose=$3,beneficiary=$4,goal_minor=$5,version=version+1 WHERE id=$1',
          [id, input.name, input.purpose, input.beneficiary, input.goalMinor],
        );
      else
        await db.query(
          "UPDATE donation_campaigns SET status='closed',version=version+1 WHERE id=$1",
          [id],
        );
      await audit(
        db,
        actor,
        input ? 'sandbox.campaign_edited' : 'sandbox.campaign_closed',
        null,
        { campaignId: id, reason },
      );
      return { status: input ? 'updated' : 'closed' };
    });
  }
}
const name = z.string().trim().min(2).max(100),
  text = z.string().trim().min(5).max(3000),
  version = z.number().int().positive();
@Controller('api/v1')
export class RescueLifecycleController {
  constructor(private readonly lifecycle: RescueLifecycleService) {}
  @Patch('adoptions/:id') async editListing(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          version,
          title: name,
          description: text,
          city: name,
          requirements: text,
        })
        .strict(),
      b,
    );
    return this.lifecycle.listing(
      (await requireSession(r)).user.id,
      uuid(id),
      i.version,
      i,
    );
  }
  @Post('adoptions/:id/close') async closeListing(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ version }).strict(), b);
    return this.lifecycle.listing(
      (await requireSession(r)).user.id,
      uuid(id),
      i.version,
    );
  }
  @Patch('admin/sandbox/campaigns/:id') async editCampaign(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(
      z
        .object({
          version,
          reason: text.min(10),
          name,
          purpose: text,
          beneficiary: text,
          goalMinor: z.string().regex(/^[1-9]\d{0,11}$/),
        })
        .strict(),
      b,
    );
    return this.lifecycle.campaign(actor, uuid(id), i.version, i.reason, i);
  }
  @Post('admin/sandbox/campaigns/:id/close') async closeCampaign(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const actor = (await requireAdmin(r)).user.id;
    const i = parse(z.object({ version, reason: text.min(10) }).strict(), b);
    return this.lifecycle.campaign(actor, uuid(id), i.version, i.reason);
  }
}
