import { notFound } from 'next/navigation';
import { privateApi } from './server-identity';
export async function loadApi<T>(path: string): Promise<T> {
  const r = await privateApi(path);
  if ([400, 403, 404].includes(r.status)) notFound();
  if (!r.ok) throw new Error('تعذر تحميل بيانات الصفحة');
  return r.json() as Promise<T>;
}
