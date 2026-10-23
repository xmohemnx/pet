'use client';
import { DashboardSummary } from './dashboard-summary';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WorkspaceHeading, WorkspaceEmpty } from './workspace-overview';
import { useDriverUpdates } from './use-driver-updates';
import type { IdentityMe, Pet, Ride, DriverHome } from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import {
  TaxiRoutePlanner,
  type TaxiCoordinates,
  type RoadQuote,
} from './taxi-route-planner';
import { RideDisputeCard } from './ride-disputes';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, localToUtc, careDate } from './care-shared';
import { api } from '../lib/auth-client';
import {
  PlatformHeading,
  SandboxNotice,
  Empty,
  Status,
  mutate,
} from './platform-shared';
export function TaxiCenter({
  me,
  pets,
  initial,
  driverData,
}: {
  me: IdentityMe;
  pets: Pet[];
  initial: Ride[];
  driverData?: DriverHome;
}) {
  const [rideView, setRideView] = useState<'active' | 'history'>('active');
  const vehicleRef = useRef<HTMLDetailsElement>(null);
  const [rides, setRides] = useState(initial),
    [home, setHome] = useState(driverData),
    [locations, setLocations] = useState<Record<string, string>>({});
  const [coordinates, setCoordinates] = useState<TaxiCoordinates>({
    olat: '',
    olng: '',
    dlat: '',
    dlng: '',
  });
  const [roadQuote, setRoadQuote] = useState<RoadQuote | null>(null);
  const [driverRevoked, setDriverRevoked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const revokeDriver = useCallback(() => {
    setDriverRevoked(true);
    setHome(undefined);
    setRides([]);
    setLocations({});
  }, []);
  useDriverUpdates(!!driverData && !driverRevoked, setHome, revokeDriver);
  useEffect(() => {
    if (!driverData || driverRevoked) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [driverData, driverRevoked]);
  const requestKeys = useRef(new Map<string, string>());
  function changeCoordinates(next: TaxiCoordinates) {
    setCoordinates(next);
    setRoadQuote(null);
  }
  async function requestRide(body: Record<string, unknown>) {
    const serialized = JSON.stringify(body);
    let key = requestKeys.current.get(serialized);
    if (!key) {
      key = crypto.randomUUID();
      requestKeys.current.set(serialized, key);
    }
    await mutate('sandbox/rides', { ...body, idempotencyKey: key });
    await refresh();
    requestKeys.current.delete(serialized);
  }
  async function refresh() {
    const current = await api<Ride[]>('me/rides');
    setRides(current);
    setLocations((old) =>
      Object.fromEntries(
        Object.entries(old).filter(([id]) =>
          current.some(
            (r) =>
              r.id === id &&
              ['accepted', 'driver_en_route', 'arrived', 'in_transit'].includes(
                r.status,
              ),
          ),
        ),
      ),
    );
    if (home) setHome(await api<DriverHome>('driver/home'));
  }
  async function send(path: string, body: unknown = {}) {
    await mutate(path, body);
    await refresh();
  }
  async function gps(id: string, shared: boolean) {
    if (!shared) {
      await send(`rides/${id}/location`, { lat: 0, lng: 0, shared: false });
      return;
    }
    const p = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 0,
      }),
    );
    await send(`rides/${id}/location`, {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      shared: true,
    });
  }
  if (driverRevoked)
    return (
      <IdentityShell me={me}>
        <p role="alert">
          انتهى إذن عرض مساحة السائق. سجّل الدخول وتحقق من اعتمادك.
        </p>
      </IdentityShell>
    );
  const activeStatuses = [
    'accepted',
    'driver_en_route',
    'arrived',
    'in_transit',
  ];
  const activeRides = rides.filter((r) => activeStatuses.includes(r.status));
  const pastRides = rides.filter((r) => !activeStatuses.includes(r.status));
  const shownRides = home
    ? rideView === 'active'
      ? activeRides
      : pastRides
    : rides;
  const offers =
    home?.offers.filter((o) => new Date(o.expires_at).getTime() > now) ?? [];
  return (
    <IdentityShell me={me}>
      <div className={home ? 'role-desk driver-desk' : undefined}>
        {home ? (
          <WorkspaceHeading
            title="رحلاتك ومستحقاتك"
            description="مساحة السائق. تابع الرحلة الحالية، ثم اختر طلب النقل المناسب لمركبتك."
            action={
              <button
                className="button outline"
                onClick={() => {
                  if (vehicleRef.current) {
                    vehicleRef.current.open = true;
                    vehicleRef.current.scrollIntoView({ block: 'start' });
                    vehicleRef.current
                      .querySelector<HTMLInputElement>('input')
                      ?.focus();
                  }
                }}
              >
                إعداد المركبة والتوفر
              </button>
            }
          />
        ) : (
          <PlatformHeading
            title={home ? 'رحلاتك ومستحقاتك' : 'رحلة مهيأة لرفيقك'}
          >
            قبول فعلي من سائق معتمد. مشاركة الموقع أثناء الرحلة فقط ولمدة دقيقة
            بعد كل تحديث.
          </PlatformHeading>
        )}
        {home ? (
          <aside className="driver-test-notice" aria-label="وضع المعاملات">
            نقل اختباري · لا دفع أو تحويل مالي حقيقي.
          </aside>
        ) : (
          <SandboxNotice />
        )}
        {home && (
          <section className="driver-readiness" aria-label="حالة عمل السائق">
            <div>
              <span
                className={
                  home.vehicle?.available
                    ? 'desk-state available'
                    : 'desk-state'
                }
              >
                {home.vehicle?.available
                  ? 'متاح لقبول رحلات'
                  : 'غير متاح لقبول رحلات'}
              </span>
              <p>
                {home.vehicle
                  ? `${home.vehicle.city} · ${home.vehicle.plate}`
                  : 'أضف مركبتك وحدد مدينة العمل قبل استقبال الطلبات.'}
              </p>
            </div>
            <dl>
              <div>
                <dt>عروض إسناد سارية</dt>
                <dd>{offers.length}</dd>
              </div>
              <div>
                <dt>طلبات مطابقة</dt>
                <dd>{home.requests.length}</dd>
              </div>
            </dl>
          </section>
        )}
        <div className={home ? 'desk-body' : 'care-columns'}>
          <div className={home ? 'desk-main driver-queues' : 'care-stack'}>
            <section
              className={
                home
                  ? 'panel care-section driver-current'
                  : 'panel care-section'
              }
            >
              <h2>رحلاتي</h2>
              {home && (
                <nav className="desk-tabs" aria-label="تصفية رحلات السائق">
                  <button
                    aria-pressed={rideView === 'active'}
                    onClick={() => setRideView('active')}
                  >
                    الجارية <span>{activeRides.length}</span>
                  </button>
                  <button
                    aria-pressed={rideView === 'history'}
                    onClick={() => setRideView('history')}
                  >
                    السجل <span>{pastRides.length}</span>
                  </button>
                </nav>
              )}
              {!shownRides.length && (
                <WorkspaceEmpty
                  title={
                    home && rideView === 'active'
                      ? 'لا رحلة جارية الآن'
                      : 'لا رحلات في هذه القائمة'
                  }
                >
                  {home
                    ? 'تابع عروض الإسناد والطلبات المطابقة في مساحة العمل. تظهر تفاصيل الرحلة هنا بعد قبولها.'
                    : 'ستظهر هنا تفاصيل طلبات النقل التي تنشئها.'}
                </WorkspaceEmpty>
              )}
              {shownRides.map((r) => (
                <article key={r.id} className="ride-card">
                  <h3>
                    {r.pet_name} · {r.city}
                  </h3>
                  <p>
                    {r.pet_count ?? 1} حيوان ·{' '}
                    {r.scheduled_at ? careDate(r.scheduled_at) : 'رحلة فورية'}
                    {r.accompanying ? ' · راكب مصاحب' : ''}
                  </p>
                  {r.transport_notes && <p>{r.transport_notes}</p>}
                  <p className="ride-route">
                    {r.origin_label} ← {r.destination_label}
                  </p>
                  <strong>{formatIqd(r.fare_minor)}</strong>
                  <Status value={r.status} />
                  <div className="inline-actions">
                    {r.driver_id === me.user.id &&
                      [
                        'accepted',
                        'driver_en_route',
                        'arrived',
                        'in_transit',
                      ].includes(r.status) && (
                        <>
                          <CareAction
                            action={() =>
                              send(`rides/${r.id}/transition`, {
                                status: {
                                  accepted: 'driver_en_route',
                                  driver_en_route: 'arrived',
                                  arrived: 'in_transit',
                                  in_transit: 'completed',
                                }[r.status],
                              })
                            }
                          >
                            {
                              {
                                accepted: 'بدأت التوجه',
                                driver_en_route: 'وصلت إلى العميل',
                                arrived: 'بدأ نقل الحيوان',
                                in_transit: 'إتمام الرحلة والتحصيل الاختباري',
                              }[r.status]
                            }
                          </CareAction>
                          <CareAction
                            variant="outline"
                            action={() => gps(r.id, true)}
                          >
                            مشاركة موقعي الآن
                          </CareAction>
                          <CareAction
                            variant="outline"
                            action={() => gps(r.id, false)}
                          >
                            إيقاف مشاركة الموقع
                          </CareAction>
                        </>
                      )}
                    {[
                      'requested',
                      'accepted',
                      'driver_en_route',
                      'arrived',
                    ].includes(r.status) && (
                      <CareAction
                        variant="outline"
                        action={() => send(`rides/${r.id}/cancel`)}
                      >
                        إلغاء الرحلة
                      </CareAction>
                    )}
                    {r.user_id === me.user.id &&
                      r.driver_id &&
                      [
                        'accepted',
                        'driver_en_route',
                        'arrived',
                        'in_transit',
                      ].includes(r.status) && (
                        <CareAction
                          action={async () => {
                            const l = await api<{
                              lat: string;
                              lng: string;
                            } | null>(`rides/${r.id}/location`);
                            setLocations({
                              ...locations,
                              [r.id]: l
                                ? `${l.lat}, ${l.lng}`
                                : 'لا مشاركة حديثة من السائق',
                            });
                          }}
                        >
                          عرض موقع السائق الحالي
                        </CareAction>
                      )}
                  </div>
                  {locations[r.id] && (
                    <p role="status" dir="ltr">
                      {locations[r.id]}
                    </p>
                  )}
                  <details>
                    <summary>بلاغ سلامة خاص</summary>
                    <CareForm
                      label="إرسال بلاغ الرحلة"
                      submit={(f) =>
                        send(`rides/${r.id}/incidents`, {
                          description: f.get('description'),
                        })
                      }
                    >
                      <label>
                        وصف البلاغ الخاص
                        <textarea
                          name="description"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </CareForm>
                  </details>
                  {['completed', 'cancelled'].includes(r.status) && (
                    <RideDisputeCard rideId={r.id} />
                  )}
                </article>
              ))}
            </section>
            {home && (
              <section className="panel care-section driver-offers">
                <div className="desk-section-heading">
                  <h2>عروض الإسناد الخاصة</h2>
                  <span className="desk-count">{offers.length} عرض سارٍ</span>
                </div>
                <p>
                  عروض المدينة المطابقة لمركبتك؛ لا يجمع النظام موقع انتظارك ولا
                  يدعي اختيار الأقرب. تُحدَّث القائمة تلقائياً كل خمس ثوانٍ
                  أثناء فتح الصفحة، وتختفي العروض عند انتهاء مهلتها.
                </p>
                {!offers.length && (
                  <p className="driver-no-offers">
                    لا عروض إسناد سارية. تظهر العروض المناسبة بعد إعداد مركبتك
                    وتوفرك.
                  </p>
                )}
                {offers.map((o) => (
                  <article key={o.id} className="care-list-row">
                    <div>
                      <h3>
                        {o.city} · {o.species}
                      </h3>
                      <p>
                        {formatIqd(o.fare_minor)} · مهلة القبول حتى{' '}
                        {careDate(o.expires_at)}
                      </p>
                    </div>
                    <div className="care-stack">
                      <CareAction
                        action={() =>
                          send(`driver/dispatch-offers/${o.id}/accept`)
                        }
                      >
                        قبول عرض الإسناد
                      </CareAction>
                      <CareAction
                        action={() =>
                          send(`driver/dispatch-offers/${o.id}/decline`)
                        }
                      >
                        رفض عرض الإسناد
                      </CareAction>
                    </div>
                  </article>
                ))}
                <CareAction variant="outline" action={refresh}>
                  تحديث عروض النقل
                </CareAction>
                <h2>طلبات في مدينتك</h2>
                {home.requests.map((r) => (
                  <article className="care-list-row" key={r.id}>
                    <div>
                      <h3>
                        {r.city} · {r.species}
                      </h3>
                      <p>{formatIqd(r.fare_minor)}</p>
                    </div>
                    <CareAction action={() => send(`rides/${r.id}/claim`)}>
                      قبول الرحلة
                    </CareAction>
                  </article>
                ))}
                {!home.requests.length && (
                  <Empty>لا طلبات مطابقة لمركبتك المتاحة.</Empty>
                )}
              </section>
            )}
            <CareAction variant="outline" action={refresh}>
              تحديث الرحلات
            </CareAction>
          </div>
          <aside className={home ? 'desk-aside' : 'care-stack'}>
            {home && (
              <>
                <section className="driver-ledger">
                  <h2>المستحق الاختباري من الدفتر</h2>
                  <strong>{formatIqd(home.walletMinor)}</strong>
                  <p>
                    من الرحلات المكتملة فقط. لا تحويل بنكي تلقائي ولا تعديل رصيد
                    من الواجهة.
                  </p>
                  <span>الرصيد وفق الدفتر الاختباري</span>
                </section>
                <div className="driver-dashboard-summary">
                  <DashboardSummary
                    kind="driver"
                    revision={activeRides.length}
                  />
                </div>
                <section className="desk-note">
                  <h2>نقل آمن وواضح</h2>
                  <p>
                    تحقق من الحيوان وملاحظات النقل قبل الانطلاق. مشاركة الموقع
                    متاحة أثناء الرحلة فقط ولمدة دقيقة بعد كل تحديث.
                  </p>
                  <Link className="text-link" href="/notifications">
                    راجع إشعاراتك
                  </Link>
                </section>
              </>
            )}
            {home ? (
              <details
                className="desk-administration vehicle-editor"
                ref={vehicleRef}
              >
                <summary>
                  مركبتي وتوفري{' '}
                  <span>
                    {home.vehicle
                      ? 'تعديل البيانات والتوفر'
                      : 'أكمل إعداد مركبتك'}
                  </span>
                </summary>
                <section className="care-section">
                  <h2>مركبتي وتوفري</h2>
                  <CareForm
                    label="حفظ المركبة والتوفر"
                    submit={(f) =>
                      send('driver/vehicle', {
                        plate: f.get('plate'),
                        description: f.get('description'),
                        city: f.get('city'),
                        expiresOn: f.get('expires'),
                        available: f.get('available') === 'on',
                        autoDispatch: f.get('autoDispatch') === 'on',
                        capacity: Number(f.get('capacity')),
                        allowedSpecies: f.getAll('species'),
                        passengerAllowed: f.get('passenger') === 'on',
                      })
                    }
                  >
                    <label>
                      رقم اللوحة
                      <input
                        name="plate"
                        defaultValue={home.vehicle?.plate}
                        minLength={2}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      وصف المركبة والتجهيز
                      <textarea
                        name="description"
                        defaultValue={home.vehicle?.description}
                        minLength={5}
                        required
                        maxLength={1000}
                      />
                    </label>
                    <label>
                      مدينة العمل
                      <input
                        name="city"
                        defaultValue={home.vehicle?.city}
                        minLength={2}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      انتهاء الوثيقة
                      <input
                        type="date"
                        name="expires"
                        defaultValue={home.vehicle?.expires_on?.slice(0, 10)}
                        required
                      />
                    </label>
                    <label>
                      سعة الحيوانات
                      <input
                        name="capacity"
                        type="number"
                        min={1}
                        max={5}
                        defaultValue={home.vehicle?.capacity ?? 1}
                        required
                      />
                    </label>
                    <label>
                      أنواع الحيوانات المقبولة
                      <select
                        name="species"
                        multiple
                        defaultValue={home.vehicle?.allowed_species ?? ['all']}
                        required
                      >
                        <option value="all">كل الأنواع</option>
                        <option value="cat">قطط</option>
                        <option value="dog">كلاب</option>
                        <option value="bird">طيور</option>
                        <option value="rabbit">أرانب</option>
                        <option value="other">أخرى</option>
                      </select>
                    </label>
                    <label className="care-check">
                      <input
                        type="checkbox"
                        name="passenger"
                        defaultChecked={home.vehicle?.passenger_allowed}
                      />
                      يسمح براكب مصاحب
                    </label>
                    <label className="care-check">
                      <input
                        type="checkbox"
                        name="available"
                        defaultChecked={home.vehicle?.available}
                      />
                      متاح لقبول رحلات
                    </label>
                    <label className="care-check">
                      <input
                        type="checkbox"
                        name="autoDispatch"
                        defaultChecked={home.vehicle?.auto_dispatch}
                      />
                      أوافق على استقبال عروض إسناد آلية اختيارية؛ قبول الرحلة
                      يحتاج موافقتي خلال 45 ثانية.
                    </label>
                  </CareForm>
                </section>
              </details>
            ) : (
              <section className="panel care-section">
                <h2>طلب نقل اختباري</h2>
                <CareForm
                  label="إنشاء طلب النقل وعرض السعر"
                  submit={(f) =>
                    requestRide({
                      policyAccepted: true,
                      autoDispatch: f.get('autoDispatch') === 'on',
                      petId: f.get('pet'),
                      extraPetIds: f.getAll('extraPets'),
                      scheduledAt: f.get('schedule')
                        ? localToUtc(f.get('schedule'))
                        : null,
                      transportNotes: f.get('notes'),
                      accompanying: f.get('accompanying') === 'on',
                      city: f.get('city'),
                      originLabel: f.get('origin'),
                      destinationLabel: f.get('destination'),
                      originLat: Number(f.get('olat')),
                      originLng: Number(f.get('olng')),
                      destinationLat: Number(f.get('dlat')),
                      destinationLng: Number(f.get('dlng')),
                      ...(roadQuote ? { routeQuoteId: roadQuote.id } : {}),
                    })
                  }
                >
                  <label>
                    الحيوان المسافر
                    <select name="pet" required>
                      {pets
                        .filter((p) => p.scopes.includes('booking'))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    حيوانات إضافية (اختياري، دون تكرار الحيوان الرئيسي)
                    <select multiple name="extraPets">
                      {pets
                        .filter((p) => p.scopes.includes('booking'))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    موعد بتوقيت بغداد (اختياري)
                    <input name="schedule" type="datetime-local" />
                  </label>
                  <label>
                    متطلبات النقل
                    <textarea name="notes" maxLength={1000} />
                  </label>
                  <label className="care-check">
                    <input type="checkbox" name="accompanying" />
                    راكب مصاحب
                  </label>
                  <p>
                    حتى خمسة حيوانات بصلاحية حجز سارية. يتاح قبول الموعد قبل نصف
                    ساعة، ويلغى الطلب غير المقبول بعد ساعتين من الموعد.
                  </p>
                  <label>
                    مدينة الرحلة
                    <input name="city" minLength={2} maxLength={100} required />
                  </label>
                  <label>
                    مكان الانطلاق الخاص
                    <input
                      name="origin"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <label>
                    الوجهة الخاصة
                    <input
                      name="destination"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <div className="care-fields">
                    {[
                      ['olat', 'خط عرض الانطلاق', -90, 90],
                      ['olng', 'خط طول الانطلاق', -180, 180],
                      ['dlat', 'خط عرض الوجهة', -90, 90],
                      ['dlng', 'خط طول الوجهة', -180, 180],
                    ].map(([name, label, min, max]) => (
                      <label key={name}>
                        {label}
                        <input
                          type="number"
                          step="0.000001"
                          min={min}
                          max={max}
                          name={String(name)}
                          value={
                            coordinates[String(name) as keyof TaxiCoordinates]
                          }
                          onChange={(e) =>
                            changeCoordinates({
                              ...coordinates,
                              [String(name)]: e.target.value,
                            })
                          }
                          required
                        />
                      </label>
                    ))}
                  </div>
                  <p className="panel-intro">
                    الإحداثيات خاصة. دون اختيار مسار طرق أدناه، يعتمد الطلب
                    الاختباري المسافة المباشرة. لا يوجد خصم مالي حقيقي.
                  </p>
                  <label className="care-check">
                    <input type="checkbox" name="autoDispatch" />
                    أوافق على توزيع طلب الرحلة آلياً على سائق مؤهل في المدينة.
                    لا يتم القبول حتى يوافق السائق؛ قد لا يتوفر سائق.
                  </label>
                  <TaxiRoutePlanner
                    coordinates={coordinates}
                    onCoordinates={changeCoordinates}
                    quote={roadQuote}
                    onQuote={setRoadQuote}
                  />
                  <label className="care-check">
                    <input type="checkbox" required />
                    سأجهز وسيلة تثبيت مناسبة للحيوان وأقبل طلب النقل الاختباري.
                  </label>
                </CareForm>
              </section>
            )}
          </aside>
        </div>
      </div>
    </IdentityShell>
  );
}
