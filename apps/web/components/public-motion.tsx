'use client';

import type { RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function PublicMotion({
  scope,
}: {
  scope: RefObject<HTMLDivElement | null>;
}) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const media = gsap.matchMedia();
      media.add(
        '(prefers-reduced-motion: no-preference)',
        () => {
          let live = true;
          root.classList.add('petra-motion-active');
          const select = gsap.utils.selector(root);
          // Content is never hidden; the opening is one short, interruptible sequence.
          if (window.scrollY < 80) {
            const intro = gsap.timeline({
              defaults: {
                duration: 0.7,
                ease: 'power3.out',
                clearProps: 'transform',
              },
            });
            intro
              .from(select('.petra-intro h1'), { y: 18 }, 0)
              .from(
                select('.petra-intro-bottom > *'),
                { y: 12, stagger: 0.07 },
                0.08,
              )
              .from(
                select('.petra-cover > img'),
                { scale: 1.035, duration: 1, transformOrigin: 'center center' },
                0.04,
              );
          }
          const groups = [
            ['.petra-world', '.petra-section-heading > *, .petra-story'],
            ['.petra-journey', '.petra-section-heading > *, .petra-steps > li'],
            [
              '.petra-community',
              '.petra-community-photo, .petra-community-copy',
            ],
            ['.petra-faq', 'h2, details'],
            ['.petra-closing', 'h2, div'],
          ];
          for (const [sectionSelector, childrenSelector] of groups) {
            const section = root.querySelector(sectionSelector!);
            if (!section) continue;
            gsap.from(section.querySelectorAll(childrenSelector!), {
              y: 18,
              duration: 0.55,
              ease: 'power3.out',
              stagger: 0.06,
              clearProps: 'transform',
              scrollTrigger: { trigger: section, start: 'top 92%', once: true },
            });
          }
          let lenis: Lenis | undefined;
          const update = (time: number) => lenis?.raf(time * 1000);
          const onVisibility = () => {
            if (document.hidden) lenis?.stop();
            else lenis?.start();
          };
          const onLoad = () => {
            if (live) ScrollTrigger.refresh();
          };
          const onAnchor = (event: MouseEvent) => {
            if (
              !lenis ||
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            const link =
              event.target instanceof Element
                ? event.target.closest('a')
                : null;
            if (!link) return;
            const url = new URL(link.href, window.location.href);
            if (
              url.origin !== location.origin ||
              url.pathname !== location.pathname ||
              url.search !== location.search ||
              !url.hash
            )
              return;
            let target: HTMLElement | null;
            try {
              target = document.getElementById(
                decodeURIComponent(url.hash.slice(1)),
              );
            } catch {
              return;
            }
            if (!target || !root.contains(target)) return;
            event.preventDefault();
            history.pushState(history.state, '', url.hash);
            target.focus({ preventScroll: true });
            // Native keyboard/focus scrolling can interrupt wheel inertia. Sync
            // to the actual position before measuring an element target.
            lenis.scrollTo(window.scrollY, { immediate: true });
            lenis.scrollTo(target, { duration: 0.75 });
          };
          if (window.matchMedia('(pointer: fine)').matches) {
            lenis = new Lenis({
              autoRaf: false,
              lerp: 0.14,
              smoothWheel: true,
              syncTouch: false,
              // A single owner handles hash, focus and scrolling; native fallback
              // remains intact when this enhancement is disabled.
              anchors: false,
              respectReducedMotion: true,
              stopInertiaOnNavigate: true,
              prevent: (node) =>
                !!node.closest(
                  'input, select, textarea, details, dialog, [data-native-scroll]',
                ),
            });
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add(update);
            document.addEventListener('visibilitychange', onVisibility);
            document.addEventListener('click', onAnchor, true);
          }
          root.addEventListener('load', onLoad, true);
          void document.fonts.ready.then(onLoad);
          return () => {
            live = false;
            root.removeEventListener('load', onLoad, true);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('click', onAnchor, true);
            gsap.ticker.remove(update);
            lenis?.off('scroll', ScrollTrigger.update);
            lenis?.destroy();
            root.classList.remove('petra-motion-active');
          };
        },
        root,
      );
      return () => media.revert();
    },
    { scope },
  );
  return null;
}
