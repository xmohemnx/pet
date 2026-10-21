# AGENTS.md — binding repository instructions for Codex

## Priority and intent
The user owns the Petra product. Product constraints inside `README_START_HERE_AR.md`, `02_ROLES_AND_DASHBOARDS.md`, `05_ACCOUNTING_ERP.md`, `12_DESIGN_MOTION_SYSTEM.md`, and `17_ACCEPTANCE_TESTS.md` are binding. Build the NEW platform from scratch. Legacy code under `legacy_reference/` is read-only reference material; never import it into runtime or deploy it.

## Never violate
- Only dashboard personas: `platform_admin`, `clinic_member`, `doctor`, `driver`, `customer`. Role = set of capabilities, not a mutable string trusted from sign-up or client JWT claims without server enforcement. A person may be doctor + clinic member + customer; admin never self-registers.
- No standalone `store_owner` identity/dashboard/registration/navigation. Each store/catalog, product, inventory, service and merchant payout is linked to `clinic_id`/organization. Clinic staff can have scoped `commerce_manager`, `inventory_clerk`, `cashier`, `clinic_admin` permissions within clinic dashboard without becoming a 6th dashboard persona.
- No direct balance edits, unbalanced ledger entries, delete/update of posted journal, payment capture purely from client, money stored as floating point, payout without approval/reconciliation, or donation counter changes without verified settlement.
- No sharing another clinic's medical/patient/financial data through changing URL IDs or hidden UI tabs. Verify ownership server-side. Even admin actions audited.
- No fake medical diagnosis as a substitute for licensed clinicians. Medical recommendations limited to general education, and urgent alerts should route to professional/veterinary contact with region-specific verification.
- No production key in git; do not use old credentials. No licensed insurance claim unless legal/provider agreements confirmed.
- No gratuitous animations interfering with financial forms or accessibility. Honor `prefers-reduced-motion`, performance and viewport constraints.

## Engineering agreements
- Default architecture: pnpm workspace + turborepo optional; apps/web (Next.js), apps/api (NestJS), apps/mobile (Expo when phase scheduled), apps/workers; packages/ui, packages/contracts, packages/config; PostgreSQL (migrations), Redis (queues/cache); external media storage via adapters.
- Modular monolith with domain modules and events, database transaction boundaries. Keep domain services away from React components. Create an ADR before major deviations.
- Strict TypeScript, schema validation at API edge, DTOs/versioning, consistent error envelope, UTC timestamps, configurable locale/timezone, IQD as initial currency (other currencies only if enabled/configured), integer minor units/decimal as needed, explicit rounding policy.
- All state changing endpoints authenticated, authorized and validated. Monetary endpoints additionally idempotent with deterministic event and reference IDs. Implement audit records.
- Accessibility: semantic controls, keyboard focus, labeled forms, error summary, color contrast, RTL bidi-safe numeric displays, keyboard-friendly motion.
- New documents and user-facing UI text should be Arabic (Iraqi audience), professional Modern Standard/approachable; architect docs can contain English technical terms. No accidental mixed-direction text corruption.
- Prefer simple, tested mechanisms over distributed complexity. Workers for heavy video/notifications. Provider stubs only in sandbox with explicit labels.

## Workflow each phase
(1) consult requirements & dependencies; (2) define minimal implementable slice; (3) code with migrations and fixtures; (4) execute automated checks, record exact commands/results; (5) screenshot key UI states when possible; (6) update PROGRESS and traceability; (7) report blockers with concrete details. Do not mark phase complete without acceptance criteria. Never hide failing tests.

## Mandatory invariants
`SUM(journal_lines.debit) == SUM(journal_lines.credit)` per posted journal and currency/ledger entity; invoice totals independently recalculated server-side; no negative available inventory without controlled backorder; appointments cannot overlap provider/resource allocation; social/privacy rules apply to every feed and media query; doctor records read by permitted principals only; dispatcher assignment atomic; duplicate webhook/event yields one financial effect; dates stored UTC and localized on display.
