'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { IdentityMe, Product, Storefront } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { PlatformHeading, SandboxNotice } from './platform-shared';
import { ProductReviews } from './product-reviews';
import { CareForm } from './care-shared';
import { api } from '../lib/auth-client';
import { ProductVariantPicker } from './product-variant-picker';
export function ProductDetail({
  me,
  product: p,
  variants,
  store,
}: {
  me: IdentityMe;
  product: Product;
  variants: Product[];
  store: Storefront;
}) {
  const [canAdd, setCanAdd] = useState(true);
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={p.store_name ?? p.clinic_name} title={p.name}>
        {p.description}
      </PlatformHeading>
      <SandboxNotice />
      <div className="inline-actions">
        <Link className="button outline" href="/marketplace">
          السوق والسلة
        </Link>
        <Link
          className="button outline"
          href={`/marketplace/stores/${p.clinic_id}`}
        >
          متجر {store.display_name}
        </Link>
      </div>
      <div className="care-columns">
        <section className="panel care-section">
          <h2>صور ومواصفات</h2>
          <div className="catalog-gallery">
            {p.images?.map((x) => (
              <img
                key={x.asset_id}
                src={`/api/v1/media/${x.asset_id}/file`}
                alt={x.alt}
              />
            ))}
          </div>
          <p>
            {p.brand} · {p.category} · {p.age_suitability}
          </p>
          <p>
            SKU: {p.sku} · {p.barcode}
          </p>
          <dl>
            {p.classification && (
              <div>
                <dt>التصنيف المتسلسل</dt>
                <dd>{p.classification.path.join(' / ')}</dd>
              </div>
            )}
            {!!p.tags?.length && (
              <div>
                <dt>الوسوم</dt>
                <dd>{p.tags.join(' · ')}</dd>
              </div>
            )}
            {p.variant_attributes?.map((a) => (
              <div key={a.name}>
                <dt>{a.name}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
            {p.specifications?.map((x, n) => (
              <div key={n}>
                <dt>{x.name}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
          </dl>
          <ProductReviews productId={p.id} />
        </section>
        <aside className="care-stack">
          <section className="panel care-section">
            <h2>اختر المقاس أو الخيار</h2>
            <ProductVariantPicker
              key={p.id}
              product={p}
              variants={variants}
              onSelectionChange={setCanAdd}
            />
            <strong>{formatIqd(p.price_minor)}</strong>
            <p>
              {p.available} {p.unit} متاحة لهذا الخيار
            </p>
            {canAdd ? (
              <CareForm
                label="إضافة الخيار للسلة"
                submit={async (f) => {
                  const cart =
                    await api<{ product_id: string; quantity: number }[]>(
                      'me/cart',
                    );
                  const quantity = Number(f.get('quantity'));
                  const old = cart.find((x) => x.product_id === p.id);
                  const items = cart
                    .filter((x) => x.product_id !== p.id)
                    .map((x) => ({
                      productId: x.product_id,
                      quantity: x.quantity,
                    }));
                  items.push({
                    productId: p.id,
                    quantity: quantity + (old?.quantity ?? 0),
                  });
                  await api('me/cart', {
                    method: 'POST',
                    body: JSON.stringify({ items }),
                  });
                }}
              >
                <label>
                  كمية {p.name}
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={Math.min(10000, p.available)}
                    defaultValue={p.available ? 1 : 0}
                    required
                  />
                </label>
              </CareForm>
            ) : (
              <p role="status">
                افتح صفحة الخيار المطابق أولاً لإضافته إلى السلة بسعره ومخزونه.
              </p>
            )}
          </section>
          <section className="panel care-section">
            <h2>التسليم والإرجاع</h2>
            <p className="store-policies">
              {store.delivery_policy || 'سياسة التسليم لم تحدد بعد'}
            </p>
            <p className="store-policies">
              {store.return_policy || 'سياسة الإرجاع لم تحدد بعد'}
            </p>
          </section>
        </aside>
      </div>
    </IdentityShell>
  );
}
