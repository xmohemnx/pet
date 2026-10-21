# 10 — نموذج بيانات المنصة والأحداث

## مبادئ قاعدة البيانات
PostgreSQL relation-first مع migrations تاريخية وقابلة للإعادة في بيئة نظيفة. جميع جداول بيانات المؤسسات الحساسة لها `organization_id`/`clinic_id` حسب الملكية، وتحقق خادم/DB من العلاقات. مفاتيح UUID أو ULID حسب ADR، timestamps UTC، `created_by`, `updated_by`, `row_version`, soft-delete عند الحاجة مع retention. استخدام `CHECK`, `UNIQUE`, FKs, exclusion constraint / locks لمنع الحجز المكرر، الفهارس والبحث المدروس.

## تجميع الجداول (مقترح لا يُنفذ حرفياً دون design review)

| المجال | نماذج/جداول الحد الأدنى | القيود المحورية |
|---|---|---|
| الهوية | users, profiles, sessions, verification_requests, permissions, grants | لا امتيازات من self-signup |
| المنظمة | clinics, clinic_branches, memberships, doctor_profiles, doctor_affiliations | membership-scoped access |
| الرعاية | pets, pet_guardians, consents, encounters, diagnoses, vaccinations, care_tasks, prescriptions, prescription_items, lab_orders, lab_results, medical_attachments | تعلق بالسجل والنسخ والأذونات |
| الحجوزات | service_catalog, provider_schedules, schedule_exceptions, appointment_slots, appointments, resources | no double booking |
| التجارة | clinic_storefronts, categories, products, variants, price_lists, warehouses, inventory_movements, reservations, suppliers, purchase_orders, goods_receipts, carts, checkout_sessions, orders, clinic_orders, order_items, deliveries, returns | EVERY storefront has clinic_id |
| المحاسبة | ledger_entities, chart_of_accounts, accounting_periods, journal_entries, journal_lines, approvals, invoices, credit_notes, receipts, payment_intents, transactions, provider_events, clinic_settlements, payouts, bank_reconciliation, vendor_bills, cost_centers, donation_funds | balanced immutable ledger, idempotency |
| Petra Social | social_profiles, posts, attachments, comments, reactions, follow_edges, story_assets, stories, story_views, reels, conversations, participants, messages, message_receipts, moderation_cases, blocks | query-level privacy |
| الإنقاذ | adoption_listings, adoption_applications, rescue_cases, rescue_case_updates, lost_found_alerts, rescue_orgs | verified assignment and PII privacy |
| التبرعات | beneficiaries, campaigns, donation_intents, donations, donation_disbursements, fundraising_reports | verified provider funds only |
| التاكسي | driver_profiles, vehicles, driver_documents, ride_requests, ride_assignments, ride_events, location_points (short TTL), driver_statements | atomic driver assignment |
| خدمات إضافية | grooming_services, grooming_bookings, boarding_units, boarding_bookings, care_subscriptions, plan_entitlements, entitlements_usage | capacity and entitlement locks |
| التشغيل | notifications, outbox_messages, inbox_consumed_events, audit_logs, support_tickets, feature_flags, cms_pages, site_banners, event_metrics | read/write scopes |

## تفاصيل ضرورية
- `users` separate from clinic membership; doctor professional profile per user, can join multiple clinics with scoped access.
- `clinic_storefronts.clinic_id NOT NULL`; unique external slugs scoped, active toggles. No store owner column modeled as separate persona.
- `products` can belong to storefront + clinic, variants SKUs unique within tenant/domain; `inventory_movements` immutable posted with reservation/state.
- `appointments` unique/exclusion on doctor/resource/time span where conflicts; manager can reschedule only via validated workflow.
- `social content` privacy at read query and media delivery, not only frontend condition.
- `journal_entries` headers with ledger_entity, accounting_date, status, source_type/source_id, reverses_journal_id, hash/version; `journal_lines` balanced at posting validation in one transaction; locking during closure and posting.
- `payment_provider_events`: provider_event_id unique + signature_verified + processed_at; `outbox` unique event identifier; `inbox` processing idempotence.

## Event vocabulary / names (public domain events)
`UserRegistered`, `ClinicVerificationApproved`, `DoctorAffiliationApproved`, `PetCreated`, `CareReminderDue`, `AppointmentBooked`, `AppointmentCompleted`, `ClinicProductPublished`, `InventoryReserved`, `OrderPlaced`, `PaymentCaptured`, `OrderDelivered`, `OrderRefunded`, `InvoiceIssued`, `CommissionAccrued`, `ClinicSettlementApproved`, `PayoutSucceeded`, `DonationConfirmed`, `DonationDisbursed`, `RideAccepted`, `RideCompleted`, `StoryExpired`, `ReelTranscoded`, `ReportSubmitted`.

Each event has `event_id`, `occurred_at`, `aggregate_id/type`, `aggregate_version`, `actor_context`, minimal payload (do not put secrets/medical information on public event bus). Define producer/consumer, retries and idempotency explicitly in docs/events/.

## Example: one completed order flow
```
API placeOrder(idempotencyKey)
  -> within DB transaction verify clinic/product/price/stock
  -> create parent order + clinic suborders + immutable price snapshots
  -> reserve stock + outbox(OrderPlaced)
Worker/payment adapter -> authorized payment provider captures
Webhook verified -> transaction mark captured + outbox(PaymentCaptured)
Ledger processor -> balanced journals; retry deduped
Order fulfillment -> delivery confirmation -> settlements eligible
Settlement maker+checker -> payout -> bank reconciliation
```

## Migration and seed guidelines
- No old migrations copied from `legacy_reference` into production migration directory.
- Use local fake fixtures and deterministic seed, never migrate real users or payments from ZIP.
- SQL migration smoke test: create empty DB, migrate up, seed, rollback strategy for code (usually forward migrations), constrained schema assertions, concurrent transaction tests.
