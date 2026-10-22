---
name: Petra
description: Arabic companion editorial for public discovery and calm professional workspaces.
colors:
  brand: '#2358ce'
  brand-dark: '#1b3665'
  brand-deep: '#142442'
  ink: '#202733'
  muted: '#566171'
  paper: '#f7f9fc'
  surface: '#ffffff'
  mint: '#edf3fa'
  line: '#e3e8ef'
  success: '#246147'
  warning: '#88520d'
  petra-blue-wash: '#edf3fc'
  petra-blue-field: '#dcebf8'
  petra-control: '#b7c2d1'
  petra-neutral: '#f0f3f7'
  public-button-hover: '#1946b2'
  operating-button-hover: '#394558'
  navigation-current: '#e5eaf1'
  legacy-focus: '#b45b1f'
typography:
  display:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: 'clamp(52px, 7.5vw, 100px)'
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: '-0.025em'
  headline:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: 'clamp(34px, 4vw, 56px)'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: '-0.015em'
  section-title:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '19px'
    fontWeight: 500
    lineHeight: 1.7
  body:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.8
  operating-body:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.9
  label:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '13px'
    lineHeight: 1.7
  button:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '14px'
    fontWeight: 500
    lineHeight: 1.7
  brand:
    fontFamily: 'Manrope, sans-serif'
    fontSize: '35px'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '-1.4px'
rounded:
  chip: '6px'
  field: '7px'
  control: '8px'
  operating-panel: '12px'
  photo: '16px'
spacing:
  tight: '8px'
  control-gap: '12px'
  small: '16px'
  panel-mobile: '18px'
  medium: '20px'
  panel-base: '22px'
  grid: '24px'
  heading: '28px'
  gutter: '32px'
  public-gutter: '48px'
components:
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '10px 20px'
  button-primary-hover:
    backgroundColor: '{colors.public-button-hover}'
  button-operating:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '10px 20px'
  button-operating-hover:
    backgroundColor: '{colors.operating-button-hover}'
  button-outline:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '10px 20px'
  field-identity:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: '11px 13px'
  panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.operating-panel}'
    padding: '{spacing.panel-base}'
  care-panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.operating-panel}'
    padding: '{spacing.grid}'
  navigation-item:
    textColor: '{colors.muted}'
    typography: '{typography.label}'
    rounded: '{rounded.field}'
    padding: '8px 12px'
  navigation-item-current:
    backgroundColor: '{colors.navigation-current}'
    textColor: '{colors.ink}'
  chip:
    backgroundColor: '{colors.petra-neutral}'
    rounded: '{rounded.chip}'
    padding: '3px 8px'
  faq-disclosure:
    backgroundColor: '{colors.paper}'
    rounded: '{rounded.control}'
    padding: '20px 24px'
---

# Design System: Petra

## Overview

**Creative North Star: "Companion editorial journal"**

Petra is calm, open and personal: clear Arabic typography, blue accents, white and pale blue fields, and photographs that give animals room in the composition. The owner approved this identity and delegated its application. This is a scan of the implemented web system, not a claim of fidelity to an approved image comp.

Public discovery uses generous space and large sentences; operating screens use compact headings, neutral navigation, tabular figures and flat panels. They share an identity without sharing density. Conceptual brand photographs are authored imagery, not evidence of actual patients, premises or endorsements.

**Key Characteristics:**

- Arabic first, RTL, with locally bundled fonts.
- One blue brand accent, supported by cool neutrals and semantic status colors.
- Photographic public storytelling and compact, task-led workspaces.
- Readable content before motion, with native touch scrolling and reduced motion support.

This file is scoped to `apps/web`. Token sources are `../../packages/ui/src/tokens.css`, `app/globals.css` and the later-loaded `app/redesign.css`; typography imports and RTL are in `app/layout.tsx`. The frontmatter records selected reusable values actually present in those sources. Rounded and spacing names describe extracted dimensions, not additional CSS variables. The sidecar records motion, breakpoints and representative component snippets. Its tonal ramps are synthesized OKLCH preview metadata, not implemented palette tokens or exact conversions of the canonical colors. This documentation pass inspected source; it did not run browser or test verification. Source provenance is recorded in `../../docs/DESIGN_SOURCES.md`, including the distinction between the blocked live 21st.dev gallery and accessible public GitHub sources.

## Colors

The palette combines a clear care blue with cool paper, restrained dark text and softly colored photographic fields.

### Primary

- **Care blue** (`brand`) marks public actions, the brand symbol, caret and selected interactive emphasis. The CSS `accent` aliases the same literal value; it is not a second accent.
- **Deep blue** (`brand-dark`) and **night blue** (`brand-deep`) support darker brand areas; the footer uses night blue.
- Public primary hover and operating primary hover are distinct recorded variants. Operating primary actions use ink through the CSS `petra-dark` alias, whose literal matches `ink`.

### Neutral

