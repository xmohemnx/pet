# 11 — الأمن والخصوصية وحماية بيانات Petra

## threat model الأولي
Assets: identity, clinic memberships, sensitive veterinary records, donor identity, payment records, chat/social UGC, live trip location, child-related data if any, financial journals, signed files. Threats: broken object authorization / role escalation, marketplace price tampering, tampered donation counters, duplicate webhooks, media malware, account takeover, abuse/spam, PII leakage, internal fraud, cross-tenant cache leakage.

## متطلبات إلزامية
- Use proven auth provider/protocol, MFA for admin and financial approvers, secure cookies/sessions with CSRF protections as applicable, device/session revocation, re-auth for sensitive operations, account recovery anti-enumeration.
- RBAC + ABAC: persona roles and clinic membership scope; API cannot accept client-supplied `role=admin`, ownership or clinic_id without independent authorization; privilege grants via controlled audited admin workflow.
- Tenant isolation + object authorization for every read/write; separate DB policies if relevant (RLS if Supabase retained as infra—not required); never rely on UI condition or client JWT claimed role alone.
- Encrypt data in transit/rest by provider and use controlled storage buckets for medical attachments, driver documents, private chats and invoice evidence; short-lived signed object access; retention and secure erasure policies.
- Upload filters: MIME/content signature check, file size, antivirus/scan where supported, sandbox transcode, thumbnail safety, content moderation workflow; no executable files served as trusted app content.
- Privacy-by-design: social public/private, block lists, consent to sharing medical data, no display of exact rescue/ride home locations publicly, donor anonymity, medical access logs.
- Payout/refund/donation: signed provider webhooks, idempotency and replay defense, maker-checker and AML/KYC/merchant legal gates where required, immutable audit trail.
- CMS content/XSS protection; parameterized SQL, output encoding, CSP where practical, CORS allowlist, per-IP/user rate limiting, anti-CSRF.
- Secrets: environment validation, rotation, secret manager, separate sandbox/prod, CI secret scanning, non-production test data.
- Logging: correlation IDs and structured redaction, no passwords/tokens/patient notes in telemetry, admin and finance access audit events, alerts for anomalous payouts/logins/permission edits.
- Retention and data rights: access/export/delete requests with legal hold, backups, active session invalidation, contracted providers, public privacy policy and terms.

## 5x5 authorization test pack
Cross-tenant attacks: doctor A vs unrelated pet; clinic A vs clinic B inventory/finances; customer editing clinic catalog; driver viewing private medical notes; content moderator querying payments; general admin viewing full medical history without explicit policy; public visitor obtaining private story media; taxi driver querying old live location. All must be 403/404 as appropriate with no data leakage.

## Critical release blockers
P0: privileged self-registration, missing authorization on medical or money endpoints, unsigned webhooks, donations altered by generic user, unbalanced journals, unencrypted sensitive access, shared production secrets, unreviewed provider payment or financial compliance. Launch cannot proceed until verified closed and independently reviewed.
