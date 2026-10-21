import Link from 'next/link';
import { notFound } from 'next/navigation';
import { privateApi } from '../../../lib/server-identity';
import { Brand } from '../../../components/brand';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await privateApi(`content/pages/${encodeURIComponent(slug)}`);
  if (!r.ok) notFound();
  const page = (await r.json()) as { title: string; body: string };
  return (
    <>
      <header className="real-header">
        <Brand />
        <Link href="/">الرئيسية</Link>
      </header>
      <main id="main" className="real-main prose-page">
        <h1>{page.title}</h1>
        <p>{page.body}</p>
      </main>
    </>
  );
}
