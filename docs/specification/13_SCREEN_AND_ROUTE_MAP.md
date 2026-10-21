# 13 — شجرة صفحات الويب وشاشات التطبيق

> أسماء routes مقترحة، تُراجع مع team قبل final routing. البيانات عبر API server وauthenticated role check. لا route منفصل لـ store owner.

## Public
`/`, `/about`, `/care`, `/clinics`, `/clinics/:slug`, `/doctors`, `/doctors/:slug`, `/services`, `/marketplace`, `/marketplace/products/:slug`, `/marketplace/clinics/:slug`, `/social/explore` (public-safe), `/adoption`, `/adoption/:id`, `/rescue`, `/lost-found`, `/donations` (only legal-enabled), `/donations/:id`, `/pet-taxi`, `/faq`, `/support`, `/contact`, `/terms`, `/privacy`, `/login`, `/register`, `/recover`, `/verify`, `/not-found`.

## Customer `/app`
`/app/home`, `/app/pets`, `/app/pets/new`, `/app/pets/:id`, `/app/pets/:id/care`, `/app/pets/:id/vaccines`, `/app/pets/:id/passport`, `/app/pets/:id/records`, `/app/pets/:id/labs`, `/app/pets/:id/prescriptions`, `/app/care/calendar`, `/app/care/plans`, `/app/appointments`, `/app/appointments/new`, `/app/appointments/:id`, `/app/consultations`, `/app/marketplace/cart`, `/app/checkout`, `/app/orders`, `/app/orders/:id`, `/app/wishlist`, `/app/social`, `/app/social/reels`, `/app/social/stories`, `/app/social/profile/:handle`, `/app/messages`, `/app/messages/:id`, `/app/adoptions`, `/app/adoptions/applications`, `/app/rescue`, `/app/lost-found`, `/app/donations`, `/app/taxi`, `/app/taxi/rides`, `/app/hotel`, `/app/grooming`, `/app/loyalty`, `/app/notifications`, `/app/settings`, `/app/support`.

## Doctor `/doctor`
`/doctor/home`, `/doctor/onboarding`, `/doctor/profile`, `/doctor/affiliations`, `/doctor/schedule`, `/doctor/appointments`, `/doctor/appointments/:id`, `/doctor/patients`, `/doctor/patients/:petId/encounters`, `/doctor/prescriptions`, `/doctor/labs`, `/doctor/consultations`, `/doctor/earnings`, `/doctor/social`, `/doctor/notifications`, `/doctor/settings`.

## Clinic `/clinic/:clinicId`
`/home`, `/profile`, `/branches`, `/staff`, `/doctors`, `/schedule`, `/appointments`, `/appointments/:id`, `/patients` (with authorization), `/services`, `/care-plans`, `/labs`, `/grooming`, `/hotel`, `/reviews`, `/social`, `/messages`, `/rescue`, `/taxi-request`, `/commerce` (overview), `/commerce/catalog`, `/commerce/products/new`, `/commerce/products/:id/edit`, `/commerce/services`, `/commerce/categories`, `/commerce/inventory`, `/commerce/warehouses`, `/commerce/suppliers`, `/commerce/purchases`, `/commerce/orders`, `/commerce/orders/:id`, `/commerce/returns`, `/commerce/promotions`, `/commerce/storefront-settings`, `/finance`, `/finance/invoices`, `/finance/receipts`, `/finance/payables`, `/finance/expenses`, `/finance/journals`, `/finance/cash-and-banks`, `/finance/settlements`, `/finance/reports`, `/finance/accounting-periods`, `/settings`, `/staff-permissions`.

## Driver `/driver`
`/driver/onboarding`, `/driver/home`, `/driver/availability`, `/driver/requests`, `/driver/rides`, `/driver/rides/:id`, `/driver/map`, `/driver/vehicle`, `/driver/documents`, `/driver/earnings`, `/driver/payouts`, `/driver/incidents`, `/driver/support`, `/driver/settings`.

## Admin `/admin`
`/admin/home`, `/admin/accounts`, `/admin/clinics`, `/admin/clinics/:id`, `/admin/doctors`, `/admin/drivers`, `/admin/verification`, `/admin/content`, `/admin/reports`, `/admin/moderation`, `/admin/marketplace`, `/admin/orders`, `/admin/appointments`, `/admin/pet-registry` (restricted access), `/admin/rescue`, `/admin/adoption`, `/admin/donations`, `/admin/taxi`, `/admin/financial` (overview), `/admin/financial/ledger`, `/admin/financial/chart-of-accounts`, `/admin/financial/journals`, `/admin/financial/ar`, `/admin/financial/ap`, `/admin/financial/settlements`, `/admin/financial/banks`, `/admin/financial/donations`, `/admin/financial/period-close`, `/admin/financial/reports`, `/admin/cms`, `/admin/notifications`, `/admin/settings`, `/admin/security-audit`.

## Surface matrix
- Public + customer: visually rich interactive, conversion and clarity.
- Doctor/clinic: high information density with clear motions and keyboard workflows.
- Driver: mobile-first large touch targets and offline-safe statuses.
- Admin/accounting: large monitors/tablet adapt, immutability cues, audit views, role-based disabled states with explanations.

## Routing test rule
Every route has: required scopes, tenant context, layout, error boundary, loading/empty/denied states, breadcrumb/active nav, functional API association; catalog routes should be SEO-friendly, authenticated routes noindex.
