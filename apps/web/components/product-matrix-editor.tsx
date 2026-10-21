'use client';
import { useRef, useState } from 'react';
import type { Product, VariantDimension } from '@petra/contracts';
import { variantMatrix } from '@petra/contracts';
import { CareForm } from './care-shared';
import { api } from '../lib/auth-client';

export function ProductMatrixEditor({
  product: p,
  clinicId,
  hasVariants,
  refresh,
}: {
  product: Product;
  clinicId: string;
  hasVariants: boolean;
  refresh: () => Promise<void>;
}) {
  const [axes, setAxes] = useState([
    { name: '', values: '' },
    { name: '', values: '' },
    { name: '', values: '' },
  ]);
  const [prefix, setPrefix] = useState(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(p.sku ?? '')
      ? p.sku!
      : `PET-${p.id.slice(0, 8)}`,
  );
  const keys = useRef(new Map<string, string>());
  const dimensions = (): VariantDimension[] =>
    axes
      .filter((a) => a.name.trim() || a.values.trim())
      .map((a) => ({ name: a.name, values: a.values.split(/[|،,\n]/) }));
  let preview: ReturnType<typeof variantMatrix> | null = null,
    error = '';
  try {
    preview = variantMatrix(dimensions());
  } catch (e) {
    error = e instanceof Error ? e.message : 'راجع الخيارات';
  }
  if (p.parent_product_id) return null;
  if (p.matrix_dimensions)
    return (
      <p>
        مصفوفة ثابتة: {p.matrix_dimensions.map((d) => d.name).join(' · ')}. عدّل
        سعر ونشر كل SKU من قائمته؛ التعريف ثابت.
      </p>
    );
  if (hasVariants)
    return (
      <p>
        هذه العائلة لها خيارات سابقة؛ استخدم منتجاً أصلياً جديداً لإنشاء مصفوفة،
        دون نقل مخزونها.
      </p>
    );
  return (
    <details>
      <summary>إنشاء خيارات اللون والمقاس دفعة واحدة</summary>
      <p>
        حتى ثلاثة أبعاد وثماني قيم لكل بُعد و64 تركيبة. كل SKU جديد مخفي وبرصيد
        صفر؛ استلم مخزونه من المشتريات ثم انشره. السعر قابل للتعديل لكل خيار بعد
        الإنشاء. لا تُنسخ الصور أو موافقة نشرها.
      </p>
      <CareForm
        label="إنشاء التركيبات المخفية"
        submit={async (f) => {
          const validated = variantMatrix(dimensions());
          const input = {
            version: p.version,
            skuPrefix: prefix,
            priceMinor: String(f.get('price')),
            costMinor: String(f.get('cost')),
            dimensions: validated.dimensions,
          };
          const signature = JSON.stringify(input),
            key = keys.current.get(signature) ?? crypto.randomUUID();
          keys.current.set(signature, key);
          await api(`clinics/${clinicId}/products/${p.id}/variant-matrix`, {
            method: 'POST',
            body: JSON.stringify({ ...input, idempotencyKey: key }),
          });
          await refresh();
          keys.current.delete(signature);
        }}
      >
        {axes.map((axis, i) => (
          <div key={i} className="care-section">
            <label>
              اسم البُعد {i + 1}
              {i ? ' (اختياري)' : ''}
              <input
                value={axis.name}
                maxLength={30}
                required={i === 0}
                onChange={(e) =>
                  setAxes(
                    axes.map((a, n) =>
                      n === i ? { ...a, name: e.target.value } : a,
                    ),
                  )
                }
              />
            </label>
            <label>
              قيم البُعد {i + 1} مفصولة بفاصلة أو |
              <input
                value={axis.values}
                maxLength={250}
                required={i === 0}
                placeholder={
                  i === 0 ? 'أحمر، أزرق' : i === 1 ? 'صغير، كبير' : ''
                }
                onChange={(e) =>
                  setAxes(
                    axes.map((a, n) =>
                      n === i ? { ...a, values: e.target.value } : a,
                    ),
                  )
                }
              />
            </label>
          </div>
        ))}
        <label>
          بادئة SKU للتركيبات
          <input
            value={prefix}
            dir="ltr"
            pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,47}"
            maxLength={48}
            required
            onChange={(e) => setPrefix(e.target.value)}
          />
        </label>
        <label>
          السعر الابتدائي لكل خيار بوحدات IQD الصغرى
          <input
            name="price"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,11}"
            defaultValue={p.price_minor === '0' ? '' : p.price_minor}
            required
          />
        </label>
        <label>
          التكلفة التقديرية لكل خيار بوحدات IQD الصغرى
          <input
            name="cost"
            inputMode="numeric"
            pattern="0|[1-9][0-9]{0,11}"
            defaultValue={p.cost_minor ?? '0'}
            required
          />
        </label>
        <p>
          1000 وحدة صغرى = 1 د.ع. التكلفة الفعلية من طبقات الاستلام؛ لا تعديل
          رصيد من هذا النموذج.
        </p>
        <p aria-live="polite">
          {preview
            ? `سيُنشأ ${preview.choices.length} SKU مستقلاً`
            : axes.some((a) => a.name || a.values)
              ? error
              : 'أدخل الأبعاد لمعاينة التركيبات'}
        </p>
        {preview && (
          <details>
            <summary>معاينة التركيبات قبل الإنشاء</summary>
            <ol>
              {preview.choices.map((c, i) => (
                <li key={c.indexes.join('-')}>
                  {c.label} ·{' '}
                  <bdi dir="ltr">
                    {prefix}-{String(i + 1).padStart(2, '0')}
                  </bdi>
                </li>
              ))}
            </ol>
          </details>
        )}
      </CareForm>
    </details>
  );
}
