import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { PublicSafetyCard } from '@petra/contracts';
const speciesLabels: Record<string, string> = {
  cat: 'قط',
  dog: 'كلب',
  bird: 'طائر',
  rabbit: 'أرنب',
  other: 'آخر',
};
export const metadata = {
  title: 'بطاقة سلامة',
  robots: { index: false, follow: false, nosnippet: true, noarchive: true },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const response = await fetch(
    `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/api/v1/public/safety/${token}`,
    { cache: 'no-store', signal: AbortSignal.timeout(5000) },
  );
  if ([400, 404].includes(response.status)) notFound();
  if (!response.ok) throw new Error('تعذر تحميل بطاقة السلامة');
  const card = (await response.json()) as PublicSafetyCard;
  return (
    <main id="main" className="auth-page">
      <section className="panel care-section">
        <p className="eyebrow">Petra · بطاقة سلامة</p>
        <h1>{card.pet_name}</h1>
        <p>{speciesLabels[card.species] ?? card.species}</p>
        <p>{card.message}</p>
        <h2>الاتصال الذي اختاره المالك</h2>
        <p>{card.contact_name}</p>
        <a
          className="button primary"
          href={`tel:${card.contact_phone.replace(/[^+0-9]/g, '')}`}
        >
          {card.contact_phone}
        </a>
        <p>
          هذه البطاقة تعرض بيانات اتصال منشورة بإذن المالك، ولا تتيح الوصول إلى
          سجله الطبي.
        </p>
        <Link className="text-link" href="/">
          Petra
        </Link>
      </section>
    </main>
  );
}
