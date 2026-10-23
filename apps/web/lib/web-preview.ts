import { NextResponse } from 'next/server';

export const isWebPreview = () => process.env.PETRA_WEB_PREVIEW === 'true';

export function previewResponse(request: {
  method: string;
  url: string;
  nextUrl: { pathname: string };
}) {
  if (!isWebPreview()) return null;
  const path = request.nextUrl.pathname;
  const headers = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
  if (path === '/api' || path.startsWith('/api/'))
    return NextResponse.json(
      { message: 'هذه معاينة للواجهة؛ العمليات غير متاحة حالياً.' },
      { status: 503, headers },
    );
  if (/^\/(demo|safety)(\/|$)/.test(path))
    return new NextResponse(null, { status: 404, headers });
  if (!['GET', 'HEAD'].includes(request.method))
    return new NextResponse(null, {
      status: 405,
      headers: { ...headers, Allow: 'GET, HEAD' },
    });
  if (
    [
      '/',
      '/login',
      '/register',
      '/recover',
      '/reset-password',
      '/preview',
      '/robots.txt',
      '/sitemap.xml',
      '/pet-garden.svg',
      '/favicon.ico',
    ].includes(path) ||
    path.startsWith('/_next/') ||
    /^\/images\/(companions|companion|care|essentials)\.png$/.test(path)
  )
    return null;
  return NextResponse.redirect(new URL('/preview', request.url), {
    status: 307,
    headers,
  });
}
