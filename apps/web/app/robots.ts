import type { MetadataRoute } from 'next';
import { isWebPreview } from '../lib/web-preview';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow:
        !isWebPreview() && process.env.APP_ENV === 'production'
          ? [
              '/api/',
              '/app',
              '/care',
              '/clinic/',
              '/admin/',
              '/social',
              '/services',
              '/taxi',
              '/driver',
              '/notifications',
              '/security',
              '/demo/',
              '/login',
              '/register',
              '/recover',
              '/reset-password',
            ]
          : '/',
    },
    sitemap: `${process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000'}/sitemap.xml`,
  };
}