- **Reading ink** (`ink`) is the default text and operating action color. **Quiet slate** (`muted`) supports navigation, metadata and secondary copy.
- **Cool paper** (`paper`) is the application canvas; **white** (`surface`) is the public background, top bar, panel and field surface.
- **Blue wash** (`petra-blue-wash`), **photographic blue** (`petra-blue-field`) and **cool neutral** (`petra-neutral`) distinguish quiet sections, image placeholders and compact supporting surfaces. The older token named `mint` is pale blue in the current implementation; its name is historical.
- **Divider** (`line`) defines panel and table boundaries. **Control edge** (`petra-control`) gives form controls stronger outlines. Neutral selected navigation uses `navigation-current`.

Success and warning are semantic colors, not competing identity accents. Existing alert components retain additional warm error/success palettes from `globals.css`; do not assume every domain status has been normalized to the root semantic tokens.

**The Contextual Accent Rule.** Use blue for public emphasis and neutral ink for operating primary actions; do not turn the working rail into a saturated marketing surface.

## Typography

**Display Font:** IBM Plex Sans Arabic, with sans-serif fallback.  
**Body Font:** IBM Plex Sans Arabic, with sans-serif fallback.  
**Brand Font:** Manrope, with sans-serif fallback, for the Latin Petra wordmark and large footer lettering.

Arabic weights (400, 500, 600, 700) and Manrope (700) are bundled through `@fontsource`. The design leaves Arabic generous line height. Public headings balance their text and paragraphs use pretty wrapping where supported. Tables, numeric classes, finance summaries and stat values use tabular figures; a separate monospaced font is not established.

### Hierarchy

- **Display:** the frontmatter role is the desktop public introduction. It changes to `clamp(48px, 7.3vw, 80px)` below (1000px), `clamp(40px, 9.5vw, 70px)` below (760px), then (41px) below (420px). Mobile line height is (1.5), and desktop nowrap is released.
- **Headline:** public section headings use the fluid role; below (760px) they become (36px), then (32px) below (420px).
- **Title:** operating page headings use the compact role, falling to (24px) below (760px). The demo heading is a separate (500) weight, not the real workspace title weight.
- **Section title:** operating panel headings use the smaller role; care-section headings become (18px) below (760px).
- **Body:** global body uses the frontmatter role. Operating descriptions use the denser operating role; public introductory and section copy commonly uses (18px), with selected section descriptions reducing to (16px) on mobile. The final public override gives paragraphs ink color and a (65ch) maximum.
- **Label:** rail links and compact labels use the smaller role. Table headers and metadata can be (12px); do not enlarge every task label to public body size.

**The Arabic Breathing Rule.** Preserve the established line heights and wrapping when changing copy; do not compress Arabic to imitate Latin display density.

## Layout

The document is `ar-IQ` and RTL. Use logical inline/block properties and retain `bdi` or explicit LTR treatment for identifiers and appropriate fields.

Public containers are `min(1344px, calc(100% - 96px))`, changing to `calc(100% - 48px)` below (1000px) and `calc(100% - 36px)` below (420px). Desktop editorial pairs use a (1.5fr / 1fr) split and (28px) gap. Public sections have deliberately varied, generous vertical padding rather than one repeated card stack. Below (760px), editorial pairs, steps, community and FAQ become single columns. The ordinary public navigation is hidden at that breakpoint; the workspace menu is a separate interaction.

The desktop operating shell uses a (232px) right rail and `minmax(0, 1fr)` canvas, with a (76px) top row. Main content has (32px) padding, a (1520px) maximum, and recurring (24px) internal gaps. At (1200px) padding becomes (28px) and major care/account columns collapse. At (1000px) the rail becomes a toggleable in-flow panel and content padding is (28px 24px); care columns can return to (1.65fr / 1fr) because the rail has gone. At (760px) they collapse again. Below (420px), content uses (24px 16px) padding and mobile rail navigation becomes one column. Above (1800px) the constrained canvas is centered.

Standard panels inherit (22px) padding; care panels use (24px), then (20px) below (760px), and (18px) below (420px). The care overview has a specific two-column layout with (24px) gap, unpadded inner sections and single-column cards; below (760px) it becomes one column with a (32px) gap. Its action row becomes a two-column grid with (44px) minimum button heights. Preserve domain grids and horizontal table scrollers rather than forcing all screens into the marketing layout. Authentication uses a photographic half and form half, with a (410px) form maximum; below (760px), the photograph and story copy are removed and the form becomes the focus.

The responsive requirement is (320–1440px) and beyond. These are source breakpoints, not a claim that this documentation pass independently verified each viewport. Printing removes workspace chrome and expands the main content.

## Elevation & Depth

The redesigned public and operating surfaces are primarily flat: white panels, pale fields, thin dividers and photographs establish depth. Operating panels and stat containers explicitly remove shadows. Some legacy domain and demo selectors still define shadows in `globals.css`; the code does not establish a reusable shadow token, so do not promote an isolated shadow into the identity.

**The Flat Working Surface Rule.** Give operating panels hierarchy with spacing, borders and headings; do not add ornamental elevation to routine tasks.

## Shapes

