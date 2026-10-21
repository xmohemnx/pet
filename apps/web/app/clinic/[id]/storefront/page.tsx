import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { StorefrontSettings } from '../../../../components/storefront-settings';
import type { Storefront } from '@petra/contracts';
export const metadata = {
  title: 'إعدادات المتجر',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const initial = await loadApi<Storefront>(
    `clinics/${encodeURIComponent(id)}/storefront`,
  );
  return <StorefrontSettings me={me} initial={initial} />;
}
