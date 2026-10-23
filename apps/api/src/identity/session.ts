import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { z } from 'zod';
import { auth } from './auth.js';
import { database } from '../database.js';
import { accountPolicy } from './account-policy.js';
export async function requireSession(req: Pick<Request, 'headers'>) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) throw new UnauthorizedException('سجل الدخول للمتابعة');
  if (!session.user.emailVerified)
    throw new ForbiddenException('أكّد بريدك الإلكتروني أولًا');
  const type = await accountPolicy(session.user.id);
  const path = (req as { originalUrl?: string }).originalUrl ?? '';
  const section = path.match(/^\/api\/v1\/(doctor|driver)(?:\/|$)/)?.[1];
  if (section && section !== type)
    throw new ForbiddenException('هذا القسم غير متاح لنوع حسابك');
  return session;
}
export async function requireAdmin(req: Request) {
  const session = await requireSession(req);
  const result = await database.query(
    'SELECT g.capabilities,GREATEST(g.session_after,u.mfa_session_after) session_after,u."twoFactorEnabled" FROM admin_grants g JOIN auth_users u ON u.id=g.user_id WHERE g.user_id=$1 AND g.revoked_at IS NULL',
    [session.user.id],
  );
  const grant = result.rows[0];
  if (!grant)
    throw new ForbiddenException('هذه العملية تتطلب صلاحية مراجعة إدارية');
  if (
    !grant.twoFactorEnabled ||
    new Date(session.session.createdAt) <= new Date(grant.session_after)
  )
    throw new ForbiddenException(
      'يلزم تفعيل التحقق بخطوتين وتسجيل الدخول من جديد',
    );
  if (!grant.capabilities.includes('verify_professionals'))
    throw new ForbiddenException('الصلاحية الإدارية غير كافية');
  return session;
}
export async function requireFinancialSession(req: Request) {
  const session = await requireSession(req);
  const user = (
    await database.query(
      'SELECT "twoFactorEnabled",mfa_session_after FROM auth_users WHERE id=$1',
      [session.user.id],
    )
  ).rows[0];
  const created = new Date(session.session.createdAt).getTime();
  if (
    !user?.twoFactorEnabled ||
    created <= new Date(user.mfa_session_after).getTime() ||
    Date.now() - created > 30 * 60 * 1000
  )
    throw new ForbiddenException(
      'للاعتماد المالي فعّل التحقق بخطوتين وسجّل الدخول من جديد خلال آخر 30 دقيقة',
    );
  return session;
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'تحقق من الحقول المطلوبة وصيغتها؛ لا يسمح بحقول صلاحيات إضافية',
    );
  return result.data;
}
export function uuid(value: string) {
  return parse(z.uuid(), value);
}
