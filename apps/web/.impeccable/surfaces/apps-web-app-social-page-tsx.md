---
version: 1
slug: 'apps-web-app-social-page-tsx'
primary_target: 'apps/web/app/social/page.tsx'
related_targets:
  [
    'apps/web/components/social/social-feed.tsx',
    'apps/web/app/social/create/page.tsx',
    'apps/web/app/social/u/[handle]/page.tsx',
  ]
---

# Petra Social — إثبات تصميم وشريحة محفوظة

Mode: Operate. Scope: Feed, Create Studio, Profile and dedicated social navigation. The owner selected photos and community posts first, with fast access to stories and reels. Build the recommended POC in code as expressly requested in the execution brief; owner review follows real browser evidence before broad rollout.

## Direction contract

THESIS: يوميات الرفاق. Lead with the actual community photograph and its author, replacing the all-in-one administrative form page.
OWN-WORLD: Proposed implemented teal #0e6873, ink #1a2c30, white and lightly tinted surfaces, restrained warm #fe7e3c for story emphasis. These exact colors are implementation choices for owner review, not an explicitly owner-selected palette. Bundled Arabic IBM Plex, readable fields and one icon family. Daytime phone use in a home or clinic forces a light surface with strong contrast.
STORY: Find a companion's moment, read it, react, visit the author, or publish one's own photo through a separate studio. Privacy remains visible and server enforced.
FIRST VIEWPORT: Desktop right navigation, central 620px feed with horizontal stories and a photo-led first post, left discovery column. Mobile compact header and stories above a full-width post; bottom navigation. Primary create action is always findable.
FORM: Community photo journal, grounded candidate5; seed:9dba20ecac09d120. Network roll was degraded without external challengers or an external quality board; no approved visual comp exists. Other grounded forms considered: veterinary field guide, family photo album, shelter notice board, park notice rail, community photo journal, festival program, chronological contact sheet. Owner's photos-first instruction determines the proof and priority.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature: photograph carousel changes within a stable image frame; current position is readable and keyboard controlled. No autoplay audio, no feeds containing medical or chat media, no fabricated counts or verification badges. Working legacy controls remain on an explicit settings/management route.

## Finish record

Implementation source: `f4429f36e48458cbef9884ec028b987f7f568f7d`. Evidence: `docs/evidence/social-rebuild/f4429f36/` and its manifest. The separate finish reviewer inspected all 27 supplied images and returned `ship` for the first-task POC ready for owner visual review. The captured scope includes Feed, Create Studio, Profile, initial Story/Reel/Direct viewers and navigation; advanced requirements remain incomplete in `docs/audits/RELEASE_EVIDENCE.md`. It does not certify the whole social platform, broader clinic/professional redesign or production readiness. DESIGN.md and its schema-v2 sidecar describe the implemented proposal; shipping raster provenance is recorded through `docs/ASSET_CREDITS.md` and the evidence manifest.
