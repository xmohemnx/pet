# Workspace implementation documentation

Documented on 2026-10-23 from UI source `224086c252defbf28052e8d4a1e920aee68ad995`, source tree `8780a3b9b81961dd513967735824c5fa110c83d7`.

## Overview

Comparison outcome: an ordinary extension of Petra's incumbent **Companion photo journal** identity. The four landing workspaces now put care records, assigned visits, clinic reception and current rides ahead of configuration. They retain the existing Arabic typography, teal actions, mint support grounds, flat surfaces and authorized navigation shell. This is a local operational composition change, with no approved comp or new visual-world selection.

`apps/web/DESIGN.md` and `apps/web/.impeccable/design.json` are preserved. This audit records the extension and documentation drift; it does not add global tokens, replace incumbent rules or regenerate the sidecar. The older description of professional screens as form-led no longer describes these four landing surfaces, but remains historical documentation of the earlier scope.

Evidence checked:

- Read the shipped documenter role and `reference/document.md`, `PRODUCT.md`, `apps/web/.impeccable/surfaces/professional-workspaces.md`, incumbent `DESIGN.md` and sidecar.
- Read `apps/web/app/workspaces.css` in full; sampled the inherited token/global/shared experience styles and verified stylesheet order and bundled fonts in `app/layout.tsx`.
- Read customer, doctor and shared overview components; sampled clinic, driver, shared form and identity-shell implementations, plus `/app` and `/clinic/[id]` route loading.
- Checked all 22 final PNG files against `docs/evidence/workspaces/224086c2/artifacts.json`: SHA-256, PNG dimensions and manifest membership match. Directly viewed `customer-1440.png`, `doctor-390.png`, `clinic-administration-1440.png` and `driver-390.png`; this is a representative visual sample, not an independent reopening of all 22 images.
- Read `docs/audits/WORKSPACES_DESIGN_REVIEW.md`, including its initial findings and correction-list continuation. The reviewer resolved the three listed corrections and returned `ship` for those corrections only. The earlier `0d3b531b` captures remain historical evidence.

## Colors

The reused CSS primitives match incumbent values: companion teal (`--brand`, `#0e6873`), deep teal (`--brand-dark`, `#124b53`), night teal (`--brand-deep`, `#123238`), reading ink (`#1a2c30`), muted text (`#5d6f72`), paper (`#f6f9f8`), white surfaces (`#ffffff`), mint (`#e8f2ef`) and divider (`#dce6e3`). No palette replacement landed.

Mint distinguishes care notes, clinic context and driver readiness. The driver's experimental ledger uses night teal with white text. Its subordinate copy is a local (`#d2e5df`); clinic context dividers use a local (`#c9dbd5`). These literals remain surface details, not new global primitives. The test-transaction notice uses the existing warning ink. Its source references `--connection-ground`, a color recorded in DESIGN.md but not defined by the loaded runtime styles; therefore the notice currently has a transparent background over the paper canvas. This is recorded as a local implementation detail, not a new shared token or a tinted-surface claim. Orange retains its incumbent story role; these operational surfaces do not introduce orange decoration.

## Typography

The build continues to load IBM Plex Sans Arabic weights (400/500/600/700) and Manrope (700) locally. Arabic document direction remains RTL. The landing workspaces inherit that family rather than introducing a display face.

Observed workspace-specific steps:

| Role                              | Implemented value and behavior                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Landing heading                   | (28px), weight (600), line height (1.6); (25px) at or below (760px)                              |
| Heading description               | (15px), line height (1.9), maximum (65ch); (14px) on mobile                                      |
| Workspace panel/note heading      | (20px), weight (600), line height (1.7); most panel/note headings become (19px) on mobile        |
| Empty-state heading and copy      | Heading (18px), weight (500), line height (1.7); copy (14px), line height (1.95), maximum (58ch) |
| Destination title and description | Title (15px), weight (600), line height (1.7); description (13px), line height (1.9)             |
| Queue and count support           | Commonly (12–14px); dates, counts and ledger figures use tabular numerals where declared         |

These are local values. They do not replace the incumbent public display, social title, generic panel or form type roles. The driver's ledger title is a separate (16px)/(500) role; its amount is (30px), becoming (28px) on mobile.

## Layout

The shared shell remains the incumbent right rail, desktop header, mobile modal navigation and fixed mobile quick destinations. `workspaces.css` loads after `experience.css`, so the local workspace rules supplement the existing shell and control styles.

The repeated working/support layout uses `minmax(0, 2fr) minmax(280px, 1fr)` with a (24px) gap. At or below (1100px), it becomes `minmax(0, 1.6fr) minmax(260px, 1fr)`; at or below (760px), it becomes one column with a (20px) gap. Clinic reception/context uses the same responsive split. Its department directory has two columns with a (36px) column gap, then one column on mobile. These relationships describe the implemented task surfaces, not a universal grid for Petra.

Workspace headings reserve (28px) below themselves, becoming (20px) on mobile. Panels generally use (24px) padding, becoming (20px); heading and destination arrangements wrap instead of requiring fixed text widths. Source preserves `min-width: 0`, Arabic line height and long-content wrapping.

