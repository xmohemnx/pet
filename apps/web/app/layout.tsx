import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { WebPreview } from '../components/web-preview';
import { isWebPreview } from '../lib/web-preview';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/manrope/700.css';
import '@petra/ui/tokens.css';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './redesign.css';
import './social.css';
import './rebuild.css';
import './experience.css';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000'),
  openGraph: { locale: 'ar_IQ', type: 'website', siteName: 'Petra' },
  title: { default: 'Petra — لأنهم جزء من العائلة', template: '%s | Petra' },
  description:
    'Petra لرعاية الحيوانات الأليفة: ملفات خاصة، مواعيد بيطرية، متاجر عيادات ومجتمع وخدمات مترابطة.',
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request rendering lets Next apply the nonce to every executable SSR script.
  await headers();
  return (
    <html lang="ar-IQ" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          انتقل إلى المحتوى
        </a>
        <WebPreview enabled={isWebPreview()}>{children}</WebPreview>
      </body>
    </html>
  );
}
