'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DeliveryAddressBook } from './delivery-address-book';
import { CatalogSearch } from './catalog-taxonomy';
import { StoreDepartments } from './store-departments';
import type {
  IdentityMe,
  Product,
  CustomerOrder,
  DeliveryAddress,
  CheckoutQuote,
} from '@petra/contracts';
import { formatIqd } from '@petra/contracts';
import { ProductReviews } from './product-reviews';
import { ShoppingBag, PawPrint } from 'lucide-react';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction } from './care-shared';
import { api } from '../lib/auth-client';
import {
  SandboxNotice,
  PlatformHeading,
  Empty,
  Status,
  mutate,
} from './platform-shared';
export function Marketplace({
  me,
  products: initialProducts,
  initialOrders,
  initialCart,
  initialWishlist,
  initialAddresses,
}: {
  me: IdentityMe;
  products: Product[];
  initialOrders: CustomerOrder[];
  initialCart: { product_id: string; quantity: number }[];
  initialWishlist: string[];
  initialAddresses: DeliveryAddress[];
}) {
  const [products, setProducts] = useState(initialProducts),
    [catalogResults, setCatalogResults] = useState<Product[] | null>(null);
  const [usingAdvanced, setUsingAdvanced] = useState(false),
    [searchEpoch, setSearchEpoch] = useState(0);
  function acceptCatalogResults(results: Product[] | null) {
    setCatalogResults(results);
    if (results)
      setProducts((previous) => [
        ...new Map([...previous, ...results].map((p) => [p.id, p])).values(),
      ]);
  }
  const [addresses, setAddresses] = useState(initialAddresses),
    [chosenAddress, setChosenAddress] = useState('');
  const [couponCodes, setCouponCodes] = useState<Record<string, string>>({}),
    [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [q, setQ] = useState(''),
    [cart, setCart] = useState<Record<string, number>>(
      Object.fromEntries(initialCart.map((i) => [i.product_id, i.quantity])),
    ),
    [orders, setOrders] = useState(initialOrders),
    [key, setKey] = useState('');
  const [wishlist, setWishlist] = useState(initialWishlist),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  const [category, setCategory] = useState(''),
    [species, setSpecies] = useState(''),
    [clinic, setClinic] = useState(''),
    [city, setCity] = useState(''),
    [brand, setBrand] = useState(''),
    [availableOnly, setAvailableOnly] = useState(false),
    [maxPrice, setMaxPrice] = useState('');
  const choices = (
    key: 'category' | 'species' | 'clinic_name' | 'city' | 'brand',
  ) =>
    [
      ...new Set(products.map((p) => p[key]).filter((x): x is string => !!x)),
    ].sort();
  async function refresh() {
    setOrders(await api<CustomerOrder[]>('me/orders'));
  }
  const selected = products.filter((p) => cart[p.id]);
  const quoteInput = () => ({
    items: selected.map((p) => ({ productId: p.id, quantity: cart[p.id]! })),
    coupons: [...new Set(selected.map((p) => p.clinic_id))]
      .filter((id) => couponCodes[id]?.trim())
      .map((clinicId) => ({ clinicId, code: couponCodes[clinicId]!.trim() })),
  });
  const total = selected.reduce(
    (s, p) => s + BigInt(p.price_minor) * BigInt(cart[p.id]!),
    0n,
  );
  function change(id: string, n: number) {
    setQuote(null);
    setCart({
      ...cart,
      [id]: Math.min(10000, Math.max(0, Math.trunc(n) || 0)),
    });
    setKey(crypto.randomUUID());
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading
        eyebrow="متاجر العيادات المعتمدة"
        title="كل ما يحتاجه رفيقك"
      >
        منتجات تبيعها وتدير مخزونها عيادات Petra.
      </PlatformHeading>
      <StoreDepartments
        externalSearch={usingAdvanced}
        onResults={(results) => {
          acceptCatalogResults(results);
          setUsingAdvanced(false);
          setSearchEpoch((n) => n + 1);
          setQ('');
          setCategory('');
          setSpecies('');
          setClinic('');
          setCity('');
          setBrand('');
          setMaxPrice('');
          setFavoritesOnly(false);
          setAvailableOnly(false);
        }}
      />
      <SandboxNotice />
      <div className="market-layout">
        <section>
          <label className="care-standalone-label">
            البحث في المنتجات
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="اسم منتج أو عيادة"
            />
          </label>
          <CatalogSearch
            key={searchEpoch}
            query={q}
            onResults={(results) => {
              acceptCatalogResults(results);
              setUsingAdvanced(results !== null);
            }}
          />

          <div className="catalog-filters">
            <label>
              التصنيف
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">كل التصنيفات</option>
                {choices('category').map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              نوع الحيوان
              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
              >
                <option value="">كل الأنواع</option>
                {choices('species').map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              العيادة
              <select
                value={clinic}
                onChange={(e) => setClinic(e.target.value)}
              >
                <option value="">كل العيادات</option>
                {choices('clinic_name').map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              المدينة
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">كل المدن</option>
                {choices('city').map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              العلامة التجارية
              <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">كل العلامات</option>
                {choices('brand').map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              أقصى سعر
              <select
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              >
                <option value="">أي سعر</option>
                <option value="25000000">25,000 د.ع.</option>
                <option value="50000000">50,000 د.ع.</option>
                <option value="100000000">100,000 د.ع.</option>
              </select>
            </label>
          </div>
          <label className="care-check">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
            />
            المتوفر في المخزون فقط
          </label>
          <label className="care-check">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
            />
            المفضلة فقط
          </label>
          <div className="market-products">
            {(catalogResults ?? products)
              .filter(
                (p) =>
                  `${p.name} ${p.clinic_name} ${p.species} ${p.brand} ${p.category} ${p.variant_label}`
                    .toLocaleLowerCase('ar')
                    .includes(q.toLocaleLowerCase('ar')) &&
                  (!favoritesOnly || wishlist.includes(p.id)) &&
                  (!category || p.category === category) &&
                  (!species || p.species === species || p.species === 'all') &&
                  (!clinic || p.clinic_name === clinic) &&
                  (!city || p.city === city) &&
                  (!brand || p.brand === brand) &&
                  (!availableOnly || p.available > 0) &&
                  (!maxPrice || BigInt(p.price_minor) <= BigInt(maxPrice)),
              )
              .map((p) => (
                <article className="panel market-card" key={p.id}>
                  <div className="market-product-art">
                    {p.images?.[0] ? (
                      <img
                        src={`/api/v1/media/${p.images[0].asset_id}/file`}
                        alt={p.images[0].alt}
                      />
                    ) : (
                      <PawPrint size={50} aria-hidden="true" />
                    )}
                  </div>
                  <p className="eyebrow">
                    <Link href={`/marketplace/stores/${p.clinic_id}`}>
                      {p.store_name ?? p.clinic_name}
                    </Link>
                  </p>
                  <h2>
                    <Link href={`/marketplace/products/${p.id}`}>{p.name}</Link>
                  </h2>
                  {p.variant_label && <p>{p.variant_label}</p>}
                  {p.description && <p>{p.description}</p>}
                  <strong>{formatIqd(p.price_minor)}</strong>
                  <CareAction
                    action={async () => {
                      setWishlist(
                        await api<string[]>(`products/${p.id}/wishlist`, {
                          method: 'POST',
                          body: JSON.stringify({
                            enabled: !wishlist.includes(p.id),
                          }),
                        }),
                      );
                    }}
                  >
                    {wishlist.includes(p.id)
                      ? 'إزالة من المفضلة'
                      : 'إضافة للمفضلة'}
                  </CareAction>
                  <ProductReviews productId={p.id} />
                  <p>{p.available} قطعة متاحة</p>
                  <label>
                    كمية {p.name}
                    <input
                      type="number"
                      min="0"
                      max={Math.min(p.available, 10000)}
                      value={cart[p.id] ?? 0}
                      onChange={(e) =>
                        change(
                          p.id,
                          Math.max(
                            0,
                            Math.min(p.available, Number(e.target.value)),
                          ),
                        )
                      }
                    />
                  </label>
                </article>
              ))}
          </div>
          {catalogResults !== null && !catalogResults.length && (
            <Empty>
              لا توجد نتائج مطابقة للتصنيف والوسم والبحث الحالي. اختيارات السلة
              محفوظة.
            </Empty>
          )}
          {catalogResults === null && !products.length && (
            <Empty>
              لا توجد منتجات منشورة بعد. تظهر منتجات العيادات بعد إضافتها
              واستلام مخزونها.
            </Empty>
          )}
        </section>
        <aside className="care-stack">
          <DeliveryAddressBook
            initial={initialAddresses}
            onChanged={(next) => {
              setAddresses(next);
              if (chosenAddress && !next.some((a) => a.id === chosenAddress)) {
                setChosenAddress('');
                setKey(crypto.randomUUID());
              }
            }}
          />
          <section className="panel care-section">
            <h2>
              <ShoppingBag size={22} />
              سلتك
            </h2>
            {selected.length ? (
              selected.map((p) => (
                <p key={p.id}>
                  {p.name} × {cart[p.id]}
                </p>
              ))
            ) : (
              <Empty>اختر كمية لمنتج لإضافته إلى السلة.</Empty>
            )}
            <strong>{formatIqd(total.toString())}</strong>
            {selected.length > 0 && (
              <>
                {[...new Set(selected.map((p) => p.clinic_id))].map((id) => (
                  <label key={id}>
                    كوبون{' '}
                    {selected.find((p) => p.clinic_id === id)!.clinic_name}
                    <input
                      value={couponCodes[id] ?? ''}
                      maxLength={32}
                      dir="ltr"
                      onChange={(e) => {
                        setCouponCodes({
                          ...couponCodes,
                          [id]: e.target.value,
                        });
                        setQuote(null);
                        setKey('');
                      }}
                    />
                  </label>
                ))}
                <CareAction
                  action={async () => {
                    setQuote(null);
                    setQuote(
                      await api<CheckoutQuote>('checkout/quote', {
                        method: 'POST',
                        body: JSON.stringify(quoteInput()),
                      }),
                    );
                    setKey('');
                  }}
                >
                  معاينة السعر النهائي
                </CareAction>
                {quote && (
                  <div
                    role="region"
                    aria-label="السعر النهائي"
                    className="order-group"
                  >
                    {quote.groups.map((g) => (
                      <div key={g.clinicId}>
                        <h3>{g.clinicName}</h3>
                        <p>
                          المنتجات {formatIqd(g.subtotalMinor)} · الخصم{' '}
                          {formatIqd(g.discountMinor)}
                          {g.couponCode && ` (${g.couponCode})`}
                        </p>
                        <p>
                          {g.taxLabel || 'ضريبة'}: {formatIqd(g.taxMinor)} ·
                          الإجمالي {formatIqd(g.totalMinor)}
                        </p>
                      </div>
                    ))}
                    <strong>إجمالي الطلب {formatIqd(quote.totalMinor)}</strong>
                  </div>
                )}
              </>
            )}
            <CareAction
              action={async () => {
                await mutate('me/cart', {
                  items: selected.map((p) => ({
                    productId: p.id,
                    quantity: cart[p.id],
                  })),
                });
              }}
            >
              حفظ السلة لحسابي
            </CareAction>
            {selected.length > 0 && (
              <CareForm
                label="حجز الطلب الاختباري"
                submit={async (f) => {
                  if (!quote)
                    throw new Error('عاين السعر النهائي قبل حجز الطلب');
                  const attempt = key || crypto.randomUUID();
                  setKey(attempt);
                  await mutate('checkout', {
                    idempotencyKey: attempt,
                    ...quoteInput(),
                    quoteHash: quote.quoteHash,
                    ...(chosenAddress
                      ? { addressId: chosenAddress }
                      : { address: f.get('address') }),
                  });
                  setCart({});
                  setQuote(null);
                  setKey('');
                  await refresh();
                }}
              >
                <label>
                  عنوان محفوظ
                  <select
                    value={chosenAddress}
                    onChange={(e) => {
                      setChosenAddress(e.target.value);
                      setKey(crypto.randomUUID());
                    }}
                  >
                    <option value="">أدخل عنواناً مباشراً</option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  عنوان التسليم الخاص
                  <textarea
                    name="address"
                    minLength={5}
                    maxLength={3000}
                    required={!chosenAddress}
                    disabled={!!chosenAddress}
                    onChange={() => setKey('')}
                  />
                </label>
                <p className="panel-intro">
                  الأسعار والكمية النهائية يتحقق منهما الخادم. الحجز 20 دقيقة،
                  والتحصيل الاختباري خطوة منفصلة.
                </p>
              </CareForm>
            )}
          </section>
        </aside>
      </div>
      <section className="care-section">
        <h2>طلباتي</h2>
        {!orders.length && <Empty>لم تنشئ طلبًا بعد.</Empty>}
        {orders.map((o) => (
          <article className="panel care-section" key={o.id}>
            <div className="care-heading">
              <h3>طلب #{o.id.slice(0, 8)}</h3>
              <strong>{formatIqd(o.total_minor)}</strong>
              <Status value={o.status} />
            </div>
            <p>
              المنتجات {formatIqd(o.subtotal_minor)} · الخصم{' '}
              {formatIqd(o.discount_minor)} · الضريبة {formatIqd(o.tax_minor)}
            </p>
            {o.status === 'reserved' && (
              <div className="inline-actions">
                <CareAction
                  action={async () => {
                    await mutate(`sandbox/orders/${o.id}/capture`, {
                      eventKey: crypto.randomUUID(),
                    });
                    await refresh();
                  }}
                >
                  تحصيل اختباري
                </CareAction>
                <CareAction
                  action={async () => {
                    await mutate(`orders/${o.id}/cancel`);
                    await refresh();
                  }}
                >
                  إلغاء الطلب
                </CareAction>
              </div>
            )}
            {o.children.map((c) => (
              <div className="order-group" key={c.id}>
                <h3>
                  {c.clinic_name} <Status value={c.status} />
                  {c.shipment && (
                    <p>
                      الناقل: {c.shipment.carrier} · التتبع:{' '}
                      {c.shipment.tracking_code}
                    </p>
                  )}
                  {c.shipment_events?.map((e, n) => (
                    <p key={n}>
                      {e.status} ·{' '}
                      {new Intl.DateTimeFormat('ar-IQ', {
                        timeZone: 'Asia/Baghdad',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(e.created_at))}
                    </p>
                  ))}
                </h3>
                {c.coupon_code && (
                  <p>
                    الكوبون: {c.coupon_code} · الخصم{' '}
                    {formatIqd(c.discount_minor)}
                  </p>
                )}
                {BigInt(c.tax_minor) > 0n && (
                  <p>
                    {c.tax_label}: {formatIqd(c.tax_minor)}
                  </p>
                )}
                {c.lines.map((l) => (
                  <div key={l.id} className="care-list-row">
                    <div>
                      <h4>
                        {l.name} × {l.quantity}
                      </h4>
                      <p>
                        {formatIqd(l.total_minor)} · أُعيدت{' '}
                        {l.returned_quantity}
                      </p>
                    </div>
                    {['delivered', 'returned'].includes(c.status) && (
                      <ProductReviews productId={l.product_id} lineId={l.id} />
                    )}
                    {c.status === 'delivered' &&
                      l.returned_quantity < l.quantity && (
                        <details>
                          <summary>طلب إرجاع</summary>
                          <CareForm
                            label="إرسال طلب الإرجاع"
                            submit={async (f) => {
                              await mutate(`order-lines/${l.id}/returns`, {
                                quantity: Number(f.get('qty')),
                                reason: f.get('reason'),
                              });
                            }}
                          >
                            <label>
                              كمية الإرجاع
                              <input
                                type="number"
                                name="qty"
                                min="1"
                                max={l.quantity - l.returned_quantity}
                                defaultValue="1"
                                required
                              />
                            </label>
                            <label>
                              سبب الإرجاع
                              <textarea
                                name="reason"
                                minLength={10}
                                maxLength={3000}
                                required
                              />
                            </label>
                          </CareForm>
                        </details>
                      )}
                  </div>
                ))}
              </div>
            ))}
          </article>
        ))}
      </section>
    </IdentityShell>
  );
}
