'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { IdentityMe, Product } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
import { PlatformHeading } from './platform-shared';
import { CareForm, CareAction } from './care-shared';
export interface Category {
  id: string;
  clinic_id: string;
  name: string;
  parent_id: string | null;
  path: string[];
  active: boolean;
  version: number;
  sort_order?: number;
  names?: string[];
}
export function CatalogTaxonomy({
  me,
  clinicId,
  initial,
  products: initialProducts,
}: {
  me: IdentityMe;
  clinicId: string;
  initial: Category[];
  products: Product[];
}) {
  const [categories, setCategories] = useState(initial),
    [products, setProducts] = useState(initialProducts),
    [chosen, setChosen] = useState('');
  const keys = useRef(new Map<string, string>());
  const base = `clinics/${clinicId}`;
  const display = (c: Category) =>
    c.path
      .map((id) => categories.find((x) => x.id === id)?.name ?? 'تصنيف')
      .join(' / ');
  const effective = (c: Category) =>
    c.path.every((id) => categories.find((a) => a.id === id)?.active);
  const current = products.find((p) => p.id === chosen);
  async function refresh() {
    const [list, data] = await Promise.all([
      api<Category[]>(`${base}/categories`),
      api<{ products: Product[] }>(`${base}/commerce`),
    ]);
    setCategories(list);
    setProducts(data.products);
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="تجارة العيادة" title="التصنيفات والوسوم">
        شجرة حتى أربعة مستويات. إخفاء التصنيف يخفي فرعه من الفلاتر، ولا يلغي نشر
        منتجاته أو طلباتها.
      </PlatformHeading>
      <Link className="text-link" href={`/clinic/${clinicId}/commerce`}>
        العودة إلى تجارة العيادة
      </Link>
      <div className="care-columns">
        <section className="panel care-section">
          <h2>إنشاء تصنيف</h2>
          <CareForm
            label="حفظ التصنيف"
            submit={async (f) => {
              const input = {
                  name: String(f.get('name')),
                  parentId: String(f.get('parent')) || null,
                },
                signature = JSON.stringify(input),
                key = keys.current.get(signature) ?? crypto.randomUUID();
              keys.current.set(signature, key);
              await api(`${base}/categories`, {
                method: 'POST',
                body: JSON.stringify({ ...input, idempotencyKey: key }),
              });
              await refresh();
              keys.current.delete(signature);
            }}
          >
            <label>
              اسم التصنيف
              <input name="name" required maxLength={80} />
            </label>
            <label>
              التصنيف الأب
              <select name="parent" aria-label="التصنيف الأب">
                <option value="">تصنيف رئيسي</option>
                {categories
                  .filter((c) => effective(c) && c.path.length < 4)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {display(c)}
                    </option>
                  ))}
              </select>
            </label>
          </CareForm>
          <h2>شجرة التصنيفات</h2>
          {categories.map((c) => (
            <article className="care-list-row" key={c.id}>
              <div>
                <h3>{display(c)}</h3>
                <p>
                  {effective(c)
                    ? 'ظاهر في الشجرة'
                    : 'مخفي أو يتبع أصلاً مخفياً'}
                </p>
                <CareAction
                  action={async () => {
                    await api(`${base}/categories/${c.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        version: c.version,
                        active: !c.active,
                      }),
                    });
                    await refresh();
                  }}
                >
                  {c.active ? 'إخفاء التصنيف' : 'إظهار التصنيف'}
                </CareAction>
                <details className="category-editor">
                  <summary>تعديل القسم وترتيبه</summary>
                  <CareForm
                    label="حفظ القسم"
                    submit={async (f) => {
                      await api(`${base}/categories/${c.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          version: c.version,
                          name: f.get('name'),
                          sortOrder: Number(f.get('position')),
                        }),
                      });
                      await refresh();
                    }}
                  >
                    <label>
                      اسم القسم
                      <input
                        name="name"
                        defaultValue={c.name}
                        required
                        maxLength={80}
                      />
                    </label>
                    <label>
                      ترتيب العرض
                      <input
                        type="number"
                        name="position"
                        min={0}
                        max={999}
                        defaultValue={c.sort_order ?? 0}
                        required
                      />
                    </label>
                  </CareForm>
                  <CareAction
                    variant="outline"
                    action={async () => {
                      if (
                        !window.confirm(
                          'حذف هذا القسم الفارغ؟ لن تُحذف المنتجات أو المخزون.',
                        )
                      )
                        throw new Error('أُلغي الحذف؛ لم يتغير القسم.');
                      await api(`${base}/categories/${c.id}`, {
                        method: 'DELETE',
                        body: JSON.stringify({ version: c.version }),
                      });
                      await refresh();
                    }}
                  >
                    حذف القسم
                  </CareAction>
                </details>
              </div>
            </article>
          ))}
        </section>
        <section className="panel care-section">
          <h2>تصنيف منتج ووسومه</h2>
          <label className="care-standalone-label">
            اختر المنتج للتصنيف
            <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">اختر SKU</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </select>
          </label>
          {current && (
            <CareForm
              key={`${current.id}:${current.version}`}
              label="حفظ تصنيف المنتج"
              submit={async (f) => {
                await api(`${base}/products/${current.id}/classification`, {
                  method: 'POST',
                  body: JSON.stringify({
                    version: current.version,
                    categoryId: String(f.get('category')) || null,
                    tags: String(f.get('tags')).trim()
                      ? String(f.get('tags'))
                          .split(/[،,]/)
                          .map((s) => s.trim())
                      : [],
                  }),
                });
                await refresh();
              }}
            >
              <label>
                التصنيف المتسلسل للمنتج
                <select
                  name="category"
                  aria-label="التصنيف المتسلسل للمنتج"
                  defaultValue={current.category_id ?? ''}
                >
                  <option value="">دون تصنيف متسلسل</option>
                  {categories
                    .filter((c) => effective(c) || c.id === current.category_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {display(c)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                الوسوم مفصولة بفاصلة
                <input
                  name="tags"
                  maxLength={319}
                  defaultValue={current.tags?.join('، ') ?? ''}
                />
              </label>
              <p>
                حتى عشر وسوم فريدة، كل وسم حتى 30 حرفاً. التصنيف النصي السابق
                يبقى محفوظاً، ولا يتغير السعر أو الرصيد.
              </p>
            </CareForm>
          )}
        </section>
      </div>
    </IdentityShell>
  );
}
export function CatalogSearch({
  query,
  onResults,
}: {
  query: string;
  onResults: (results: Product[] | null) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingError, setLoadingError] = useState('');
  return (
    <details
      onToggle={async (e) => {
        if (e.currentTarget.open) {
          try {
            setLoadingError('');
            setCategories(await api<Category[]>('marketplace/categories'));
          } catch {
            setLoadingError(
              'تعذر تحميل التصنيفات؛ أغلق القائمة وافتحها للمحاولة مجدداً',
            );
          }
        }
      }}
    >
      <summary>البحث بالتصنيفات والوسوم</summary>
      {loadingError && <p role="alert">{loadingError}</p>}
      <CareForm
        label="بحث مصنف من الخادم"
        submit={async (f) => {
          const params = new URLSearchParams({ q: query });
          if (f.get('category'))
            params.set('categoryId', String(f.get('category')));
          if (String(f.get('tag')).trim())
            params.set('tag', String(f.get('tag')).trim());
          onResults(await api<Product[]>(`marketplace/search?${params}`));
        }}
      >
        <label>
          التصنيف المتسلسل للبحث
          <select name="category">
            <option value="">كل الفروع المنشورة</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.names?.join(' / ') ?? c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          وسم البحث
          <input name="tag" maxLength={30} />
        </label>
      </CareForm>
      <CareAction action={async () => onResults(null)}>
        إلغاء البحث المصنف
      </CareAction>
    </details>
  );
}
