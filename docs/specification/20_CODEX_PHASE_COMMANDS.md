# 20 — الأوامر المتسلسلة لـ Codex: انسخ الأمر الخاص بالمرحلة

## بعد فتح الحزمة
```
Read README_START_HERE_AR.md, AGENTS.md, CODEX_MASTER_PROMPT.md and all numbered requirements. Inspect legacy_reference ONLY as behavior/design evidence. Confirm that the new product has exactly five dashboards and clinic-owned commerce, full double-entry accounting, complete care center, and professional animated Arabic RTL UX. Create requirements traceability and Phase 00 architecture, then implement the Phase 00 foundation and motion proof-of-concept with executable tests. Do not touch any live external providers.
```

## Phase 01 — accounts & clinic identity
```
Implement Phase 01 from 16_IMPLEMENTATION_ROADMAP.md as full vertical slices: customer identity, authentication, admin MFA, verified doctor/clinic/driver applications, memberships, granular clinic permissions, secure workspace switching. No store owner role or dashboard. Add migrations/API/UI/tests for cross-tenant and privilege escalation. Update progress documentation with exact run outputs.
```

## Phase 02 — Care Center
```
Implement Pet 360 and Care Center in 03_CARE_AND_MEDICAL.md: pets, guardian permissions, medical record, vaccines, reminders, passport, appointments with race-safe slots, doctor encounters, prescription/labs and privacy. Preserve consent and retention safeguards; do not generate clinical advice. Complete documented acceptance tests before the next feature.
```

## Phase 03 — Clinic commerce
```
Implement the clinic-owned Marketplace from 04_CLINIC_MARKETPLACE.md. All management and financial tabs belong inside the Clinic Dashboard with scoped staff privileges. Build product catalog, warehouses, stock movements, purchasing, customer checkout sandbox, clinic-split orders and returns. Provide E2E proof that no standalone store-owner route, role or dashboard exists.
```

## Phase 04 — Finance + reporting
```
Implement 05_ACCOUNTING_ERP.md and 21_FINANCIAL_EXAMPLES.md. Build immutable balanced double-entry general ledger for platform and clinic entities, invoice/receivable/payable, cash/bank, inventory costing, commission, clinic/doctor/driver settlement, refunds, restricted donations and financial reports. Use transaction boundaries, approvals, source-referenced journals and idempotent webhook ingestion. Prove tests including 3 duplicate payment webhooks and an exact reversal. Keep all external payments sandbox.
```

## Phase 05 — Care plans / hospitality
```
Complete care packages, entitlements, renewal and deferred revenue; grooming/hotel booking and capacity constraints. Ensure clinic-provided services integrate scheduling, invoices and customer/clinic dashboards. Never label a plan legal insurance without licensed partner confirmation.
```

## Phase 06 — Social & advanced animated interactions
```
Build posts, follow graph, reactions, moderated media uploads, Reels adaptive playback with background processing, Story lifecycle, direct messages with realtime and privacy/reconnect, notifications and feed. Follow Motion tokens and reduced-motion rules. Do not bypass safety, authorization or CDN privacy.
```

## Phase 07 — Rescue/adoption/donations
```
Implement adoption and rescue workflows, SOS and Lost&Found. Donation campaign payment and payouts must stay in explicit sandbox until real provider and legal authorization. Audit all transitions and ensure restricted fund journal handling.
```

## Phase 08 — Pet Taxi
```
Implement verified driver dashboard, quotes, race-safe dispatch and trip states, location consent+TTL, incidents and financial driver earnings/settlements, integrate with admin and clinic booking contexts.
```

## Phase 09 — Launch audit
```
Perform exhaustive Phase 09 tests/security/performance/RTL/accessibility and operational deployment checks. Produce an honest launch readiness report with pass/fail, unresolved dependencies, screenshots and real test commands; do not claim compliant or million-user capable without independent testing.
```

## Generic review prompt after EVERY phase
```
Review implementation against AGENTS.md, 17_ACCEPTANCE_TESTS.md and traceability matrix. List every missing or partially implemented requirement, hardcoded mock, silent failure, security/ledger issue, non-working action and motion/RTL problem. Fix P0/P1 first, rerun tests, and produce a diff-based report. Never mark incomplete as done.
```
