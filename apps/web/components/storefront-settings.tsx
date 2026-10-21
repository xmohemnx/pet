'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Storefront, IdentityMe } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { IdentityShell } from './identity-shell';
import { CareForm } from './care-shared';
import { MediaUpload, PlatformHeading } from './platform-shared';
export function StorefrontSettings({
  me,
  initial,
}: {
  me: IdentityMe;
  initial: Storefront;
}) {
  const [store, setStore] = useState(initial),
    [logo, setLogo] = useState(initial.logo_asset_id),
    [cover, setCover] = useState(initial.cover_asset_id);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const base = `clinics/${store.clinic_id}/storefront`;
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow={store.clinic_name} title="إعدادات واجهة المتجر">
        بيانات يراها المشترون. إخفاء المتجر يمنع الطلبات الجديدة ويحجب صوره
        عنهم.
      </PlatformHeading>
      <div className="inline-actions">
        <Link
          className="button outline"
          href={`/clinic/${store.clinic_id}/commerce`}
        >
          المنتجات والمخزون
        </Link>
        <Link
          className="button outline"
          href={`/marketplace/stores/${store.clinic_id}`}
        >
          معاينة المتجر المنشور
        </Link>
      </div>
      <div className="care-columns">
        <section className="panel care-section">
          <h2>هوية المتجر</h2>
          <p>
            ارفع صورة ثم اختر استخدامها شعاراً أو غلافاً. تُنشر عند حفظ
            الإعدادات والموافقة.
          </p>
          <MediaUpload
            imagesOnly
            onUploaded={(a) => {
              if (a.kind === 'image' && a.status === 'ready') setChoice(a.id);
            }}
          />
          <ImageChoice
            logo={logo}
            cover={cover}
            setLogo={setLogo}
            setCover={setCover}
          />
          <CareForm
            label="حفظ إعدادات المتجر"
            submit={async (f) => {
              await api(base, {
                method: 'PATCH',
                body: JSON.stringify({
                  version: store.version,
                  displayName: f.get('name'),
                  description: f.get('description'),
                  city: f.get('city'),
                  openingHours: f.get('hours'),
                  deliveryPolicy: f.get('delivery'),
                  returnPolicy: f.get('returns'),
                  published: f.get('published') === 'on',
                  logoAssetId: logo,
                  coverAssetId: cover,
                  publicationConsent: f.get('consent') === 'on',
                }),
              });
              setStore(await api<Storefront>(base));
            }}
          >
            <label>
              اسم المتجر
              <input
                name="name"
                defaultValue={store.display_name}
                required
                maxLength={100}
              />
            </label>
            <label>
              نبذة المتجر
              <textarea
                name="description"
                defaultValue={store.description}
                maxLength={3000}
              />
            </label>
            <label>
              المدينة
              <input name="city" defaultValue={store.city} maxLength={100} />
            </label>
            <label>
              أوقات التوفر
              <textarea
                name="hours"
                defaultValue={store.opening_hours}
                maxLength={1000}
              />
            </label>
            <label>
              سياسة التسليم
              <textarea
                name="delivery"
                defaultValue={store.delivery_policy}
                maxLength={3000}
              />
            </label>
            <label>
              سياسة الإرجاع
              <textarea
                name="returns"
                defaultValue={store.return_policy}
                maxLength={3000}
              />
            </label>
            <label className="care-check">
              <input
                type="checkbox"
                name="published"
                defaultChecked={store.published}
              />
              المتجر منشور
            </label>
            <label className="care-check">
              <input type="checkbox" name="consent" />
              أوافق على نشر الشعار والغلاف وأملك حق استخدامهما
            </label>
            <p className="panel-intro">
              اكتب شروطاً واضحة؛ هذه النصوص لا تضيف رسوماً إلى الطلب أو تُفعّل
              مزود شحن.
            </p>
          </CareForm>
        </section>
      </div>
    </IdentityShell>
  );
  function setChoice(id: string) {
    setUploaded(id);
  }
  function ImageChoice({
    logo,
    cover,
    setLogo,
    setCover,
  }: {
    logo: string | null;
    cover: string | null;
    setLogo: (id: string | null) => void;
    setCover: (id: string | null) => void;
  }) {
    return (
      <div className="care-stack">
        {uploaded && (
          <div className="inline-actions">
            <button
              className="button outline"
              type="button"
              onClick={() => setLogo(uploaded)}
            >
              استخدام الصورة شعاراً
            </button>
            <button
              className="button outline"
              type="button"
              onClick={() => setCover(uploaded)}
            >
              استخدام الصورة غلافاً
            </button>
          </div>
        )}
        {logo && (
          <div>
            <img
              className="catalog-thumbnail"
              src={`/api/v1/media/${logo}/file`}
              alt="شعار المتجر المحدد"
            />
            <button
              className="button outline"
              type="button"
              onClick={() => setLogo(null)}
            >
              حذف الشعار
            </button>
          </div>
        )}
        {cover && (
          <div>
            <img
              className="catalog-thumbnail"
              src={`/api/v1/media/${cover}/file`}
              alt="غلاف المتجر المحدد"
            />
            <button
              className="button outline"
              type="button"
              onClick={() => setCover(null)}
            >
              حذف الغلاف
            </button>
          </div>
        )}
      </div>
    );
  }
}
