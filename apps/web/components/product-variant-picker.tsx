'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';

export function ProductVariantPicker({
  product,
  variants,
  onSelectionChange,
}: {
  product: Product;
  variants: Product[];
  onSelectionChange: (matchesCurrent: boolean) => void;
}) {
  const pickerId = useId();
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (product.variant_attributes ?? []).map((a) => [a.name, a.value]),
    ),
  );
  const axes = new Map<string, Set<string>>();
  for (const v of variants)
    for (const a of v.variant_attributes ?? []) {
      if (!axes.has(a.name)) axes.set(a.name, new Set());
      axes.get(a.name)!.add(a.value);
    }
  if (!axes.size)
    return (
      <div className="care-stack">
        {variants.map((v) => (
          <Link
            className={`button ${v.id === product.id ? 'primary' : 'outline'}`}
            key={v.id}
            href={`/marketplace/products/${v.id}`}
            aria-current={v.id === product.id ? 'page' : undefined}
          >
            {v.variant_label || v.name} · {formatIqd(v.price_minor)} ·{' '}
            {v.available} متاحة
          </Link>
        ))}
      </div>
    );
  const complete = [...axes.keys()].every((name) => !!chosen[name]);
  const match = complete
    ? variants.find(
        (v) =>
          v.variant_attributes?.length === axes.size &&
          v.variant_attributes.every((a) => chosen[a.name] === a.value),
      )
    : undefined;
  return (
    <div className="care-stack care-form">
      {[...axes].map(([name, values], axisIndex) => (
        <div className="care-stack" key={name}>
          <label htmlFor={`${pickerId}-${axisIndex}`}>اختر {name}</label>
          <select
            id={`${pickerId}-${axisIndex}`}
            value={chosen[name] ?? ''}
            onChange={(e) => {
              const next = { ...chosen, [name]: e.target.value };
              const target = variants.find(
                (v) =>
                  v.variant_attributes?.length === axes.size &&
                  v.variant_attributes.every((a) => next[a.name] === a.value),
              );
              onSelectionChange(
                target?.id === product.id ||
                  (!product.parent_product_id &&
                    [...axes.keys()].every((axis) => !next[axis])),
              );
              setChosen(next);
            }}
          >
            <option value="">اختر القيمة</option>
            {[...values].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div aria-live="polite">
        {match ? (
          <Link
            className="button outline"
            href={`/marketplace/products/${match.id}`}
            aria-current={match.id === product.id ? 'page' : undefined}
          >
            عرض هذا الخيار · {formatIqd(match.price_minor)} · {match.available}{' '}
            متاحة
          </Link>
        ) : (
          <p>
            {complete
              ? 'هذه التركيبة غير منشورة أو غير متاحة؛ اختر قيماً أخرى.'
              : 'اختر قيمة لكل بُعد لعرض سعر ومخزون SKU المطابق.'}
          </p>
        )}
      </div>
      {variants
        .filter((v) => !v.parent_product_id)
        .map((v) => (
          <Link
            key={v.id}
            className="text-link"
            href={`/marketplace/products/${v.id}`}
          >
            الخيار الأساسي · {formatIqd(v.price_minor)}
          </Link>
        ))}
    </div>
  );
}
