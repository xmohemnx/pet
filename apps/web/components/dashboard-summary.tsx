'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  ArrowUpLeft,
  Activity,
  CalendarCheck,
  Layers3,
  RefreshCw,
} from 'lucide-react';
import type { DashboardData, SiteBanner } from '@petra/contracts';
import { api } from '../lib/auth-client';
export function DashboardSummary({
  kind,
  clinicId,
  revision,
}: {
  kind: string;
  clinicId?: string;
  revision?: number;
}) {
  const [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(
        await api<DashboardData>(
          `me/dashboard?kind=${kind}${clinicId ? `&clinicId=${clinicId}` : ''}`,
        ),
      );
      setError('');
    } catch {
      setError('تعذر تحميل ملخص الداشبورد.');
    }
  }
  useEffect(() => {
    void load();
  }, [kind, clinicId, revision]);
  const icons = [Activity, CalendarCheck, Layers3];
  return (
    <section className="dashboard-summary" aria-label={`ملخص داشبورد ${kind}`}>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button className="text-link" onClick={load}>
            <RefreshCw size={16} aria-hidden="true" />
            إعادة المحاولة
          </button>
        </p>
      ) : !data ? (
        <p className="dashboard-loading" role="status">
          جارٍ تحميل مؤشراتك…
        </p>
      ) : (
        <>
          <dl>
            {data.metrics.map((m, i) => {
              const Icon = icons[i % icons.length]!;
              return (
                <div key={m.label}>
                  <dt>
                    <Icon size={19} aria-hidden="true" />
                    {m.label}
                  </dt>
                  <dd>
                    <Link href={m.href}>
                      {new Intl.NumberFormat('ar-IQ').format(m.value)}
                      <ArrowUpLeft size={16} aria-hidden="true" />
                    </Link>
                  </dd>
                </div>
              );
            })}
          </dl>
          <Link className="dashboard-verification" href="/account/verification">
            <BadgeCheck size={21} aria-hidden="true" />
            {data.verified ? 'هوية الحساب موثقة' : 'طلب توثيق الهوية'}
          </Link>
        </>
      )}
    </section>
  );
}
export function CustomerBanners({ banners }: { banners: SiteBanner[] }) {
  if (!banners.length) return null;
  return (
    <section className="customer-banners" aria-label="بنرات المنصة">
      <div className="banner-track">
        {banners.map((b) => (
          <article
            key={b.id}
            className={`customer-banner ${b.asset_id ? 'with-image' : ''}`}
          >
            {/* Publication image is authenticated, bounded, and owned by a platform editor. */}
            {b.asset_id && (
              <img
                src={`/api/v1/media/${b.asset_id}/file`}
                alt={b.image_alt}
                width={1200}
                height={480}
              />
            )}
            <div className="banner-copy">
              <h2>{b.title}</h2>
              <p>{b.body}</p>
              <p className="banner-attribution">إعلان من إدارة Petra</p>
              <Link className="button glass-action" href={b.href}>
                اكتشف المزيد <ArrowUpLeft size={18} aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
