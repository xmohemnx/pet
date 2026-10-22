'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON } from 'leaflet';
import { api } from '../lib/auth-client';
import { mutate } from './platform-shared';
import { formatIqd } from '@petra/contracts';
export type TaxiCoordinates = Record<'olat' | 'olng' | 'dlat' | 'dlng', string>;
export type RoadQuote = {
  id: string;
  metres: number;
  seconds: number;
  fareMinor: string;
  expiresAt: string;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  mode: 'sandbox';
};
function RoadMap({
  geometry,
  onPoint,
}: {
  geometry: RoadQuote['geometry'] | null;
  onPoint: (lat: number, lng: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    line = useRef<LeafletGeoJSON | null>(null),
    callback = useRef(onPoint);
  useEffect(() => {
    callback.current = onPoint;
  }, [onPoint]);
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !node.current) return;
      const m = L.map(node.current, { scrollWheelZoom: false }).setView(
        [33.3152, 44.3661],
        11,
      );
      map.current = m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(m);
      m.on('click', (e) =>
        callback.current(
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6)),
        ),
      );
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !map.current) return;
      if (line.current) {
        line.current.remove();
        line.current = null;
      }
      if (geometry) {
        line.current = L.geoJSON(geometry, {
          style: { color: '#126753', weight: 5 },
        }).addTo(map.current);
        map.current.fitBounds(line.current.getBounds(), { padding: [24, 24] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [geometry]);
  return (
    <div
      ref={node}
      role="region"
      aria-label="خريطة الطريق الاختيارية"
      className="taxi-road-map"
    />
  );
}
export function TaxiRoutePlanner({
  coordinates,
  onCoordinates,
  quote,
  onQuote,
}: {
  coordinates: TaxiCoordinates;
  onCoordinates: (p: TaxiCoordinates) => void;
  quote: RoadQuote | null;
  onQuote: (q: RoadQuote | null) => void;
}) {
  const [open, setOpen] = useState(false),
    [tiles, setTiles] = useState(false),
    [consent, setConsent] = useState(false),
    [point, setPoint] = useState<'origin' | 'destination'>('origin'),
    [host, setHost] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const key = useRef<{ body: string; key: string; created: number } | null>(
    null,
  );
  const latest = useRef(coordinates);
  useEffect(() => {
    latest.current = coordinates;
  }, [coordinates]);
  async function settings() {
    setOpen(true);
    try {
      const s = await api<{ enabled: boolean; providerHost: string | null }>(
        'taxi/routing',
      );
      if (!s.enabled) throw new Error('خدمة الطرق غير مهيأة');
      setHost(s.providerHost);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل إعداد الخدمة');
    }
  }
  async function requestQuote() {
    setError('');
    setBusy(true);
    onQuote(null);
    try {
      if (!consent || !host)
        throw new Error('يلزم قبول إرسال النقطتين لخدمة الطرق');
      if (Object.values(coordinates).some((v) => !v.trim()))
        throw new Error('أدخل إحداثيات الانطلاق والوجهة أولاً');
      const body = {
        originLat: Number(coordinates.olat),
        originLng: Number(coordinates.olng),
        destinationLat: Number(coordinates.dlat),
        destinationLng: Number(coordinates.dlng),
        consent: true,
      };
      const serialized = JSON.stringify(body);
      if (
        key.current?.body !== serialized ||
        Date.now() - key.current.created >= 600000
      )
        key.current = {
          body: serialized,
          key: crypto.randomUUID(),
          created: Date.now(),
        };
      const marker = JSON.stringify(coordinates);
      const result = await mutate<RoadQuote>('taxi/route-quotes', {
        ...body,
        idempotencyKey: key.current.key,
      });
      if (marker !== JSON.stringify(latest.current))
        throw new Error('تغيرت الإحداثيات؛ احسب الطريق مجدداً');
      onQuote(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حساب الطريق');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="care-stack taxi-road-planner">
      {!open ? (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void settings()}
        >
          تخطيط طريق فعلي اختياري
        </button>
      ) : (
        <>
          <h3>المسار على شبكة الطرق</h3>
          <p>
            يمكنك إدخال الإحداثيات أعلاه دون خريطة. يُحسب السعر الاختباري من طول
            الطريق؛ الوقت تقدير قيادة دون حركة المرور أو وقت وصول السائق.
          </p>
          <label className="care-check">
            <input
              type="checkbox"
              checked={tiles}
              onChange={(e) => setTiles(e.target.checked)}
            />
            تحميل خريطة OpenStreetMap المجانية؛ سيستقبل مزود البلاطات عنوان
            اتصالي والمنطقة المعروضة.
          </label>
          {tiles && (
            <>
              <label>
                النقطة عند النقر على الخريطة
                <select
                  value={point}
                  onChange={(e) =>
                    setPoint(e.target.value as 'origin' | 'destination')
                  }
                >
                  <option value="origin">الانطلاق</option>
                  <option value="destination">الوجهة</option>
                </select>
              </label>
              <RoadMap
                geometry={quote?.geometry ?? null}
                onPoint={(lat, lng) =>
                  onCoordinates({
                    ...coordinates,
                    ...(point === 'origin'
                      ? { olat: String(lat), olng: String(lng) }
                      : { dlat: String(lat), dlng: String(lng) }),
                  })
                }
              />
            </>
          )}
          <label className="care-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (!e.target.checked) onQuote(null);
              }}
            />
            أوافق على إرسال نقطتي الرحلة إلى {host ?? 'خدمة OSRM'} لحساب الطريق
            الخاص. نطاق هذه النسخة العراق وحتى 100 كم طريق.
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy || !host || !consent}
            onClick={() => void requestQuote()}
          >
            {busy ? 'يجري حساب الطريق…' : 'حساب مسار الطرق والسعر الاختباري'}
          </button>
          {error && <p role="alert">{error}</p>}
          {quote && (
            <div role="status">
              <p>
                مسار الطرق: {(quote.metres / 1000).toFixed(2)} كم · نحو{' '}
                {Math.ceil(quote.seconds / 60)} دقيقة ·{' '}
                {formatIqd(quote.fareMinor)}
              </p>
              <p>
                هذا العرض للحجز خلال عشر دقائق. تغيير الإحداثيات يلغي اختياره؛
                الحجز المالي ما زال اختبارياً.
              </p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onQuote(null)}
              >
                إلغاء اختيار مسار الطرق
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
