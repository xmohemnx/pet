import type { MetadataRoute } from 'next';
import { isWebPreview } from '../lib/web-preview';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';
  if (isWebPreview()) return [];
  let pages: { slug: string }[] = [];
  try {
    const r = await fetch(
      `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/api/v1/content/pages`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
    if (r.ok) pages = await r.json();
  } catch {
    pages = [];
  }
  return [
    { url: origin, changeFrequency: 'weekly', priority: 1 },
    ...pages
      .filter((p) => /^[a-z0-9-]{1,60}$/.test(p.slug))
      .map((p) => ({
        url: `${origin}/content/${p.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
  ];
}
