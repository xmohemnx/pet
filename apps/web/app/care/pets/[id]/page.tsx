import { notFound } from 'next/navigation';
import { loadIdentity, privateApi } from '../../../../lib/server-identity';
import { PetDetail } from '../../../../components/pet-detail';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'ملف الحيوان',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity();
  const { id } = await params;
  const r = await privateApi(`pets/${encodeURIComponent(id)}`);
  if (r.status === 404 || r.status === 400) notFound();
  if (!r.ok) throw new Error('تعذر تحميل الملف');
  const slots = await privateApi('care/slots');
  if (!slots.ok) throw new Error('تعذر تحميل المواعيد');
  return (
    <PetDetail me={me} initial={await r.json()} slots={await slots.json()} />
  );
}
