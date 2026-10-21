import type { Product, Storefront } from '@petra/contracts';
import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { ProductDetail } from '../../../../components/product-detail';
export const metadata = {
  title: 'تفاصيل المنتج',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const detail = await loadApi<{ product: Product; variants: Product[] }>(
    `products/${encodeURIComponent(id)}`,
  );
  const store = await loadApi<Storefront>(`stores/${detail.product.clinic_id}`);
  return <ProductDetail me={me} {...detail} store={store} />;
}