Controls are gently curved, fields slightly tighter, and panels and photographs softer, using the distinct frontmatter radii. The shared root CSS `radius` retains the photo-scale value; it is not the universal radius after redesign. Public image windows clip their contents; the small inline image uses an ellipse-like (`0.5em`) corner. The brand symbol has an asymmetric corner shape (`13px 13px 13px 4px`), with smaller variants in the rail. Keep ordinary task containers rectangular rather than copying the symbol's silhouette.

## Components

### Buttons

Clear and measured. Shared buttons are inline flex with (18px) gaps and a minimum height of (46px); small buttons use (40px), (8px 14px) padding and (13px) text. Identity-form buttons have a separate (47px) minimum and fill available width unless a more specific action-row rule restores auto width. Public primary, operating primary and outline variants are recorded in the frontmatter. Outline uses the control-edge border; hover shifts to blue text/border on (`#f5f8ff`). Buttons lift (`translateY(-2px)`) on hover and press (`translateY(1px)`) on active, except disabled state.

State transitions use the shared micro duration. Disabled operating buttons receive (`#e9edf2`) background, (`#d1d8e2`) border and (`#586273`) text. The more specific legacy form disabled rule can retain opacity (0.6) and a wait cursor; the redesign's opacity (1) declaration does not universally win.

### Inputs / Fields

White, outlined and readable. Operating identity fields use the frontmatter padding; care fields use (11px 12px). Textareas resize vertically, with separate existing minimum heights. Field labels stay close to the control and retain actual native select, checkbox and radio semantics. Public service selection has a (48px) height and (178px) desktop minimum width, released on mobile. It updates explanatory copy through a polite live region and changes a real destination link.

### Cards / Containers

White operating panels have a thin divider border and no shadow. Care panels follow the responsive padding described in Layout. Empty states are content states within this system; do not fill them with fabricated metrics or testimonials. Security and finance notices may use the blue wash; sandbox notices keep a warm warning treatment. Current alert blocks retain their explicit existing status colors.

### Chips

Compact informational tags. Operating small chips use cool-neutral fill, (`#4c596b`) text, (12px) type and the chip shape/padding. The redesign sets a border color but the base chip does not establish a border style, so do not infer a visible outline. Permission tags are a separate white/blue-edged pattern.

### Navigation

Public navigation is a plain horizontal text bar. Operating navigation uses muted text, (40px) desktop minimum height, (7px) corners and neutral hover (`#e9edf3`); the current page uses the recorded selected background and ink with (500) weight. `aria-current="page"` carries the state. At the mobile shell breakpoint, links grow to (44px) minimum height. The actual menu uses `aria-expanded` / `aria-controls`; Escape closes it and restores toggle focus. It is an in-flow disclosure, not a modal drawer.

Professional overview headings have no redundant persona kicker. Keep clinically or operationally meaningful verification/session context in supporting copy below the heading, as on the clinic and admin overview. Do not turn verification language into decorative proof badges.

### Disclosures and public motion

FAQ uses native `details` / `summary`, with paper fill and a plus icon rotating (45deg) when open. The desktop disclosure padding is in the frontmatter; mobile uses (18px). Preserve native keyboard semantics.

Public motion is deferred, scoped and supplementary. `PublicExperience` omits the GSAP/Lenis module for reduced motion and Save-Data. With no preference, the opening translates the heading (18px), supporting content (12px), and settles the cover from scale (1.035); section entries translate (18px) once. Nothing starts hidden. Lenis runs only on fine pointers, sharing the GSAP ticker; touch retains native scrolling (`syncTouch: false`). Forms, details, dialogs and native scroll regions are excluded. In-page links keep URL hash and focus behavior, and enhancement cleans up on removal. Workspaces use native scrolling.

### Focus and reduced motion

Source-cascade detail: the redesign declares a blue (3px) outline with (4px) offset using a low-specificity `:where(...)` selector. The older element-specific `button`, `a`, `input` and `select` focus-visible rules still win, yielding the frontmatter legacy-focus color, (3px) width and (5px) offset. Textareas and summaries use the newer blue treatment; `[tabindex]` targets can retain the older rule. This is existing drift, documented rather than silently normalized. The representative sidecar snippets reproduce the applicable source states.

Reduced motion disables transitions and animations globally and restores automatic scrolling. Do not introduce opacity-hidden entrance states or smooth touch scrolling.

## Do's and Don'ts

### Do:

- **Do** share the blue/white identity while keeping public discovery generous and operating work compact.
- **Do** keep Arabic RTL, logical spacing, local fonts, visible focus and semantic controls.
- **Do** use real content and honest loading, empty, error and unavailable states in account workspaces.
- **Do** keep photographs conceptual when their provenance is conceptual; preserve their provenance records.
- **Do** preserve native touch and workspace scrolling and respect reduced motion and Save-Data.

### Don't:

- **Don't** invent metrics, testimonials, endorsements or verification claims to fill visual space.
- **Don't** replace task panels with ornamental gradients, floating badges or decorative charts.
- **Don't** repeat a persona kicker above professional overview headings.
- **Don't** infer universal styling from a legacy selector or claim the current focus cascade has been normalized.
- **Don't** add external font, image or animation runtime requests to reproduce the identity.
