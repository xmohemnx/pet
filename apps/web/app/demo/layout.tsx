import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'استكشاف التصميم',
  robots: { index: false, follow: false },
};
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.PETRA_DEMO_MODE !== 'true') notFound();
  return children;
}
