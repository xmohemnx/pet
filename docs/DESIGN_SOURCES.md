# Design sources and installed skills

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
