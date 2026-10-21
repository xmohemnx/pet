# 12 — هوية Petra الجديدة: واجهات سينمائية حديثة وأنيميشن احترافي

## هدف المستخدم بصراحة
**لا يريد واجهة عادية أو قالب داشبورد جاهز.** المطلوب هوية مرئية Premium لمنتج حيوانات أليفة دافئ وموثوق: تصميم نظيف ومميز، تأثيرات تفاعلية واضحة ومريحة، سلاسة أثناء الحركة، وتجربة مختلفة على الويب والموبايل. الأنيميشن ليس مجرد fade لكل عنصر؛ يجب أن يروي قصة ويشرح الانتقال والحالة.

## ADN — DNA الهوية
- مصدر الإلهام من مشروع Petra القديم: teal lagoon `#0E6873`, warm orange `#FE7E3C`, ink `#1A2C30`, calm off-white backgrounds. اقتراح tokens قابلة للمراجعة وليس نسخاً حرفياً لكل CSS.
- الشخصية: friendly / trustworthy / sophisticated / tactile / gentle and playful. صور حيوانات حقيقية عالية الجودة بموافقة الاستخدام، silhouettes أو iconography بسيطة، نسيج ناعم، ظلال محكمة، cards بأحجام وطبقات مدروسة، زخارف paw/care circles خفيفة بدلاً من عشرات الأيقونات المتراكمة.
- Font: عربي واضح يصلح RTL (Cairo, IBM Plex Sans Arabic أو خط مرخص مكافئ)، type scale ونظام وزن، line-height لمساحات القراءة؛ أرقام مالية بتباعد واضح ومحاذاة مستقلة.
- tokens: `surface/default/elevated/glass`, `brand/primary/accent`, `semantic/success/warning/danger`, `radius`, `shadow`, `spacing`, `typography`, `motion/duration/ease/spring`, `z-index`, `breakpoints`; دعم light/dark اذا سُلّم تصميم فعلي قابل للاختبار.

## تصميم الصفحة الرئيسية العامة — UX storyboard مطلوب
1. Header transparent-to-solid with gentle backdrop on scroll، شعار Petra مميز، تنقل واضح وأزرار انضمام/اكتشف خدماتنا.
2. **Hero cinematic interactive**: صورة/مجموعة صور حيوانات عالية الجودة أو 3D-like layered imagery، عنوان عربي مؤثر، خلفية gradients وorganic shapes تتحرك بخفة مع pointer (إن كان الجهاز يسمح)، CTA واضح (ابدأ رعاية حيوانك / اكتشف العيادات)، وتفاعل أولي micro-story.
3. **Services constellation**: بطاقات منسقة غير نمطية تنكشف بتتابع عند الظهور، hover lift + parallax محدود؛ أقسام الرعاية/الأطباء/المتجر/التبني/الإنقاذ/التاكسي.
4. **Care journey**: animated connected steps مع تقدم على scroll؛ إضافة حيوان → رعاية → حجز → متابعة، دون تشتيت المستخدم.
5. **Social showcase**: Reels mock previews مع حركة فيديو حقيقية فقط عند تفاعل أو في نطاق view/إعداد متوافق؛ لا autoplay بالصوت، ولا تكرار فيديو ثقيل.
6. **Clinic marketplace showcase**: مجموعة منتجات وخدمات بتبديل مرن، بطاقات تفاعلية ذات quick view، عنصر cart add مع feedback.
7. **Community/Rescue**: قصص إنقاذ موثقة ومحتوى مصرح به؛ compassionate animation هادئ بلا استغلال صور صادمة أو إظهار مواقع حساسة.
8. **Final CTA & footer**: دعوة للحجز أو الانضمام + روابط رسمية وسياسات.

## 5 Dashboards — motion-driven, utility-first
- Customer: expressive summary hero للحيوان النشط، mini calendar، smooth segmented navigation, progress rings and reminders، card transitions based on real state, notifications and empty states illustrated with elegant motion.
- Doctor: patient flow timeline, appointment status transitions, contextual microinteractions, readable signed medical forms؛ تجنب الحركات التي تؤخر حفظ وصفة.
- Clinic: executive overview، mini sparkline charts، product/catalog filter state، drawers/modal enter/exit، drag-friendly scheduling and inventory grids، animation only when useful.
- Driver: route state timeline، active ride CTA، status beacon subtle، live tracking smooth mapping (not simulated GPS), real-time updates and offline states.
- Admin: data-dense control panels, polished but restrained page transitions, responsive tables, skeleton states, action confirmation flows, alerts, clear money states; no motion that hides risk.

## Motion library + recipes
- Prefer `motion`/Motion for React for local transitions and scroll reveals; GSAP only if exceptional timeline complexity is justified; avoid mixing excessive libraries. Use native CSS for lightweight hover/focus states. Rive/Lottie only with properly sourced/licensed assets and real performance tests.
- Motion tokens suggested (tune based on perceived speed):
  - micro: 120–180ms, navigation: 180–320ms, entrance/reveal: 350–600ms, hero narrative 500–900ms once (not blocking), spring tuned to no uncontrolled overshoot.
  - easing: standard `ease-out` on arrival, natural spring for cards/buttons, no aggressive elastic shakes.
- Component specs:
  - `AnimatedPage`: route fade + 12px translation / respect scroll restoration.
  - `SectionReveal`: intersection observer once, stagger up to 60–100ms on first load, skip animation on long scrollers or subsequent tab switches.
  - `MagneticCTA`: desktop pointer micro offset max 6px, keyboard focus unaffected, disabled on touch/reduced motion.
  - `PetProfileSwitch`: crossfade photo/stat with consistent card height, no layout jump.
  - `ProductCard`: image parallax 2–4px + gentle shadow, add-to-cart feedback, no accidental hover-reliant actions.
  - `ReelsViewer`: swipe/snap, status/progress, data-safe preload, intersection pause when hidden, keyboard controls, no autoplay audio.
  - `Toast/Success`: lightweight transition and ARIA announcement; errors persist enough to read.
  - `Chart`: animate only initial data appearance; value transitions must preserve correctness/legend; reduce data animations under high load.
  - `Skeleton`: soft pulse with reduced-motion static; match loaded layout dimensions.

## Design acceptance / animation performance
- Every page has mobile/tablet/desktop layouts; 320px narrow, 375/390px, 768px, 1024px, 1440px representative widths, RTL checked.
- Honor `prefers-reduced-motion: reduce` (no parallax/scroll illusions/staggers, instant state changes; video remains user-controlled).
- 60fps aspiration on ordinary modern devices for simple interactions; measure frame drops, long tasks, CPU and low-memory devices. Avoid heavy backdrop-filter everywhere, animations of width/height/box-shadow if costly; prefer transforms/opacity when appropriate.
- CSS and JS chunk budgets defined after profiling; lazy-load media and charts. Web Vitals targets tailored to launch environment and tested (LCP, INP, CLS).
- Functional screens load even if JS animations error; respect device battery/data settings, screen readers, focus/keyboard, color contrast.
- Skeleton, empty, error, offline and loading states designed deliberately; no fake counters/medical stats in production.
- Deliver **one public landing POC, one animated customer dashboard, one clinic finance page and mobile prototype** as design signoff before rolling design system across all sections.

## What to avoid
Generic purple dashboard template, too many animated gradients, slow page transitions, mouse-only navigation, excessive glass blur that harms text contrast, animated money figures hiding exact values, fixed backgrounds that lag on mobile, parallax with vestibular motion triggers, empty forms styled as demo but nonfunctional.
