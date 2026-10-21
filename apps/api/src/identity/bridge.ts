import type { Express, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { auth, origin } from './auth.js';
import { database } from '../database.js';
export function registerIdentity(app: Express) {
  app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin !== origin
    )
      return res.status(403).json({
        code: 'INVALID_ORIGIN',
        message: 'مصدر الطلب غير موثوق',
        requestId: randomUUID(),
      });
    next();
  });
  app.all(
    '/api/v1/auth/*splat',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const path = req.path.replace('/api/v1/auth', '');
        if (path === '/sign-up/email') {
          const parsed = z
            .object({
              name: z.string().trim().min(2).max(100),
              email: z.email().max(254),
              password: z.string().min(12).max(128),
              callbackURL: z.string().max(1000).optional(),
            })
            .strict()
            .safeParse(req.body);
          if (!parsed.success)
            return res.status(400).json({
              code: 'INVALID_REGISTRATION',
              message:
                'تحقق من بيانات التسجيل؛ لا يسمح بتحديد أدوار أو صلاحيات',
              requestId: randomUUID(),
            });
          req.body = parsed.data;
        }
        // Trusted-device bypass is deliberately unavailable, especially for administrators.
        if (req.body?.trustDevice === true)
          return res.status(400).json({
            code: 'MFA_REQUIRED',
            message: 'يلزم رمز تحقق جديد عند تسجيل الدخول',
            requestId: randomUUID(),
          });
        if (path === '/two-factor/disable') {
          const s = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
          });
          if (
            s &&
            (
              await database.query(
                'SELECT 1 FROM admin_grants WHERE user_id=$1 AND revoked_at IS NULL',
                [s.user.id],
              )
            ).rowCount
          )
            return res.status(403).json({
              code: 'ADMIN_MFA_REQUIRED',
              message: 'لا يمكن تعطيل التحقق بخطوتين لحساب الإدارة',
              requestId: randomUUID(),
            });
        }
        const authHeaders = fromNodeHeaders(req.headers);
        authHeaders.set(
          'x-petra-client-ip',
          (req.socket.remoteAddress || '127.0.0.1').replace(/^::ffff:/, ''),
        );
        const response = await auth.handler(
          new Request(`${origin}${req.originalUrl}`, {
            method: req.method,
            headers: authHeaders,
            ...(!['GET', 'HEAD'].includes(req.method)
              ? { body: JSON.stringify(req.body ?? {}) }
              : {}),
          }),
        );
        res.status(response.status);
        response.headers.forEach((v, k) => {
          if (!['set-cookie', 'content-length', 'content-encoding'].includes(k))
            res.setHeader(k, v);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        res.send(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        next(error);
      }
    },
  );
}
