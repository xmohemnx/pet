import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { identityMeSchema } from '@petra/contracts';
export async function privateApi(path: string) {
  return fetch(
    `${process.env.API_BASE_URL || 'http://127.0.0.1:4000'}/api/v1/${path}`,
    {
      headers: { cookie: (await cookies()).toString() },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    },
  );
}
export async function loadIdentity() {
  const result = await privateApi('me');
  if (result.status === 401 || result.status === 403) redirect('/login');
  if (!result.ok) throw new Error('تعذر تحميل الحساب');
  return identityMeSchema.parse(await result.json());
}
