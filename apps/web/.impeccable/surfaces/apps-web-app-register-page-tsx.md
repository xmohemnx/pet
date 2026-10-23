---
version: 1
slug: 'apps-web-app-register-page-tsx'
primary_target: 'apps/web/app/register/page.tsx'
related_targets:
  [
    'apps/web/components/auth-forms.tsx',
    'apps/web/components/account-type-controls.tsx',
    'apps/web/components/account-delete.tsx',
    'apps/web/components/admin-account-types.tsx',
    'apps/web/app/account/page.tsx',
    'apps/web/app/security/page.tsx',
  ]
---

# Account identity and lifecycle

Mode: Operate. This is a precisely requested extension of the existing Petra system, not a replacement identity or a new concept round. Inherit current DESIGN.md, bundled Arabic fonts, light teal surfaces and conceptual brand photography. The owner explicitly requests four registration choices: customer, doctor, clinic, animal-taxi driver; the selected account type can change only through an administration request. Login remains available and account deletion must be findable.

THESIS: A clear choice at registration, a fixed identity afterward, and a visible route to administration and safe closure.
OWN-WORLD: Existing teal, white and Arabic typographic system. Native radios, labels, details and forms; no new decorative world or asset. Exact existing palette is inherited, not a new owner approval.
STORY: Choose one of four account types, verify email, log in to the appropriate workspace or professional approval screen. Request a type change from account settings; only the independent authorized administrator decides. Review retention terms before confirming deletion with current password and explicit text.
FIRST VIEWPORT: Desktop retains the incumbent photographic brand column and form column. Registration shows the four choices before personal details. Mobile preserves one-column readable forms and the same four choices. Account settings names the current type as fixed; the deletion section names its effect and limits before revealing confirmation fields.
FORM: Native task forms extending the implemented Petra photo-journal system; no new world roll or comp. The incumbent seed:9dba20ecac09d120 is provenance of the inherited system only.
FINISH: Verify browser captures at 390/1440, RTL/no horizontal overflow at 320/390/768/1440, keyboard/axe and real persisted actions. Describe the verdict only at this account-lifecycle scope. No claim of production deployment or independent security certification.

Signature: the account type stays unchanged while an administration request is pending; an approved transition invalidates existing sessions and former professional permissions. Four public choices never include platform administration. Professional verification remains separate from registration. Closing the account revokes access and hides its public social presence while disclosing restricted medical/financial/audit retention and correspondence held by other participants.

## Final scope and finish record — 2026-10-23

Implemented source: `35ea04603e6a6a1c0d00565a03b30430cd102257`, branch `codex/account-types-20261023`. The four required native radio choices precede name/email/password; login remains linked. The choice grid uses two columns at 390px and one at or below 350px. Existing pale-blue authentication story/photo composition and teal actions are retained; mobile uses the compact brand header. No new assets, fonts, palette or system tokens were introduced.

The persisted account type governs the customer/professional destination. Account settings names the fixed type and exposes a native details form for a reasoned administration request; a pending request prevents another submission and leaves the type unchanged. Current-type pending/approved professional applications suppress duplicate application forms. Public clinic type and internal `clinic_member` workspace remain distinct; platform administration is never a signup type. The administrative decision form defaults to rejection, requires a reason and explains session/permission revocation and independent professional verification.

Account settings links directly to `/security#delete-account`. Disclosure precedes the opened confirmation form: current password, login within 15 minutes, exact «حذف حسابي» confirmation and acknowledgment; the final destructive action is red. Closure revokes access/sessions and hides social identity/posts, while necessary medical/financial/audit records remain restricted and correspondence may remain with other participants. Active work and clinic responsibility require settlement or transfer first. This is account closure, not complete erasure or legal-policy approval.

Independent finish review: second scoped verdict `ship`, recorded in `docs/audits/ACCOUNT_TYPES_DESIGN_REVIEW.md`. The consolidated first-pass heading finding was resolved: decorative preheadings were removed from security and the professional application heading, and factual verified-email status follows the account greeting. All 17 final-source browser images were checked by the reviewer; the documenter sampled register desktop/mobile, account desktop and the opened mobile deletion form. Evidence: `docs/evidence/account-types/35ea0460/`, including manifest, full pages and native 1440×1000 / 390×844 viewport captures. The mobile security viewport is intentionally scrolled to the opened deletion form; its full-page companion starts at document top.

Verification supplied by the implementation: eight account scenarios plus capture passed (9 total); 48 unit tests, checks and build passed. The wider 228 distinct E2E scenarios were verified across correction runs, not one green full-suite execution; see `docs/audits/ACCOUNT_TYPES_RELEASE.md`. This documenter pass did not rerun tests, browser capture, detectors or context discovery. Finish is limited to this extension's reviewed UI/user flow; no full-platform, independent API/security, production or comp-fidelity approval is asserted.

System persistence: `apps/web/DESIGN.md` and `apps/web/.impeccable/design.json` were compared with the final components/styles and preserved byte-for-byte. Their inherited cool-blue auth/operational compatibility and legacy focus cascade are not promoted into new global rules. No new visual world or token persistence was authorized. No Supabase migration application, deployment, paid service or merge to main is part of this record.
