import { NextRequest, NextResponse } from 'next/server';
import { sensitivePath } from '../../packages/contracts/src/http-security';

export function proxy(request: NextRequest) {
  if (sensitivePath(request.nextUrl.pathname))
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
  const headers = new Headers(request.headers);
  // Overwrite client-supplied nonce/CSP; Next reads this header for its SSR scripts.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  if (request.nextUrl.pathname.startsWith('/safety/')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set(
      'X-Robots-Tag',
      'noindex, nofollow, noarchive, nosnippet',
    );
  }
  if (process.env.APP_ENV === 'production')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
