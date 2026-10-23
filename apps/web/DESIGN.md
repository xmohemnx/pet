---
name: Petra
description: Arabic companion photo journal with a light teal field and restrained warm story accents; implemented owner-review POC.
colors:
  brand: '#0e6873'
  brand-hover: '#08515b'
  brand-dark: '#124b53'
  brand-deep: '#123238'
  accent: '#fe7e3c'
  ink: '#1a2c30'
  muted: '#5d6f72'
  paper: '#f6f9f8'
  surface: '#ffffff'
  mint: '#e8f2ef'
  line: '#dce6e3'
  success: '#246147'
  warning: '#88520d'
  public-wash: '#edf5f1'
  public-field: '#e6f0e9'
  public-control: '#a9c1b9'
  public-neutral: '#edf3ef'
  finder-ground: '#edf4ef'
  field-edge: '#b6cac3'
  disabled-ground: '#dfe8e5'
  disabled-ink: '#4f6564'
  error-ground: '#fff0ee'
  error-ink: '#8c3028'
  offline-ground: '#fff2d7'
  offline-ink: '#6b4b11'
  operating-ink: '#202733'
  operating-hover: '#394558'
  operating-control: '#b7c2d1'
  operating-selected: '#e5eaf1'
  operating-neutral: '#f0f3f7'
typography:
  display:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: 'clamp(52px, 6.1vw, 84px)'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '-0.025em'
  headline:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: 'clamp(34px, 4vw, 56px)'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '-0.02em'
  feed-title:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '27px'
    fontWeight: 600
    lineHeight: 1.5
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
  post-body:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.95
  operating-body:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.9
  label:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '13px'
  button-link:
    fontFamily: 'IBM Plex Sans Arabic, sans-serif'
    fontSize: '14px'
    fontWeight: 500
  brand:
    fontFamily: 'Manrope, sans-serif'
    fontSize: '35px'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '-1.4px'
rounded:
  tab: '6px'
  field: '7px'
  control: '8px'
  search: '9px'
  panel: '12px'
  social-panel: '14px'
  photo: '16px'
  hero-photo: '18px'
  circle: '50%'
spacing:
  tight: '8px'
  action-gap: '10px'
  control-gap: '12px'
  small: '16px'
  post-inline: '18px'
  medium: '20px'
  panel-base: '22px'
  grid: '24px'
  heading: '28px'
  gutter: '32px'
components:
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.surface}'
    typography: '{typography.button-link}'
    rounded: '{rounded.control}'
    padding: '10px 20px'
  button-primary-hover:
    backgroundColor: '{colors.brand-hover}'
  button-secondary:
    backgroundColor: '{colors.mint}'
    textColor: '{colors.brand}'
    typography: '{typography.button-link}'
    rounded: '{rounded.control}'
    padding: '10px 20px'
  button-disabled:
    backgroundColor: '{colors.disabled-ground}'
    textColor: '{colors.disabled-ink}'
  studio-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: '12px'
  navigation-item:
    textColor: '{colors.ink}'
    rounded: '{rounded.search}'
    padding: '10px 12px'
  navigation-item-current:
    backgroundColor: '{colors.mint}'
    textColor: '{colors.brand}'
  kind-tab:
    textColor: '{colors.muted}'
    rounded: '{rounded.tab}'
    padding: '8px'
  kind-tab-current:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.brand}'
  social-post:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.social-panel}'
  operating-button:
    backgroundColor: '{colors.operating-ink}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '10px 20px'
  operating-button-hover:
    backgroundColor: '{colors.operating-hover}'
  operating-panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    padding: '{spacing.grid}'
  faq-disclosure:
    backgroundColor: '{colors.paper}'
    rounded: '{rounded.control}'
    padding: '20px 24px'
---

# Design System: Petra

## Overview

**Creative North Star: "Companion photo journal"**

Petra brings everyday animal companionship into a light Arabic reading space. Photographs and their authors carry the visual weight; teal identifies actions and warm orange marks story rings. Broad public sentences and compact social controls share locally bundled type, clear borders and quiet surfaces.

This is the implemented replacement proposed for owner visual review under the accepted Arabic execution brief. The owner authorized a full redesign and confirmed “صور ومنشورات المجتمع أولاً، مع وصول سريع للقصص والريلز”; the exact teal/warm palette is an implementation proposal, not an explicit owner color selection. The build is code-led, with no approved image comp or external quality board. It supersedes the earlier blue/white direction for the rebuilt public entry and social proof.

