'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { formatIqd, type Product } from '@petra/contracts';
import { StoreDepartments } from './store-departments';
export function StoreProductSections({
  products,
  clinicId,
}: {
  products: Product[];
  clinicId: string;
}) {
  const [results, setResults] = useState<Product[] | null>(null);
  const visible = (results ?? products).filter((p) => p.clinic_id === clinicId);
  return (
    <>
      <StoreDepartments clinicId={clinicId} onResults={setResults} />
      <div className="market-products">
        {visible.map((p) => (
          <article key={p.id} className="panel market-card">
            <h2>
              <Link href={`/marketplace/products/${p.id}`}>{p.name}</Link>
            </h2>
            <p>{p.variant_label}</p>
            <p>
              {formatIqd(p.price_minor)} · {p.available} {p.unit} متاحة
            </p>
            <Link
              className="button outline"
              href={`/marketplace/products/${p.id}`}
            >
              <ShoppingBag size={18} aria-hidden="true" />
              تفاصيل المنتج
            </Link>
          </article>
        ))}
      </div>
      {!visible.length && <p role="status">لا منتجات منشورة في هذا القسم.</p>}
    </>
  );
}
