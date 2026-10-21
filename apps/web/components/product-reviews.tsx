'use client';
import { useState } from 'react';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import { mutate } from './platform-shared';
export function ProductReviews({
  productId,
  lineId,
}: {
  productId: string;
  lineId?: string;
}) {
  const [reviews, setReviews] = useState<
    { id: string; name: string; rating: number; body: string }[] | null
  >(null);
  async function refresh() {
    setReviews(
      await api<NonNullable<typeof reviews>>(`products/${productId}/reviews`),
    );
  }
  return (
    <details className="product-reviews">
      <summary>{lineId ? 'تقييم شراء موثق' : 'تقييمات المشترين'}</summary>
      <CareAction action={refresh}>عرض التقييمات الموثقة</CareAction>
      {reviews?.map((r) => (
        <p key={r.id}>
          <strong>
            {r.name} · {r.rating}/5
          </strong>
          <br />
          {r.body}
        </p>
      ))}
      {reviews?.length === 0 && <p>لا تقييمات بعد.</p>}
      {lineId && (
        <CareForm
          label="نشر تقييم الشراء"
          submit={async (f) => {
            await mutate(`products/${productId}/reviews`, {
              orderLineId: lineId,
              rating: Number(f.get('rating')),
              body: f.get('body'),
            });
            await refresh();
          }}
        >
          <label>
            تقييمك من 1 إلى 5
            <input name="rating" type="number" min="1" max="5" required />
          </label>
          <label>
            رأيك المنشور باسم حسابك
            <textarea name="body" minLength={5} maxLength={3000} required />
          </label>
        </CareForm>
      )}
    </details>
  );
}
