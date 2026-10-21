'use client';
import { useState } from 'react';
import type { Product } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareForm } from './care-shared';
import { MediaUpload } from './platform-shared';

export function ProductCatalogEditor({
  product: p,
  clinicId,
  refresh,
}: {
  product: Product;
  clinicId: string;
  refresh: () => Promise<void>;
}) {
  const [images, setImages] = useState(p.images ?? []);
  return (
    <details>
      <summary>صور ومواصفات المنتج</summary>
      <p>
        أضف حتى ست صور. لا تصبح الصورة متاحة للمشترين إلا بعد الموافقة والحفظ.
      </p>
      {images.map((image, index) => (
        <div key={image.asset_id} className="care-list-row">
          {/* Private authenticated media is served through the same-origin BFF. */}
          <img
            className="catalog-thumbnail"
            src={`/api/v1/media/${image.asset_id}/file`}
            alt={image.alt}
          />
          <label>
            وصف الصورة {index + 1}
            <input
              value={image.alt}
              maxLength={180}
              onChange={(e) =>
                setImages(
                  images.map((x, n) =>
                    n === index ? { ...x, alt: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <button
            className="button outline"
            type="button"
            onClick={() =>
              setImages(images.filter((x) => x.asset_id !== image.asset_id))
            }
          >
            إزالة الصورة {index + 1}
          </button>
        </div>
      ))}
      {images.length < 6 && (
        <MediaUpload
          imagesOnly
          onUploaded={(a) => {
            if (a.kind === 'image' && a.status === 'ready')
              setImages([...images, { asset_id: a.id, alt: p.name }]);
          }}
        />
      )}
      <CareForm
        label="حفظ الصور والمواصفات"
        submit={async (f) => {
          const specifications = String(f.get('specs') ?? '')
            .split('\n')
            .filter((x) => x.trim())
            .map((line) => {
              const n = line.indexOf(':');
              if (n < 1)
                throw new Error('اكتب كل مواصفة بالشكل: الاسم: القيمة');
              return {
                name: line.slice(0, n).trim(),
                value: line.slice(n + 1).trim(),
              };
            });
          await api(`clinics/${clinicId}/products/${p.id}/catalog`, {
            method: 'PATCH',
            body: JSON.stringify({
              version: p.version,
              category: f.get('category'),
              brand: f.get('brand'),
              barcode: f.get('barcode'),
              unit: f.get('unit'),
              ageSuitability: f.get('age'),
              specifications,
              images: images.map((x) => ({ assetId: x.asset_id, alt: x.alt })),
              publicationConsent: f.get('consent') === 'on',
            }),
          });
          await refresh();
        }}
      >
        <label>
          التصنيف
          <input name="category" maxLength={100} defaultValue={p.category} />
        </label>
        <label>
          العلامة التجارية
          <input name="brand" maxLength={100} defaultValue={p.brand} />
        </label>
        <label>
          الباركود
          <input name="barcode" maxLength={64} defaultValue={p.barcode} />
        </label>
        <label>
          وحدة البيع
          <input
            name="unit"
            maxLength={100}
            defaultValue={p.unit ?? 'قطعة'}
            required
          />
        </label>
        <label>
          العمر الملائم
          <input name="age" maxLength={100} defaultValue={p.age_suitability} />
        </label>
        <label>
          المواصفات، سطر لكل اسم: قيمة
          <textarea
            name="specs"
            defaultValue={p.specifications
              ?.map((x) => `${x.name}: ${x.value}`)
              .join('\n')}
            maxLength={4800}
          />
        </label>
        <label className="care-check">
          <input name="consent" type="checkbox" />
          أوافق على نشر الصور المحددة للمشترين وأملك حق استخدامها
        </label>
        <p className="panel-intro">
          حفظ القائمة يزيل الصور المحذوفة من المنتج. لا تضف ادعاءات علاجية غير
          معتمدة.
        </p>
      </CareForm>
    </details>
  );
}
