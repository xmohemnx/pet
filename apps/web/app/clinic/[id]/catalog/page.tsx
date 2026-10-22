import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import {
  CatalogTaxonomy,
  type Category,
} from '../../../../components/catalog-taxonomy';
import type { Product } from '@petra/contracts';
export const metadata = {
  title: 'التصنيفات والوسوم',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadIdentity(),
    { id } = await params;
  const [categories, data] = await Promise.all([
    loadApi<Category[]>(`clinics/${encodeURIComponent(id)}/categories`),
    loadApi<{ products: Product[] }>(
      `clinics/${encodeURIComponent(id)}/commerce`,
    ),
  ]);
  return (
    <CatalogTaxonomy
      me={me}
      clinicId={id}
      initial={categories}
      products={data.products}
    />
  );
}