The corrected mobile driver composition compacts its heading and readiness block, hides the secondary date, introductory paragraph and readiness counts, and keeps the transaction notice, setup access and vehicle identity visible. The current ride precedes offers in actual DOM order. Its first next-transition form spans the row. The supplied (390px) capture shows route, ride state and next transition above the fixed navigation; this is evidence for that captured fixture and viewport, not a guarantee for every possible ride string or device.

## Elevation & Depth

The new stylesheet adds no shadow vocabulary or decorative motion. White panels, mint support grounds, fine divider rules and the dark ledger provide hierarchy within the incumbent flat-surface approach. Existing shared interaction motion and reduced-motion handling remain inherited.

The corrected clinic administration disclosure is unframed: its own border, background, rounding and padding are removed, and its summary uses separator rules. Branch/member/invitation content retains its individual frames. The direct service wrapper is also unframed. This records the resolved nesting correction without turning the formerly nested scaffold into a reusable pattern.

## Shapes

New workspace panels, notes, readiness and ledger surfaces use (14px) corners. Existing generic operational panels retain their separate incumbent geometry; the extension does not globally change the recorded (12px) operational-panel role. Companion initials use (12px) corners; tab counts use (5px). Filter controls have square corners and a (2px) selected underline. The transaction notice has (8px) corners. These observed local values do not establish new shared radius tokens.

## Components

The following implemented behaviors are reusable within this workspace extension:

- **Task heading:** title, concise description, Baghdad-local date and a primary destination or deliberate configuration action. Mobile wraps the action area; the driver has the compact exception described above.
- **Destination row:** linked title and supporting sentence, trailing Lucide arrow and divider, with a minimum height of (85px), becoming (84px) on mobile. Hover changes and underlines the title. Capability-filtered clinic rows use their own larger dimensions.
- **Empty state:** a specific heading, explanatory copy and optional next step. Content aligns to the inline start in RTL; unavailable work remains explicit instead of being represented by invented metrics.
- **Real-data filters:** doctor today/upcoming/all and driver current/history are buttons with `aria-pressed`, computed counts and selected underlines. Customer destination navigation uses links rather than pretending to be a tab widget.
- **Progressive configuration:** native `details` holds doctor publishing, clinic administration and vehicle settings. Explicit entry actions open the relevant disclosure and move to its form; customer creation uses an expanded button state and focuses the first input after opening.
- **Shared save feedback:** `CareForm` disables its fieldset while pending, announces an error with `role="alert"`, and reports successful completion with `role="status"` after the submitted promise resolves. The extension retains native fields and existing action APIs.

Customer `/app` loads actual pets and available slots and routes other account destinations onward. Pet records lead, with an actionable first-record state; available care times and service destinations follow. The active count excludes archived pets, while the record list still labels archived records instead of hiding them.

Doctor visits derive from assigned appointments, sort by start time and use Baghdad dates. Upcoming means confirmed appointments from the current Baghdad day onward. An empty today view offers upcoming visits when present; otherwise it opens publishing. Visit-file and attendance actions remain conditioned by appointment, attendance and home-arrival state. This documentation does not independently certify their authorization implementation.

Clinic calendar loading occurs only for `clinic_admin` or `receptionist` capability. The component distinguishes fetched empty data, a reported fetch failure and a membership without reception access. It shows up to four agenda rows and links onward. Team totals say loading until loaded; departmental destinations are capability-filtered. Failure behavior is source evidence only: the final manifest contains no injected calendar-failure capture.

Driver current rides precede private assignment offers and matching requests in the DOM. Readiness uses actual vehicle state. The ledger and transaction wording remain explicitly experimental, with no real payment/transfer claim. Configuration remains reachable without leading the work queue.

## Do's and Don'ts

Apply the incumbent Story Accent, Arabic Room and Flat Surface rules; this pass establishes no additional global named rule. Reuse the implemented task components with real data, labelled actions, keyboard focus and honest state handling. Workspace focus uses the incumbent teal outline at (3px) with a (4px) offset.

Not canonized or repaired: the incumbent system documentation still describes professional screens as form-led, mentions the earlier clinic quick strip and omits `workspaces.css` from its historical source list; its sidecar retains the earlier scope narrative. Existing cool-blue compatibility notices, chips, disabled controls and generic legacy states remain local drift already acknowledged by `DESIGN.md`, rather than new shared palette authority. None is repaired through an unauthorized global rewrite. The former driver visual-order workaround and clinic enclosing-card defect were corrected before this documentation pass and are not retained as house rules.

Limits: no browser or mechanical detector was rerun by this documenter, and no implementation file was edited. Parent-reported unit, lint/type, build and E2E results are verification context, not independently executed tests here. The final captures use isolated synthetic fixtures and native Chromium; representative images and manifest integrity do not establish physical-device, API/security, full-platform, failure-state or production certification. This audit adds no release verdict beyond the independent review's expressly bounded correction-list result.
