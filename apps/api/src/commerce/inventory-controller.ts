import { Controller, Get, Post, Req, Body, Param } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  requireSession,
  requireFinancialSession,
  parse,
  uuid,
} from '../identity/session.js';
import { InventoryService } from './inventory.js';
const quantity = z.number().int().min(1).max(10000),
  reason = z.string().trim().min(10).max(1000);
@Controller('api/v1/clinics/:id')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get('inventory') async list(@Req() r: Request, @Param('id') id: string) {
    return this.inventory.dashboard(
      (await requireSession(r)).user.id,
      uuid(id),
    );
  }
  @Post('warehouses') async warehouse(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          name: z.string().trim().min(1).max(100),
          branchId: z.uuid().optional(),
        })
        .strict(),
      b,
    );
    return this.inventory.warehouse(
      (await requireSession(r)).user.id,
      uuid(id),
      i.name,
      i.branchId,
    );
  }
  @Post('purchases/:poId/receipts') async receive(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('poId') po: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          idempotencyKey: z.uuid(),
          quantity,
          warehouseId: z.uuid(),
          batchCode: z.string().trim().max(100),
          expiresOn: z.iso.date().nullable(),
        })
        .strict(),
      b,
    );
    return this.inventory.receive(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(po),
      i,
    );
  }
  @Post('inventory/:layerId/quarantine') async quarantine(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('layerId') layer: string,
    @Body() b: unknown,
  ) {
    const i = parse(z.object({ quarantined: z.boolean(), reason }).strict(), b);
    return this.inventory.quarantine(
      (await requireSession(r)).user.id,
      uuid(id),
      uuid(layer),
      i.quarantined,
      i.reason,
    );
  }
  @Post('inventory/transfers') async transfer(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          layerId: z.uuid(),
          warehouseId: z.uuid(),
          quantity,
          idempotencyKey: z.uuid(),
        })
        .strict(),
      b,
    );
    return this.inventory.transfer(
      (await requireSession(r)).user.id,
      uuid(id),
      i,
    );
  }
  @Post('inventory/writeoffs') async request(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z
        .object({
          layerId: z.uuid(),
          quantity,
          reason,
          idempotencyKey: z.uuid(),
        })
        .strict(),
      b,
    );
    return this.inventory.requestWriteoff(
      (await requireSession(r)).user.id,
      uuid(id),
      i,
    );
  }
  @Post('inventory/writeoffs/:requestId/decision') async decide(
    @Req() r: Request,
    @Param('id') id: string,
    @Param('requestId') rid: string,
    @Body() b: unknown,
  ) {
    const i = parse(
      z.object({ decision: z.enum(['approved', 'rejected']) }).strict(),
      b,
    );
    return this.inventory.decide(
      (await requireFinancialSession(r)).user.id,
      uuid(id),
      uuid(rid),
      i.decision,
    );
  }
}