**Key Characteristics:**

- Arabic first, RTL, with locally bundled fonts.
- Photograph-and-author priority on light teal-neutral surfaces.
- Restrained warm story emphasis and visible interaction states.
- Separate public, social and operational densities.
- Responsive native forms, explicit privacy boundaries and reduced motion support.

Scope: `apps/web`, extracted from implementation source `f4429f36e48458cbef9884ec028b987f7f568f7d`. Sources load in this order: `../../packages/ui/src/tokens.css`, `app/globals.css`, `app/redesign.css`, `app/social.css`, `app/rebuild.css`; font imports and RTL live in `app/layout.tsx`. The frontmatter is normative for selected implemented values. Rounded/spacing names describe observed dimensions rather than new CSS variables. Shared brand and social-prefixed CSS tokens have matching values; public overrides have their own scope. Sidecar metadata extends these primitives without inventing palette ramps.

The finish review in `../../docs/audits/DESIGN_FINISH_REVIEW.md` returns `ship` for the first-task POC ready for owner review. It does not certify a complete platform, full clinic redesign, advanced social phases or production readiness. Browser evidence and provenance are in `../../docs/evidence/social-rebuild/f4429f36/`; unfinished capabilities remain disclosed in `../../docs/audits/RELEASE_EVIDENCE.md`. Conceptual brand photographs and encoded test media are illustration, never evidence of actual patients, users, premises or endorsements; see `../../docs/ASSET_CREDITS.md` and the evidence manifest.

## Colors

The proposed palette pairs deep readable teal with white, lightly green-tinted fields and small warm story accents.

### Primary

- **Companion teal** (`brand`) identifies links, primary social actions, current navigation and selected tabs; its deeper hover is `brand-hover`.
- **Deep teal** (`brand-dark`) and **night teal** (`brand-deep`) retain shared brand support and the public footer.

### Secondary

- **Story orange** (`accent`) outlines story avatars. It is an emphasis color, not a replacement for the primary text/action role.

### Neutral

- **Reading ink** (`ink`) supports headings and body copy; **quiet slate** (`muted`) supports secondary text and metadata.
- **Light ground** (`paper`), **white surface** (`surface`) and **soft teal tint** (`mint`) distinguish the app canvas, cards and selected/secondary controls. **Divider** (`line`) gives cards, rails and feed tabs a fine edge.
- **Public wash**, **public field**, **public neutral** and **finder ground** belong to the rebuilt public surface. Historical CSS names containing “blue” survive as scoped variable names; their public values are now green-tinted. Do not infer hue from an identifier.
- **Public control** and **field edge** strengthen input boundaries. **Disabled ground/ink**, **error ground/ink** and **offline ground/ink** communicate actual states. Success and warning retain their semantic roles.
- The `operating-*` primitives document existing workspace compatibility values. They do not imply those workspaces received the social redesign. Other cool-blue hover, selection, notice and authentication values remain in `redesign.css` and are not promoted into the new world.

**The Story Accent Rule.** Keep warm orange attached to story emphasis; use teal for the social action and selection hierarchy.

## Typography

**Display Font:** IBM Plex Sans Arabic, with sans-serif fallback.  
**Body Font:** IBM Plex Sans Arabic, with sans-serif fallback.  
**Brand Font:** Manrope, with sans-serif fallback, for the Latin wordmark and footer lettering.

Arabic weights (400, 500, 600, 700) and Manrope (700) are bundled with `@fontsource`. Arabic display lines have generous vertical room; compact reading and forms keep their own density. Tables and numeric summaries retain tabular figures. No separate monospaced face is established.

### Hierarchy

- **Display:** the frontmatter role is the rebuilt Home greeting. At or below (1100px) it becomes (60px); at or below (760px), (52px) with line height (1.45); at or below (350px), (45px). Its explicit line break remains part of this surface's composition.
- **Headline:** public section headings use the fluid role, changing to (36px) at the mobile breakpoint and (32px) at or below (420px).
- **Feed title:** a compact social introduction, changing to (26px) on mobile. Studio/profile/viewer titles have their own observed local sizes; they are not a fabricated global type ramp.
- **Title / section title:** existing operational headings use these roles; workspace title becomes (24px) on mobile. The clinic task-strip title is (22px), weight (500).
- **Body:** final global body size is the frontmatter value. Home introductory copy is (17px) with line height (2.05) and maximum (39ch), becoming (15px) and (40ch) on mobile. Social post captions use `post-body` and maximum (65ch), preserving line breaks and wrapping long content.
- **Operating body / label:** real workspaces and form labels retain their compact roles. Social account names use (14px), weight (600); metadata and story labels commonly use (11px). These small metadata sizes are observed, not a recommendation for long-form reading.
- **Button link:** primary social links use the explicit frontmatter role. Native social buttons also inherit the container font via a button reset; do not assume every button computes to the link's size.

