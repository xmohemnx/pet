---
name: petra-lenis-integration
description: Petra's local integration guide for the Lenis smooth scrolling library, with original upstream documentation and license. Use for Lenis setup, GSAP ticker integration, reduced motion and cleanup on public pages.
---

# Lenis in Petra

This project-authored guide wraps the supplied upstream library; it is not an upstream official skill. Read references/README.md and references/REACT.md for API details. Repository and reviewed commit are in ../INSTALLATION.json.

- Use the npm lenis package. Do not install its playground or another app framework.
- Apply only to the public editorial page, after client mounting. Working dashboards, clinical records, chats, maps and financial forms keep native scrolling.
- Keep touch scrolling native, keyboard scrolling and hash targets functional, and content visible when JS fails.
- Skip enhancement under reduced motion; respond to preference changes. Skip scroll smoothing with a coarse pointer or user save-data preference.
- Use one RAF source: when GSAP drives it, set Lenis autoRaf false, call raf(time * 1000) from its ticker, and remove the same callback on cleanup.
- Handle anchors explicitly with one owner for URL, focus and scrolling, and preserve native fallback. Prevent smoothing inside fields, native disclosures, dialogs and nested scrollable content.
- Destroy Lenis and remove listeners and temporary document classes when leaving. Never reset scroll position in cleanup or alter dashboard restoration.
- Import the recommended CSS locally. No telemetry or hosted script is needed.
- Verify reduced motion, keyboard anchors, native touch scrolling, route cleanup and overflow. Avoid scroll locks or long pinned scenes.
