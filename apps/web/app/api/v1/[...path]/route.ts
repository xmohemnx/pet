import type { NextRequest } from 'next/server';
import { BodyError, readLimitedBody } from '../../../../lib/http-body';
export const dynamic = 'force-dynamic';
let uploads = 0;
const uploadAttempts = new Map<string, { until: number; count: number }>();
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const deny = (status: number) =>
    Response.json(
      { message: 'تعذر قبول الطلب' },
      {
        status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  if (path.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment)))
    return deny(404);
  const writes = !['GET', 'HEAD'].includes(request.method);
  if (
    writes &&
    request.headers.get('origin') !==
      (process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000')
  )
    return deny(403);
  const url = `${process.env.API_BASE_URL || 'http://127.0.0.1:4000'}/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const key of ['content-type', 'cookie', 'origin', 'user-agent']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  let admitted = false;
  try {
    if (request.method === 'POST' && path.length === 1 && path[0] === 'media') {
      // Check the real session upstream before buffering a potentially large file.
      const sessionResponse = await fetch(
        new URL(
          'auth/get-session',
          `${process.env.API_BASE_URL || 'http://127.0.0.1:4000'}/api/v1/`,
        ),
        {
          headers: { cookie: request.headers.get('cookie') ?? '' },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!sessionResponse.ok) return deny(401);
      const session = await sessionResponse.json();
      if (!session?.user?.id) return deny(401);
      if (!session.user.emailVerified) return deny(403);
      const now = Date.now();
      for (const [key, limit] of uploadAttempts)
        if (limit.until <= now) uploadAttempts.delete(key);
      const limit = uploadAttempts.get(session.user.id) ?? {
        until: now + 60000,
        count: 0,
      };
      if (uploads >= 2 || limit.count >= 5 || uploadAttempts.size >= 5000)
        return deny(429);
      limit.count++;
      uploadAttempts.set(session.user.id, limit);
      uploads++;
      admitted = true;
    }
    const response = await fetch(url, {
      method: request.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      ...(!['GET', 'HEAD'].includes(request.method)
        ? {
            body: await readLimitedBody(
              request,
              path.length === 1 && path[0] === 'media'
                ? 28 * 1024 * 1024
                : 32 * 1024,
            ),
          }
        : {}),
    });
    const out = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of ['content-type', 'location', 'retry-after']) {
      const value = response.headers.get(key);
      if (value) out.set(key, value);
    }
    for (const cookie of response.headers.getSetCookie())
      out.append('set-cookie', cookie);
    return new Response(
      [204, 304].includes(response.status)
        ? null
        : await response.arrayBuffer(),
      { status: response.status, headers: out },
    );
  } catch (error) {
    if (error instanceof BodyError) return deny(error.status);
    return Response.json(
      { message: 'تعذر الاتصال بالخدمة، حاول مجددًا بعد قليل' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    if (admitted) uploads--;
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