**The Arabic Room Rule.** Preserve the observed line heights and wrapping behavior when adapting Arabic headings; do not clip them to a Latin display baseline.

## Layout

Layout follows the content's task. Public discovery is spacious, the community concentrates on a readable photo feed, and preserved professional workspaces remain dense and form-led. These are related surface grammars rather than one grid imposed everywhere.

Home uses a maximum container of (1344px) with desktop width `calc(100% - 96px)`. Its rebuilt introduction uses `minmax(0, 0.9fr) minmax(0, 1.1fr)` and gap (32px 60px): greeting on the right and photograph on the left in RTL. The finder occupies a complete row below. The cover is `min(42vw, 590px)` high, minimum (430px). At or below (760px), copy and actions precede the (320px) photograph; the finder follows. The inherited public container narrows to `calc(100% - 48px)` at or below (1000px), then `calc(100% - 36px)` at or below (420px).

Social has a fixed right rail (226px), an (82px) top bar and a centered main container of maximum (1140px), padded `34px clamp(24px, 4vw, 64px) 48px`. The feed grid is `minmax(0, 620px) minmax(220px, 280px)` with gap `clamp(28px, 4vw, 58px)`; discovery sits to the left. At or below (1250px), the rail becomes (194px) and the discovery column (230px). At or below (1080px), the rail becomes (176px), discovery hides and the feed stays at maximum (620px). At or below (760px), the rail hides, top bar becomes (66px), main padding becomes (24px 18px 28px), and bottom navigation reserves (72px) of stage padding plus its safe-area inset. Posts extend to the viewport edges with side borders and rounding removed. Stories use native horizontal overflow.

Studio separates preview and publication fields with a `1.2fr / 1fr` grid and (36px) gap, stacking on mobile with (20px) padding. Profile and inbox reflow locally; inbox switches between thread list and chosen conversation on mobile. Reels and stories use bounded portrait viewers, not an autoplay feed. The preserved workspace shell uses a (232px) rail and (32px) desktop content padding. Clinic adds a wrapping quick-task strip while keeping operational forms.

Spacing is extracted from repeated control, post, panel and grid values in the frontmatter; there is no claimed mathematical scale. Preserve min-width constraints and long-text wrapping alongside those dimensions.

## Elevation & Depth

The system is flat by default. White surfaces, light tonal grounds, fine borders and image crops provide structure. No ambient shadow belongs under every post or operational panel. Small local shadows separate carousel controls and dots from photos; the selected studio kind tab has a shallow shadow.

### Shadow Vocabulary

- **Carousel control:** `0 3px 12px #142b2c29`, to lift a white control off the photograph.
- **Carousel position dot:** `0 1px 4px #1a2c3060`, to preserve visibility on variable images.
- **Selected kind tab:** `0 2px 5px #174c5012`, within the studio's segmented control.

**The Flat Surface Rule.** Use borders and tonal changes for ordinary cards; reserve the observed small shadows for controls over imagery and selected studio tabs.

Micro interaction uses the shared (160ms) duration; page/reveal values are (280ms)/(600ms), with `cubic-bezier(0.2, 0.65, 0.3, 1)`. The social reaction press scales to (0.9) over (160ms ease-out). Public editorial image hover scales to (1.035) over (600ms); the public button hover lifts (2px). Reduced motion disables animations/transitions and restores automatic scrolling. These are recorded source behaviors, not claims that every state was visually reviewed.

## Shapes

Controls are gently curved, fields slightly tighter and photographic surfaces broader. Social primary/secondary actions use `control`; studio/profile fields use `field`; search and rail links use `search`; feed posts and studio use `social-panel`. Home hero photography uses `hero-photo`, while supporting public photos retain `photo`. Operational panels use `panel`. Avatars, story rings and image navigation buttons are circular.

