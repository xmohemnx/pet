# 16 — خطة التنفيذ المرحلية الفعلية | لا تبنِ الموقع بأمر واحد

> كل مرحلة تبدأ من بيانات المرحلة السابقة وتنتج كوداً يمكن تشغيله واختباره. التوقيت والميزانية يعتمد على الفريق، التكاملات، ومعايير الجودة؛ لا يعد Codex بزمن تسليم ثابت. ما يلي ترتيب وتبعيات، ليس مدة تنفيذ.

## Phase 00 — Discovery, foundation, product map
**Input** docs + legacy_reference; **Output** ADR-000, diagrams, requirements traceability, sitemap, workflow maps, data dictionary v1, monorepo and toolchain, local Docker services, env.example, format/lint/typecheck/build/test CI, README dev instructions.
- UI proof of concept: animated landing hero + design tokens + one customer shell + clinic finance layout using demonstrative placeholders clearly labeled design-only.
- Gate: repository bootstraps clean on fresh environment, no secrets, CI green, architecture + five dashboards and clinic commerce agreement documented.

## Phase 01 — Identity, authorization, organizations
**Build** sign-up/login/recovery/MFA admin, profile, clinics + branches + doctor affiliations, staff invitations, memberships, scoped permissions, user workspace switcher, admin verification pipeline, audited role grants.
- Gate: cross-role and cross-clinic tests; no self-register admin/store_owner, unauthorized requests rejected.

## Phase 02 — Pet profiles + Care Center foundations
**Build** pet CRUD, guardians/consents, medical access audit, vet directory, service catalog and availabilities, appointments + concurrency guard, visit records, vaccines/reminders/passport, prescriptions/lab workflow.
- Gate: full end-to-end owner→pet→booking→doctor→signed visit→reminder. Private data access denial tests.

## Phase 03 — Clinic dashboard & marketplace integration
**Build** clinic staff/branches/doctor schedule, services; clinic-owned storefront inside dashboard, product variants/catalog, inventory movement, PO/GRN/vendor, cart/checkout sandbox, multi-clinic orders and returns.
- Gate: clinic→product→customer order→stock reservation→delivery→return test; no store owner routes.

## Phase 04 — Accounting Core / Business transactions
**Build** chart of accounts, ledger entities, posted journal DB invariants, periods, approvals, invoices, receivables/payables, cash/banks, sale / COGS / commission posting and clinic settlement; clinic finance views and admin reports.
- Gate: all examples from `21_FINANCIAL_EXAMPLES.md`; duplicate events idempotent; trial balance and reconciliation correct. Payments remain sandbox until provider legal approval.
- NOTE: develop Finance event contract in Phase 00, scaffold actual ledger before any real transaction is processed. Never defer financial integrity until after real-money launch.

## Phase 05 — Care Plans, wellness + lodging/grooming
**Build** plans/entitlements, expiry, renewals, verified usage, deferred revenue, care content, medical consultation chat with authorized access, grooming/hotel rooms/booking and invoices.
- Gate: no double entitlement redemption, no overbook, continuity of care record, protected documents.

## Phase 06 — Social / Reels / Stories / Direct
**Build** social profile, posts, interactions/follows, privacy, moderation, async media, reels transcoding, story expiry, direct messaging/realtime with reconnect and blocked privacy, notifications.
- Gate: no privacy bypass; async worker retries; video performant; reduced motion; moderation admin functioning.

## Phase 07 — Adoption/Rescue/SOS/Lost & Found
**Build** adoption listings/applications, verified rescue ops, case handling, lost and found, safety/privacy policies, auditing/moderation. Begin donation campaigns in SANDBOX / legal-gated mode.
- Gate: secure private applicant data, rescue status transitions and campaign figures confirmed only by events.

## Phase 08 — Taxi and driver financial integration
**Build** driver verification and vehicle, quote, dispatch, atomic accept, live trip location with TTL, driver settlements, cancellation/dispute and operational dashboard.
- Gate: dispatch race test; current-only driver location; finance exactness and permissions.

## Phase 09 — Production hardening / compliance / launch
**Build/verify** CMS sections, analytics/retention policies, reporting, admin moderation/support, performance profiling, scalable CDN architecture, automated E2E/regression, accessibility, SEO, privacy policies, backup+restore, red team and payment certification/legal checks, localization audits and runbooks.
- Gate: no P0 findings, realistic load tests, independent security and finance review, operational signoff, controlled staged launch.

## Phase 10 — Mobile applications / Growth
Build Expo customer and driver native experiences (then doctor/clinic as priority demands) using same API, push notifications, background restrictions, offline safety, deep links, analytics and crash reporting. No hidden split-brain database logic; app store submission requires review and provisioning.

## Work package per phase
- Tasks <= 1–3 day developer sized units, clear dependencies, feature flags, schemas/migrations, API and UI vertical slices, tests, owner review and screenshots.
- Progress fields: `feature_id`, `phase`, `scope`, `owner`, `status`, `PR link`, `migration`, `tests`, `security review`, `UX review`, `acceptance evidence`.
- Codex agent work separation permitted only for independent modules. Ledger and auth architecture require integrated review; agents must not concurrently edit shared migrations or RBAC policies without coordination.
