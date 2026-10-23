# Design sources and installed skills

## 2026-10-23 Social rebuild proof — current scope

The owner accepted the attached Arabic rebuild execution brief and selected community photographs/posts first, with quick access to Stories and Reels. The new teal/warm palette is a proposed implementation under that redesign authorization, awaiting owner visual review; the earlier blue/white approval below is historical. The first working slice is code-led at `f4429f36e48458cbef9884ec028b987f7f568f7d`, with seed `seed:9dba20ecac09d120`. The remote direction roll was degraded, so no external challenger or quality board was inspected. Three labeled in-app layout sketches provide the requested comparison; they are not persisted community records.

No new generated raster asset was made for this batch. Existing conceptual photography retains its prompts and embedded provenance; the browser proof uses isolated synthetic records and a test video encoded from an existing image. See [asset credits](ASSET_CREDITS.md), [new captures](evidence/social-rebuild/f4429f36/README.md) and [release evidence](audits/RELEASE_EVIDENCE.md). A fresh Impeccable finish reviewer inspected all 27 captures and returned `ship` for presenting this first-task POC to the owner, without certifying production readiness or full social completion. Security guidance was applied as focused source review only; there was no comprehensive independent security audit.

The runtime/skill installation notes below describe earlier work; no Vercel account or Bolt workflow was introduced by this batch.

Runtime setup was repaired on 2026-10-23: the Impeccable launcher is executable and engine 0.1.16 passes its probe; Vercel CLI 65.2.0 is installed in a private ignored cache. Reproducible commands and account requirements are in `docs/SKILLS_SETUP.md`. The owner cancelled the Bolt workflow and has no Vercel account; no Vercel deployment or account analysis is claimed. All restored authoring files remain present.

Current source packaging (2026-10-23): following the smaller Bolt snapshot, the owner requested restoration of all 522 removed files. The original vendored authoring tools under `.agents/skills`, generated browser screenshots and `.taste-skill` direction files are restored and tracked again. Runtime libraries, image originals/prompts, shared components and the MIT notice below remain unchanged.

Owner supplied all three archives and approved a complete redesign in the proposed blue/white editorial direction. Skills are vendored under `.agents/skills/`; archive hashes are in `INSTALLATION.json`, licenses in `licenses/`. Only actual skill directories and their supporting references/scripts are installed. Duplicate ZIP bundles, repository harness configuration, symlinks and unrelated sites/tests are omitted. No uploaded package installer or deployment script was executed. ESLint/Prettier leave vendored skill sources unchanged; project source, type, secret and security checks still run normally.

Applied: Taste frontend (page composition, app density, browser inspector), Impeccable (product context, art direction, craft floor, finish review), Vercel React best practices (server rendering, selective client interactivity, existing dynamic media imports), composition patterns (shared shell with domain content), web design guidelines (keyboard/focus/forms/reduced motion). Mobile-native, Vercel deployment and token CLI skills are installed but not invoked for this web redesign.

## 21st.dev

Direct HTTPS to https://21st.dev/ returned a network-policy CONNECT 403. `21st.dev` was added to the saved environment network draft; saving does not activate it. The public project source **was accessible** and reviewed on 2026-10-22 Asia/Baghdad:

- https://github.com/serafimcloud/21st
- https://raw.githubusercontent.com/serafimcloud/21st/main/apps/web/components/ui/button.tsx
- https://raw.githubusercontent.com/serafimcloud/21st/main/apps/web/components/ui/sidebar.tsx
- https://raw.githubusercontent.com/serafimcloud/21st/main/apps/web/components/ui/accordion.tsx

Adapted patterns: fixed icon alignment and control dimensions, visible focus, separate mobile navigation state, neutral selected navigation, clear collapsible FAQ interaction. Petra uses its existing stack, semantic native details/summary and a custom RTL shell rather than importing a second component framework. The public sources' MIT notice is preserved in `docs/licenses/21st.dev-MIT.txt`. This is pattern inspiration, not a claim to browse the live component gallery, copy a paid template, or create a design nobody else could resemble. No 21st API key, hosted component runtime, analytics or external font/image request was added.

## Imagery

Four new conceptual images were generated for Petra using OpenAI image generation: companions, care, essentials, companion. Exact prompts accompany the files under `apps/web/public/images/`. They depict no actual clinic, patient, customer, endorsement or purchasable SKU. They are not evidence of service outcomes. Next/Image serves responsive optimized versions; originals retain provenance and remain outside any medical file system.

## Direction and limitations

Taste sentence-as-layout seed 851831101; app editorial-greeting with owner-approved Arabic type and blue/white palette. Impeccable seed:26ad83fd6796f101 assigned candidate four of the grounded direction list in DESIGN_DIRECTION.md. Its remote roll service was unavailable, so no external challengers or quality boards were used. This is a code-led redesign, without an approved image comp. Browser checks and reviewer findings, rather than unperformed comp-fidelity checks, are the evidence.

## Additional owner-selected tools

- Official GSAP skills: https://github.com/greensock/gsap-skills at `aed9cfd3277740755f6bfc1155c7aa645403b760` (eight skills, MIT). Applied core, timeline, React, ScrollTrigger and performance guidance.
- Lenis: https://github.com/darkroomengineering/lenis at `e01eefb1f55cd08bc051521d74f5f8182b71ee9d`. This repository supplies a library, not an upstream SKILL.md; Petra installed the npm library and authored `lenis-integration` with original docs and MIT license. Public fine-pointer scrolling shares one GSAP ticker; touch and workspaces retain native scrolling.
- Cloudflare guidance: https://github.com/cloudflare/security-audit-skill at `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (MIT). Applied focused read-only source review to private media and authentication boundaries. This is not a comprehensive independent penetration test or release approval.

Motion dependencies are lazy-loaded only for the public experience after the browser preference check. Content does not start hidden. Context cleanup and live reduced motion are tested. No hosted animation script, external font or analytics request was added. Exact image prompts are also embedded in PNG metadata; the provenance scanner reports four images, zero missing.