The brand symbol retains its asymmetric (13px 13px 13px 4px) corner treatment, reduced locally for smaller shells. Story rings have a (2px) orange stroke with (3px) internal padding. Feed cards have a (1px) divider border. Mobile edge-to-edge posts are intentionally square, without becoming the shape of all controls. Message bubbles retain directional corners tied to sender state.

## Components

### Buttons

Clear, compact actions with text and a consistent Lucide icon family. Social primary links use teal/white, minimum height (44px), `10px 20px` padding and an (8px) corner. Hover deepens teal; secondary actions use tint/teal. Disabled controls use the recorded disabled colors and a blocked cursor. Native buttons inherit the surrounding font; the explicit link typography token is scoped accordingly.

Home's main care action is minimum (52px) high with inline padding (24px), becoming (48px) and (16px) on mobile. Existing professional primary buttons retain operational ink and their separate hover. These compatibility states are not the social primary variant.

Social focus is a (3px) teal outline offset (4px), covering links, buttons, fields and summaries. Outside social, older explicit global focus selectors may still win with a warm outline; that cascade is retained drift, not a new public focus rule.

### Chips / Tabs

Social feed filters are text tabs over a divider; the selected tab uses teal, weight (600) and a (2px) underline. Studio content kinds form a segmented control with (5px) outer padding, (8px) gap, and (6px) tab corners. Selection is white with teal text and the shallow tab shadow. Existing workspace chips retain their compact neutral styling.

### Cards / Containers

A post is a white, bordered photograph frame with its author above and caption/reactions below. Header padding is (16px 18px); content padding is (12px 18px 18px). Desktop photos use aspect ratio (1.13), changing to (1) on mobile, with `object-fit: cover`. Changing carousel position keeps that frame stable; position text, buttons and dots remain visible.

Empty states use white surfaces, centered copy and a real destination when available. Loading placeholders use quiet tinted blocks rather than fabricated populated content. Errors and offline notices use their explicit warm state palettes and useful text. Retained operational panels are flat with (1px) borders and no shadow.

### Inputs / Fields

Studio/profile fields are native controls with white ground, reading ink, (1px) field-edge border, (7px) corners and (12px) padding. Studio textarea is at least (180px) high and vertically resizable. Labels remain visible, with (9px) gaps in the social form. Search is a separate bordered white row with (7px 12px) padding and (9px) corners. Preserve the inherited keyboard outline and explicit validation/error text.

### Navigation

Desktop social navigation is a labelled right rail: links are at least (50px) high with (10px 12px) padding and (15px) icon gap. Hover uses the light canvas; `aria-current` adds tint, teal and weight (600). Mobile navigation uses labelled links with minimum (42px) width and (44px) height; create, Reels and inbox remain reachable. The shared wordmark has local rail/mobile size variants. No unauthenticated professional route becomes authorized through a navigation change.

### Story / Reel / Private Media

The story row presents avatars, names and orange rings, plus an outlined add-story circle. Story and Reel destinations are manual, bounded viewer proofs with explicit controls, unavailable states and privacy guidance. Stories use an overlaid header, progress strips and a caption gradient native to photography; do not turn those gradients into general page backgrounds. Reel video uses `object-fit: contain` and user playback controls. Message and medical attachments remain access controlled; a public post never confers access to private originals.

## Do's and Don'ts

### Do:

- **Do** lead social posts with the actual authorized photograph and author.
- **Do** use teal for social actions and orange for story emphasis.
- **Do** preserve Arabic line height, RTL logical spacing and long-text wrapping.
- **Do** retain keyboard focus, native forms, reduced motion and honest loading/error/empty states.
- **Do** keep conceptual imagery, test data and incomplete capabilities explicitly disclosed.
- **Do** preserve real routes, permissions and financial/medical privacy boundaries when applying this visual language.

### Don't:

- **Don't** describe the proposed palette as an exact color choice explicitly approved by the owner.
- **Don't** claim comp fidelity, external quality-board approval or production certification for this code-led POC.
- **Don't** fill community or professional screens with invented counts, endorsements or verification badges.
- **Don't** promote retained cool-blue overrides or legacy global focus colors into the replacement world's rules.
- **Don't** add ambient shadows to ordinary posts or use story-viewer gradients as general page decoration.
- **Don't** treat the clinic quick-task strip as proof of a completed professional-platform redesign.
