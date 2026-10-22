import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { transaction } from '../database.js';
import { requireSession, parse, uuid } from '../identity/session.js';
import { audit } from '../organizations/service.js';

const coordinate = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((n) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 0.00001);
const input = z
  .object({
    originLat: coordinate(29, 38),
    originLng: coordinate(38, 49),
    destinationLat: coordinate(29, 38),
    destinationLng: coordinate(38, 49),
    consent: z.literal(true),
    idempotencyKey: z.uuid(),
  })
  .strict();
type RouteInput = z.infer<typeof input>;
export function routingEndpoint() {
  try {
    const value =
      process.env.OSRM_ENDPOINT ||
      (process.env.APP_ENV === 'local'
        ? 'https://router.project-osrm.org'
        : '');
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol !== 'https:' &&
        !(
          process.env.APP_ENV === 'local' &&
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname)
        ))
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
const publicQuote = (q: Record<string, unknown>) => ({
  id: q.id,
  metres: q.metres,
  seconds: q.seconds,
  fareMinor: String(q.fare_minor),
  geometry: q.geometry,
  expiresAt: q.expires_at,
  mode: 'sandbox',
  provider: 'OSRM',
});
async function fetchRoute(i: RouteInput) {
  const endpoint = routingEndpoint();
  if (!endpoint) throw new ServiceUnavailableException('لم تضبط خدمة المسارات');
  const path = `/route/v1/driving/${i.originLng},${i.originLat};${i.destinationLng},${i.destinationLat}?overview=full&geometries=geojson&steps=false&alternatives=false`;
  let response: Response;
  try {
    response = await fetch(new URL(path, endpoint), {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Petra/road-routing',
      },
    });
    if (!response.ok || !response.body) throw new Error('unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1024 * 1024) throw new Error('response bound');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.code === 'NoRoute')
      throw new BadRequestException('لا يوجد مسار طرق صالح بين النقطتين');
    const route = result.routes?.[0];
    const points = route?.geometry?.coordinates;
    if (
      result.code !== 'Ok' ||
      !Number.isFinite(route?.distance) ||
      route.distance < 1 ||
      route.distance > 100000 ||
      !Number.isFinite(route.duration) ||
      route.duration < 1 ||
      route.duration > 86400 ||
      route.geometry.type !== 'LineString' ||
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 10000 ||
      !points.every(
        (p: unknown) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90,
      )
    )
      throw new Error('invalid route');
    const stride = Math.ceil(points.length / 1999);
    const geometry = {
      type: 'LineString',
      coordinates: points.filter(
        (_: unknown, n: number) => n % stride === 0 || n === points.length - 1,
      ),
    };
    return {
      metres: Math.ceil(route.distance),
      seconds: Math.ceil(route.duration),
      geometry,
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new ServiceUnavailableException(
      'تعذر الحصول على مسار طرق؛ أعد المحاولة لاحقاً',
    );
  }
}
function replayQuote(old: Record<string, unknown>, i: RouteInput) {
  if (
    Number(old.origin_lat) !== i.originLat ||
    Number(old.origin_lng) !== i.originLng ||
    Number(old.destination_lat) !== i.destinationLat ||
    Number(old.destination_lng) !== i.destinationLng
  )
    throw new ConflictException('تغير محتوى الطلب المعاد');
  if (new Date(String(old.expires_at)).getTime() <= Date.now())
    throw new ConflictException('انتهت صلاحية المسار؛ اطلب مساراً جديداً');
  return publicQuote(old);
}
@Injectable()
export class RoutingService {
  settings() {
    const endpoint = routingEndpoint();
    return {
      enabled: !!endpoint,
      provider: 'OSRM',
      providerHost: endpoint?.host ?? null,
      consentRequired: true,
      mode: 'sandbox',
    };
  }
  async quote(actor: string, i: RouteInput) {
    const previous = await transaction(
      async (db) =>
        (
          await db.query(
            'SELECT * FROM ride_route_quotes WHERE user_id=$1 AND idempotency_key=$2',
            [actor, i.idempotencyKey],
          )
        ).rows[0],
    );
    if (previous) return replayQuote(previous, i);
    // Charge the attempt in a separate transaction so provider failures cannot bypass limits.
    await transaction(async (rate) => {
      await rate.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `road-attempts:${actor}`,
      ]);
      const count = (
        await rate.query(
          "SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute')::int recent,count(*)::int daily FROM ride_route_attempts WHERE user_id=$1 AND created_at>now()-interval '1 day'",
          [actor],
        )
      ).rows[0];
      if (count.recent >= 5 || count.daily >= 50)
        throw new HttpException('انتظر قبل طلب مسار آخر', 429);
      await rate.query('INSERT INTO ride_route_attempts(user_id) VALUES($1)', [
        actor,
      ]);
    });
    return transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `road-quotes:${actor}`,
      ]);
      const old = (
        await db.query(
          'SELECT * FROM ride_route_quotes WHERE user_id=$1 AND idempotency_key=$2',
          [actor, i.idempotencyKey],
        )
      ).rows[0];
      if (old) return replayQuote(old, i);
      const route = await fetchRoute(i);
      const fare =
        5000000n +
        BigInt(Math.max(1, Math.ceil(route.metres / 1000))) * 1000000n;
      const q = (
        await db.query(
          'INSERT INTO ride_route_quotes(user_id,idempotency_key,origin_lat,origin_lng,destination_lat,destination_lng,metres,seconds,fare_minor,geometry) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [
            actor,
            i.idempotencyKey,
            i.originLat,
            i.originLng,
            i.destinationLat,
            i.destinationLng,
            route.metres,
            route.seconds,
            fare.toString(),
            JSON.stringify(route.geometry),
          ],
        )
      ).rows[0];
      await audit(db, actor, 'taxi.route_quoted', null, { quoteId: q.id });
      return publicQuote(q);
    });
  }
  async route(actor: string, id: string) {
    return transaction(async (db) => {
      const row = (
        await db.query(
          "SELECT q.* FROM rides r JOIN ride_route_quotes q ON q.id=r.route_quote_id WHERE r.id=$1 AND (r.user_id=$2 OR (r.driver_id=$2 AND EXISTS(SELECT 1 FROM professional_profiles p WHERE p.user_id=$2 AND p.kind='driver' AND p.status='verified')))",
          [id, actor],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return publicQuote(row);
    });
  }
}
@Controller('api/v1')
export class RoutingController {
  constructor(private readonly service: RoutingService) {}
  @Get('taxi/routing') async settings(@Req() r: Request) {
    await requireSession(r);
    return this.service.settings();
  }
  @Post('taxi/route-quotes') async quote(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.service.quote(
      (await requireSession(r)).user.id,
      parse(input, b),
    );
  }
  @Get('rides/:id/route') async route(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    return this.service.route((await requireSession(r)).user.id, uuid(id));
  }
}
export async function expireRoadQuotes() {
  return transaction(async (db) => {
    await db.query(
      "DELETE FROM ride_route_attempts WHERE created_at<now()-interval '1 day'",
    );
    return (
      (
        await db.query(
          'DELETE FROM ride_route_quotes q WHERE expires_at<now() AND NOT EXISTS(SELECT 1 FROM rides r WHERE r.route_quote_id=q.id)',
        )
      ).rowCount ?? 0
    );
  });
}
