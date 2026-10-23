# Petra

<!-- impeccable:product-schema 1 -->

## Platform

Web, Arabic (Iraq), RTL. Responsive from 320 to 1440 pixels and beyond. Display time is Asia/Baghdad; stored time is UTC.

## Product and people

Petra connects animal owners with private animal records, veterinary appointments, clinic stores, transport and a social community. Public registration has exactly four fixed account types: customer, doctor, clinic and animal-taxi driver. These are distinct from the five internal workspace personas: `customer`, `doctor`, `clinic_member`, `driver` and `platform_admin`. A clinic account uses authorized clinic-member workspaces; platform administration is granted internally and has no public signup choice. A clinic is the scope for its commerce, inventory and accounting. Professional workspaces require server authorization and independent verification; choosing a professional account type does not grant professional permissions.

## Stack

Existing Next.js App Router and React web application, NestJS API, PostgreSQL and Redis. Keep the current architecture and working workflows. The visual redesign changes presentation and navigation. The separately requested fixed-account extension enforces account identity and lifecycle permissions on the server; it does not change financial rules.

## Confirmed owner decisions

The launch market is Iraq and the name is Petra. The owner requests a complete visual redesign and delegates design decisions. The accepted Arabic execution brief authorizes a working first-task POC for owner visual review; the latest confirmed priority is “صور ومنشورات المجتمع أولاً، مع وصول سريع للقصص والريلز” (photos and community posts first, with quick access to stories and Reels). This supersedes the earlier blue/white direction for the rebuilt public entry and social proof. The implemented light teal/warm visual system is a proposal under that authority, not an exact palette explicitly selected by the owner. No approved visual comp exists. Use the three supplied skill collections and consult 21st.dev where network policy permits. The owner requires free, upgradeable infrastructure; production domain, deployment configuration and paid-provider authorization remain unconfirmed for this batch.

On 2026-10-23 the owner explicitly requested four separate registration choices: customer, doctor, clinic and animal-taxi driver, with a type change available only by request to administration, plus findable login and account deletion. The selected type is persisted and determines the appropriate customer or authorized professional destination; professional approval remains separate. A pending request leaves the current type unchanged. Only an authorized independent administrator can approve a documented change; approval revokes old sessions and professional permissions, and a new professional type needs separate verification. Membership in several authorized clinics within the same type is not a type switch. This is an extension of the incumbent visual system, including bundled fonts and existing conceptual photography; it does not authorize a new palette, comp or visual-world replacement.

On 2026-10-23 the owner also requested shared UI/UX improvements using the installed skills and then asked to continue. This authorizes refinement of the existing Companion photo journal identity: teal task controls/focus, mint authentication grounds, labelled destination search, native modal mobile navigation, readable forms, reversible password reveal and honest recovery/connectivity feedback. It does not replace the visual world or approve a new palette or comp. Four public account types, five internal personas and independent professional permissions remain unchanged.

## Truth and constraints

Use real API data in account workspaces. Only /demo may show explicitly labelled sample data when demo mode is enabled. Do not invent customer counts, reviews, clinic endorsements, legal approvals or production readiness. Financial workflows remain sandboxed until provider and legal requirements are met. Money uses integer IQD3 units. Medical media, messages and trip information remain private and access controlled. Never expose .env or runtime secrets.

Account deletion is irreversible account closure, not a promise of comprehensive erasure. The findable security section discloses its effect before confirmation: current password, a login within the last 15 minutes, exact typed confirmation and acknowledgment are required. Closure blocks login, revokes sessions and hides the social identity, profile and posts. Necessary medical, financial and audit records remain restricted; correspondence may remain with other participants. Active work and clinic responsibility must be settled or transferred first. These implemented retention limits are not an approved legal retention policy.

## Success

Visitors understand the service and can reach care, shopping, community and transport. Professionals can find their existing tasks with clear hierarchy, readable Arabic, keyboard access and useful empty/error/loading states. Maintain contrast, reduced motion support and all working forms and routes.

The current visual proof covers Home, the photo-led social flow and a clinic quick-task strip retaining existing forms. The finish verdict is limited to the first-task POC ready for owner review; advanced social phases and the wider professional redesign remain incomplete as recorded in `docs/audits/RELEASE_EVIDENCE.md`. It is not full-platform or production certification.

The separate account-lifecycle extension has a scoped independent UI finish verdict of `ship` after the recorded heading correction, with final-source registration, login, fixed-type request, security/deletion and administrative-review captures. Its evidence is in `docs/evidence/account-types/35ea0460/` and `docs/audits/ACCOUNT_TYPES_RELEASE.md`. The final account run reports eight functional scenarios plus capture passing; wider verification records 228 distinct scenarios across correction runs, not one green full-suite run. The UI verdict does not certify API/security, the full platform, production deployment or legal readiness. The migration remains unapplied to Supabase; no public deployment, paid-service activation or merge to main is included.

The shared UI/UX refinement has a separate independent `ship` verdict for its captured shared browsing, authentication, account and workspace states at source `41851243224fbc66907cca32d5510f138e9f975e`. Evidence includes 40 native browser images across 16 routes, six full-page account/authentication images and navigation/deletion states in `docs/evidence/ui-ux/41851243/`. The final selected run reports 30 functional scenarios plus capture passing, with the prior account-only capture intentionally skipped. See `docs/audits/UI_UX_RELEASE.md` for corrected failures, verification and scope. This does not complete the wider professional or advanced social redesign, certify APIs/security or physical devices, or authorize production deployment.

## Open decisions

Registered operating entity, production domain/hosting, live payment and shipping providers, external licensing authority and independent production security review remain unresolved. Brand imagery created for the redesign is conceptual; it is not evidence of actual patients, customers or premises.
