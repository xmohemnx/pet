import type { Express, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { sensitivePath } from '../../../packages/contracts/src/http-security.js';
import { origin } from './identity/auth.js';
import { requireSession } from './identity/session.js';
import { database } from './database.js';

const MEDIA_LIMIT = 28 * 1024 * 1024;
let activeUploads = 0;
export function registerRequestSecurity(app: Express) {
  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    if (sensitivePath(req.originalUrl.split('?')[0]!))
      return res.status(404).end();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== origin)
        return res.status(403).json({ code: 'INVALID_ORIGIN' });
      const max = req.path === '/api/v1/media' ? MEDIA_LIMIT : 32 * 1024;
      if (Number(req.headers['content-length'] ?? 0) > max)
        return res.status(413).json({ code: 'BODY_TOO_LARGE' });
      if (
        req.headers['content-encoding'] &&
        req.headers['content-encoding'] !== 'identity'
      )
        return res.status(415).json({ code: 'UNSUPPORTED_ENCODING' });
    }
    next();
  });
  // Authenticate and charge attempts before JSON parsing, image decoding or disk I/O.
  app.post('/api/v1/media', async (req, res, next) => {
    try {
      const session = await requireSession(req);
      const attempt = await database.query(
        `INSERT INTO media_upload_limits(user_id,window_started_at,attempts)
         VALUES($1,now(),1)
         ON CONFLICT(user_id) DO UPDATE SET
           attempts=CASE WHEN media_upload_limits.window_started_at<=now()-interval '60 seconds'
             THEN 1 ELSE LEAST(media_upload_limits.attempts+1,6) END,
           window_started_at=CASE WHEN media_upload_limits.window_started_at<=now()-interval '60 seconds'
             THEN now() ELSE media_upload_limits.window_started_at END
         RETURNING attempts`,
        [session.user.id],
      );
      if (attempt.rows[0].attempts > 5 || activeUploads >= 2) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ code: 'UPLOAD_RATE_LIMIT' });
      }
      activeUploads++;
      let released = false;
      const release = () => {
        if (!released) activeUploads--;
        released = true;
      };
      res.once('finish', release);
      res.once('close', release);
      next();
    } catch (error) {
      const status =
        error instanceof Error && 'getStatus' in error
          ? (error as { getStatus(): number }).getStatus()
          : 503;
      res
        .status(status)
        .json({ code: `HTTP_${status}`, requestId: randomUUID() });
    }
  });
}
