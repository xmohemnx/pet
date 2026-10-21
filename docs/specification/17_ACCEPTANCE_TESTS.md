# 17 — اختبارات القبول (Definition of Done) | تطبيق فعلي لا استعراض

## Global Release Gates
1. fresh clone → install → env.example→local services→migrate→seed→run web/api succeeds documented.
2. lint/typecheck/build/unit/integration/contract/E2E green with exact commands logged.
3. all endpoints validate inputs and authorize actor/tenant; critical data cannot be obtained by changing IDs.
4. five dashboards only; internal clinic commerce works with scoped staff roles.
5. all CRUD states persistent and reflected consistently across refresh/relogin, skeleton/empty/error/offline state defined.
6. production routes never use fake data/metrics, simulated payments or unapproved media assets.
7. RTL/accessibility/reduced-motion and mobile responsive UI tests; camera-less keyboard navigation.
8. DB backups/restore tested, zero P0 security, finance integration with reconciliation and maker-checker audit.

## AT-IDENTITY
- New customer account has no admin, doctor, clinic or store owner powers.
- Doctor verified for clinic A but not clinic B cannot access B patient/appointment.
- Doctor member of clinic A and B chooses each workspace with separate context; unauthorized switching denied.
- Admin MFA + audit logs; revoked session cannot perform privileged operation.

## AT-CARE
- Two concurrent users book one slot; exactly one succeeds.
- Owner consents to doctor access, revokes it; doctor access stops except separately justified record retention.
- Signed visit medical note has immutable original/addendum workflow.
- Vaccine due reminders update status and do not invent schedules.
- Subscription entitlement duplicate redemption produces one usage item.

## AT-COMMERCE
- Product belongs to clinic; clinic B cannot edit clinic A product or see finance.
- Clinic staff manage product and inventory **within clinic dashboard**. No sixth dashboard.
- Cart multiple clinics -> split orders and payments snapshot correct totals.
- Concurrent orders with stock 1 -> one reserved, no negative stock.
- Partial return -> correct stock movement, credit note, commission reversal and payout adjustment.

## AT-ACCOUNTING
- Posted journals balanced exactly; any imbalance rejected DB-side and service-side.
- Posted journal cannot be updated or deleted; reversal entry linked and approved.
- Duplicate PSP webhook -> one captured payment, one ledger financial event, one receipt.
- Simulate donation 100, fee 5: liability to beneficiary 95, fee 5 only with legal policy; not 100 unrestricted revenue.
- Bank reconciliation exact, statement and accounting ledger reconcile; unbalanced report blocks close.
- Clinic A finance API cannot retrieve clinic B journals/payouts (including pagination/export).
- Driver balance derived from ledger and cannot be overwritten via API.
- Closed period cannot accept unauthorized backdated posting.
- Period-end trial balance reports debit=credit; profit/loss and balance sheet reconcile according to defined policy.

## AT-SOCIAL
- Block/privacy suppresses posts/messages/reels/story access by unauthorized actor (including media links).
- Reels with slow upload show retry/progress, publish only after processing; delete revokes access consistent with policies.
- Expired stories excluded from feed.
- Direct chat reconnect replays durable messages without duplication.
- Abuse report exists and moderation action audited.

## AT-SERVICES
- Driver claim race: one accepted assignment.
- Inactive taxi ride: no ongoing precise tracking available to other users.
- Pet hotel dates over capacity rejected even with concurrent requests.
- SOS cannot claim real professional dispatch unless accepted by verified provider.
- Donation campaign can only increase from confirmed payments, and refunds/chargebacks reflected accurately.

## AT-MOTION-UX
- Website home makes premium animated first impression on 390px and 1440px devices, no horizontal overflow, labels legible, CTA and navigation functional.
- `prefers-reduced-motion` removes parallax and nonessential animation; layout remains complete.
- 100+ products / 100+ rows admin finance remain responsive; long scroll and virtualized table where needed.
- Keyboard users can complete login, checkout, appointment and finance approval without hover/drag-only controls.
- LCP/INP/CLS and frame metrics measured and logged; failures documented and optimized rather than guessed.

## Test matrix and evidence
Unit: formulas/domain guards/state transitions. Integration: DB transaction/idempotency/RBAC/closed periods. E2E: 10 primary user journeys. Contract: typed client↔API. Performance: load profile and baseline traces. Security: SAST/DAST manually prioritized to OAuth/RBAC/webhooks/media/money, independent review. Accessibility: axe-like checks + manual keyboard/RTL. Visual regression: homepage, social, clinic accounting, admin and mobile states.

## Prohibition
DO NOT mark as done when only a front-end component renders, when data is fake on a production route, when test commands are not executed, or when a financial/legal/provider integration lacks verification.
