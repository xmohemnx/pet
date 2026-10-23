import Link from 'next/link';
import type { Product, Storefront } from '@petra/contracts';
import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { IdentityShell } from '../../../../components/identity-shell';
import { StorefrontHeader } from '../../../../components/storefront-header';
import { StoreProductSections } from '../../../../components/store-product-sections';
export const metadata = {
  title: 'متجر العيادة',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const [store, products] = await Promise.all([
    loadApi<Storefront>(`stores/${encodeURIComponent(id)}`),
    loadApi<Product[]>(`stores/${encodeURIComponent(id)}/products`),
  ]);
  return (
    <IdentityShell me={me}>
      <StorefrontHeader store={store} />
      <Link className="button outline" href="/marketplace">
        كل المتاجر والسلة
      </Link>
      <StoreProductSections products={products} clinicId={id} />
    </IdentityShell>
  );
}
