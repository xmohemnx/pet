import { NextRequest, NextResponse } from 'next/server';
import { sensitivePath } from '../../packages/contracts/src/http-security';
import { isWebPreview, previewResponse } from './lib/web-preview';

export function proxy(request: NextRequest) {
  if (sensitivePath(request.nextUrl.pathname))
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const connections = new Set<string>(["'self'"]);
  const websocket = new URL(process.env.APP_ORIGIN || 'http://127.0.0.1:3000');
  websocket.protocol = websocket.protocol === 'https:' ? 'wss:' : 'ws:';
  if (process.env.APP_ENV === 'local') {
    const api = new URL(process.env.API_BASE_URL || 'http://127.0.0.1:4000');
    if (['127.0.0.1', 'localhost'].includes(api.hostname)) {
      api.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
      connections.add(api.origin);
    }
    if (development) connections.add(websocket.origin);
  } else connections.add(websocket.origin);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self' data:",
    `connect-src ${[...connections].join(' ')}`,
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
  const response =
    previewResponse(request) ?? NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  if (isWebPreview())
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
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
