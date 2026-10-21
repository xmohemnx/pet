# 15 — التشغيل السحابي والأداء والمراقبة والتوسع

## البيئات
- local: compose Postgres/Redis/object-storage emulator, local fake mail/media/PSP; deterministic seeds and e2e.
- staging: isolated managed resources, sandbox providers, anonymized fixtures, full security/protocol rehearsal, pre-production volume test.
- production: managed DB with PITR/backups, Redis queues, stateless containerized API, edge CDN/object storage, workers, secret manager, private networks, observability.

## CI/CD
PR gates: lint/types/unit/integration/contract, migration validity, security dependency scan, secret scan, build, component visual diff critical pages and performance quick baseline. Release: canary/blue-green as appropriate, environment checks, safe migrations, rollback plan and flags. Protect `main` and production deploy privileges.

## metrics/SLOs proposed for validation
- Error rate per route and domain, request latency p50/p95/p99, saturation (CPU/memory/DB connections), transaction processing latency, dead-letter queue, outbox lag, cron/reminder success, websocket reconnect, video transcode processing success/duration, cache hit rate, CDN transfer volume.
- Financial invariants: unbalanced journals (zero), orphan payments (zero or incident queue), unreconciled payouts by age, failed postings, unsettled donations, stock mismatch.
- Security: abuse reports, brute-force, permission denied anomaly, expired credentials, missing backups.

## Performance and cost discipline
- Set tested target workflows in staging. Example test profiles: regular browsing high reads, clinic inventory writes, concurrent appointment slot attempts, 1:1 chat bursts, media uploads+playback, payment webhook duplicates, financial report generation; capacity plan from measured profile and peak concurrency, not 1M user account count.
- Budget per service (DB, compute, media encoding, CDN egress, map/geocoding, SMS/notifications, PSP, monitoring); media and map bandwidth can dominate cost. Show monthly cost estimate ranges only when provider/region/capacity assumptions available.
- Cache only safe public/feed data with rigorous invalidation. Keep financial and medical integrity in primary database transaction paths.

## Recovery / runbooks
Backup frequency and retention as approved, PITR testing, restore rehearsals, app secrets rotation, incident severities and on-call routing, vendor outage fallback, degraded-mode banners, no simulated payments in prod, auth provider failure handling, media processing retry/review, provider settlement reconciliation, privacy/security incident response and communication.

## Security launch gates
External vulnerability review or qualified independent review, scoped penetration testing, consent and policy review, financial/legal signoff for payment/donation/insurance/clinical remote services, monitoring dashboards and alerts, rollback and backup restore proof.
