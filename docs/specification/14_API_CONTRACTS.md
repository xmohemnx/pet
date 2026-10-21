# 14 — واجهات API ومواصفات الأحداث والعقود

## Conventions
- URL `/api/v1/...`, structured JSON error `{code, message, details?, requestId}`, standardized UTC timestamps, pagination cursor/page size caps, validation and permission checks server-side.
- Auth session/token standard secure flow; idempotency key mandatory for orders/payments/refunds/posting/settlements/driver accept; `If-Match`/row version for conflict-prone updates.
- Never expose medical/financial/private media raw URLs without authorization/expiry. All routes list `action`, `subject`, `scope` and rate limits.
- OpenAPI generated from code plus contract tests and client SDK, no undocumented breaking changes.

## Representative endpoints (names provisional)

### Identity / Organizations
- `POST /auth/register` ordinary customer only (no role=admin/clinic direct privilege)
- `POST /auth/login`, `/auth/logout`, `/auth/recover`, `/auth/mfa/challenge`, `/auth/mfa/verify`
- `GET /me`, `GET /me/workspaces`, `POST /me/active-workspace` (server verifies membership)
- `POST /clinic-applications`, `GET /clinics/:id/members`, `POST /clinics/:id/members/invitations`
- `POST /doctor-applications`, `POST /driver-applications`, `POST /admin/verifications/:id/decision`

### Care / Scheduling
- `GET/POST /pets`, `GET/PATCH /pets/:id`, `GET /pets/:id/medical-record`, `POST /pets/:id/consents`
- `GET/POST /pets/:id/care-tasks`, `GET/POST /pets/:id/vaccinations` (doctor-authorized write)
- `POST /appointments/holds`, `POST /appointments`, `POST /appointments/:id/reschedule`, `POST /appointments/:id/cancel`, `POST /appointments/:id/check-in` and `/complete`
- `POST /encounters/:id/prescriptions`, `POST /encounters/:id/labs`, `POST /encounters/:id/sign`, `POST /encounters/:id/addenda`
- `GET /care-plans`, `POST /care-plan-subscriptions`, `POST /care-plan-redemptions`.

### Clinic Commerce
- `GET /marketplace/products`, `GET /marketplace/products/:slug`, `GET /marketplace/clinics/:slug`
- `POST/PATCH /clinics/:id/products`, `GET /clinics/:id/inventory`, `POST /clinics/:id/stock-adjustments` (approval)
- `POST /clinics/:id/purchase-orders`, `POST /clinics/:id/goods-receipts`
- `POST /checkout/quote`, `POST /orders` + `Idempotency-Key`, `GET /orders/:id`, `POST /orders/:id/returns`, `/refund-requests`.

### Accounting
- `GET /clinics/:id/finance/overview`, `/invoices`, `/journal`, `/settlements`
- `POST /finance/journals/drafts`, `POST /finance/journals/:id/approve`, `/post`, `/reverse` (separation of duties)
- `POST /finance/invoices`, `POST /finance/receipts`, `POST /finance/payments/refunds`, `POST /finance/settlements/:id/approve`
- `GET /finance/reports/trial-balance`, `/profit-loss`, `/balance-sheet`, `/cash-flow`, `/ar-aging`, `/stock-valuation`
- `POST /integrations/payments/:provider/webhook` with raw payload and verified signature (no user login substitute).

### Social / Messaging
- `GET/POST /social/posts`, `POST /social/posts/:id/reactions`, `GET /social/feed`, `POST /social/follows`, `POST /social/blocks`
- `POST /media/upload-intents`, `POST /media/uploads/:id/complete`, `GET /media/:id/status`
- `GET/POST /social/stories`, `GET /social/reels`, `POST /social/reels`, `GET /messages/conversations`, `POST /messages/conversations/:id/messages`
- `POST /social/reports`, `POST /admin/moderation/:caseId/decision`.

### Rescue/Taxi/Donation
- `POST /adoption-listings`, `POST /adoption-listings/:id/applications`, `GET /adoption/applications/:id`
- `POST /rescue-cases`, `POST /rescue-cases/:id/assign`, `POST /rescue-cases/:id/status`
- `POST /donations/intents`, `GET /donation-campaigns`, `POST /donation-campaigns/:id/disbursements` restricted and regulated.
- `POST /taxi/quotes`, `POST /taxi/rides`, `POST /taxi/rides/:id/accept`, `POST /taxi/rides/:id/status`, `GET /taxi/rides/:id/live` authorized and TTL.

## SDK contracts
Typed DTOs and validation contracts in `packages/contracts`, exceptions translated into user-safe errors; require API integration tests to validate cross-tenant ID tampering, concurrent holds, payment retries. Never rely only on snapshot tests.

## Websocket topics
`messages.room.<conversationId>`, `rides.<rideId>`, `notifications.<userId>`, `appointments.<clinicId>` with gateway authorization on join/reconnect, events with sequence/cursor for replay, bounded messages and rate limits. Don't transmit medical record content on public topics.
