# 09 — المعمارية البرمجية التفصيلية

## التوجه
**Greenfield modular monolith** للنواة، workers منفصلة للوسائط والإشعارات والمهام الثقيلة، وتسمح حدود الوحدات بنقل خدمة مستقلة مع نمو الحمل. لا تبدأ بعشرات الخدمات أو Kubernetes بلا حاجة. كل قرار مهني موثق ADR ويوازن التكلفة وصيانة فريق صغير ونمو المنصة.

## Monorepo المقترح
```
petra/
  apps/
    web/           # Next.js public site + customer + doctor + clinic + admin + driver responsive shells
    api/           # NestJS REST API & application/domain modules
    mobile/        # React Native Expo mobile app when mobile phase begins
    workers/       # background jobs: notifications/media/payment reconciliation/reminders
  packages/
    ui/            # design system components, animation primitives, tokens
    contracts/     # DTOs, validation, typed shared interfaces, events (no secrets)
    config/        # shared lint/ts/env schemas
    testing/       # fixtures, harness, factories, contract tests
  infra/
    docker/        # local Compose infrastructure
    deployment/    # infrastructure templates & runbooks
  prisma-or-drizzle/
    schema/ migrations/ seeds/
  docs/            # ADR, diagrams, API, records, decision log
  legacy_reference/ # DO NOT COMPILE OR IMPORT
  AGENTS.md
```

## طبقات الخدمات
Client (Next.js/Expo) → API BFF (if needed) / NestJS HTTP → Application use cases → Domain invariants → Repository interfaces & DB adapter → PostgreSQL. Events from DB outbox → worker queues → integrations/media/realtime. All writes include actor, tenant/org, request ID, idempotency context when appropriate.

## الوحدات (Bounded Contexts)
- IdentityAuth: users, sessions, recovery, MFA, verification and devices.
- Organizations: clinics, branches, memberships, staff privileges, doctor affiliations.
- PetsCare: pets, consents, vaccine records, prescriptions, results, records and care plans.
- Scheduling: provider/resource availability, appointments, telehealth sessions.
- Commerce: catalogs, variants, inventory, PO, pricing, cart, orders, fulfillment, returns.
- Finance: accounting entities, journals, invoices, payments, settlement, payroll/earnings and restricted donations.
- Social: profiles, content, follows, interactions, reports and feed query.
- Messaging: conversations, participants, attachment permissions, read receipts.
- Media: assets, upload intents, validation, transcoding statuses, CDN.
- RescueAdoption: rescue cases, adoption applications, lost&found, approved rescue groups.
- Donations: campaign lifecycle, donors, payment intents, beneficiaries, disbursement orchestration (finance posts ledger).
- Transport: ride state and dispatch, driver credentials, transient location events.
- Hospitality: hotel/grooming bookings, capacity, payment.
- NotificationsLoyalty: reminders, templates, preferences, point transactions.
- Administration: moderation, approvals, CMS, reporting configuration, auditing, feature flags.

## قواعد الفصل
- كل Module يملك domain entities وخدماته وعملياته المنطقية؛ لا يستدعي كود بيانات وحدة أخرى مباشرة إلا عبر interface/domain event.
- transactional outbox داخل Postgres يضمن حفظ الحدث مع العملية الأصلية، مع مستهلك idempotent.
- جداول الكيانات المشتركة وقراءة التقارير تُستخدم views/projections، لا side effects من React.
- API validation Zod أو class-validator بحسب قرار ADR؛ error response consistent with code/requestId and localized safe message.
- API versions; cursor pagination للـ feeds والطلبات; optimistic concurrency version أو row locks عند الحاجة.
- media bucket منفصل مع signed URLs عند الخصوصية، quotas, scanning, transcoding workflow؛ إشعارات لا توقف الطلبات الأساسية.
- caching: keys include tenant/user authorization scopes; invalidation deterministic؛ لا تكاش بيانات طبية بذاكرة مشتركة دون تحكم.

## قرارات تقنية تبدأ بها (قابلة للتحسين المبرر)
- Next.js + React + TypeScript + Tailwind CSS + motion library suitable for React, RTL supported.
- NestJS API + PostgreSQL; ORM Prisma أو Drizzle حسب احتياج transactions/schema migrations مع ADR. PostgreSQL constraints at DB level where viable.
- Redis for BullMQ queues and approved cache/realtime coordination; object storage S3-compatible, CDN, managed media processing/encoder adapter; email/SMS/payment/map provider adapters.
- Auth: verified provider/standards, server-side session/access checks; admin MFA; never home-made token signing.
- Local dev: docker compose Postgres/Redis/compatible storage emulator; independent service credentials in untracked env; seeded demo test accounts.
- Tests: Vitest/Jest where applicable, Playwright E2E, contract tests, API integration with ephemeral DB, load tests with k6/Artillery when phase scheduled.

## Scalability roadmap
1. Initially database indexes/explain analyze, horizontal API replicas, CDN and queued media, basic search with PG; ensure p95 queries measured.
2. Read replicas/materialized reporting views after measurement; dedicated search engine only if queries demand it.
3. Separate media/realtime/social ranking/transport dispatch services by pressure and independent availability needs, preserving stable contracts and eventual consistency with reconciliation.
4. Multi-region only once business requirements/privacy budgets justify its consistency and legal complexities. Large user count doesn't alone mandate microservices.

## Important failure modes
- DB transaction committed but event queue fails: outbox worker retries.
- Payment webhook delayed: order remains awaiting authoritative confirmation; UI displays pending without optimistic finalization.
- Failed media processing: preview shows processing/retry, never broken 'published' state.
- Realtime offline: fetch from durable DB on reconnect.
- High traffic: back-pressure, rate limiting and graceful degradation for recommendation-heavy feeds, never for financial integrity.

## Diagrams
```
Web / Mobile
   |
API Gateway / NestJS Modular Core
  |    |      |      |
 Auth Care Commerce Finance ... Social/Taxi
  |         Postgres + Outbox
  |                |
  |           Redis Queues --------> Workers --> PSP/Media/SMS/Maps adapters
  |                                  |
  +---- Realtime Gateway -----------+ --> CDN/Object Storage
```

## Deployment runbook minimum
Environment config and secret manager, DB migration ordering (expand/contract), backup/restore drill, health checks, structured logs, alerts, deployment rollback, release flags, disaster recovery exercise, traffic test baseline.
