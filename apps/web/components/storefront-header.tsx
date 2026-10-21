import type { Storefront } from '@petra/contracts';
import { PlatformHeading } from './platform-shared';
export function StorefrontHeader({ store: s }: { store: Storefront }) {
  return (
    <section className="care-stack">
      {s.cover_asset_id && (
        <img
          className="store-cover"
          src={`/api/v1/media/${s.cover_asset_id}/file`}
          alt={`غلاف ${s.display_name}`}
        />
      )}
      {s.logo_asset_id && (
        <img
          className="catalog-thumbnail"
          src={`/api/v1/media/${s.logo_asset_id}/file`}
          alt={`شعار ${s.display_name}`}
        />
      )}
      <PlatformHeading
        eyebrow={`${s.clinic_name} · ${s.city}`}
        title={s.display_name}
      >
        {s.description}
      </PlatformHeading>
      <div className="panel care-section">
        <h2>سياسات المتجر وأوقات التوفر</h2>
        <dl className="store-policies">
          <dt>أوقات التوفر</dt>
          <dd>{s.opening_hours || 'لم تُحدد بعد'}</dd>
          <dt>التسليم</dt>
          <dd>{s.delivery_policy || 'لم تُحدد بعد'}</dd>
          <dt>الإرجاع</dt>
          <dd>{s.return_policy || 'لم تُحدد بعد'}</dd>
        </dl>
      </div>
    </section>
  );
}
