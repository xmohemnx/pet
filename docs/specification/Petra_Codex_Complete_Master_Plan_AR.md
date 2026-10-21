# Petra — Master Spec (All in One)

هذه النسخة تجمع جميع تعليمات المشروع في ملف Markdown واحد. الحزمة ZIP أفضل لأنها تشمل ملفات مرجع المشروع القديم بعد تنقيح معلومات الاتصال، ويستطيع Codex قراءتها منفصلة.



---

<!-- BEGIN 00_EXECUTIVE_BRIEF_AR.md -->

# ملخص تنفيذي لمالك مشروع Petra — قبل إعطاء الحزمة إلى Codex

## ماذا سيبني Codex؟
نسخة جديدة من الصفر لمنصة Petra: رعاية وملفات صحية وحجوزات وأطباء وعيادات ومتجر عيادات ومجتمع اجتماعي وتبني وإنقاذ وتبرعات ونقل للحيوانات وفندق وتجميل، مع **خمسة داشبوردات** ومحاسبة مترابطة كاملة وهوية بصرية متحركة احترافية.

## أربعة قرارات غير قابلة للتفاوض
1. **لا يوجد صاحب متجر مستقل**: إدارة المنتجات والمخزون والطلبات والفواتير والمشتريات داخل العيادة؛ ليس حذف زر فقط.
2. **لا يوجد محاسبة تجريبية**: دفاتر مالية منفصلة، قيود متوازنة، عمولات/مستحقات، سندات، تقارير، تسويات وربط بالعمليات الفعلية.
3. **لا يوجد قسم رعاية ناقص**: ملف حيوان متكامل، لقاحات وتقويم، وصفات وفحوص وجواز وسجلات مهنية وخطط رعاية وصلاحيات.
4. **لا يوجد شكل جاهز عادي**: صفحات/داشبوردات بتفاعلات مقصودة وسريعة وتصميم عربي مميز، مع مراعاة الأداء والمستخدمين الذين يفضلون تقليل الحركة.

## كيف تعرف أنه يتقدم صح؟
- Phase 00: يشتغل المشروع الجديد محلياً وفيه تجربة تصميم قوية وخطة معمارية وقاعدة الاختبارات.
- Phase 01: تشتغل حسابات وصلاحيات حقيقية، مع فصل العيادات والمدير والطبيب والسائق.
- Phase 02: العميل يحجز/يشارك سجله مع طبيب مخول، ويظهر الموعد والسجل للطرفين.
- Phase 03: العيادة تُضيف منتجاً في نفس داشبورد العيادة والعميل يشتريه، ويتحدث المخزون.
- Phase 04: تظهر فاتورة وقيد محاسبي متوازن ومستحقات عمولة/عيادة، وتنجح اختبارات الاسترداد والتكرار.
- بقية المراحل تضيف الرعاية الموسعة، السوشل، التبني، الإنقاذ، التاكسي وتختبرها.

## تحذير واقعي
هذا المشروع ضخم؛ Codex يسرّع التطوير وقد ينفذ أقساماً كثيرة، لكنه لا يجعل الدفعات المالية والامتثال وحماية بيانات المستخدمين صحيحة تلقائياً. راجع مع خبير محاسبة/أمان/قانون عند الإطلاق، واختبر القدرة على تحمل المستخدمين بمقاييس فعلية. لا تبدأ تشغيل التبرعات أو التأمين أو الاستشارات الحية دون الجهات القانونية والمزودين المناسبين.

## أول أمر
انسخ `CODEX_MASTER_PROMPT.md` في Codex بعد فتح مجلد المشروع. لا تقل فقط «اصنع الموقع بالكامل» لأن ذلك يشجع على واجهات ناقصة وغير مختبرة. بعد كل مرحلة اطلب تقرير التقدم والاختبارات ولا تنتقل قبل اجتيازها.


<!-- END 00_EXECUTIVE_BRIEF_AR.md -->


---

<!-- BEGIN README_START_HERE_AR.md -->

# Petra — خطة إعادة البناء الشاملة لـ Codex | ابدأ من هنا

**حزمة عمل تنفيذية كاملة لبناء Petra من الصفر (Greenfield)**، مبنية على وصف مالك المشروع وعلى مراجعة ملفات المصدر القديمة المرفوعة، بوصفها **مرجعاً وظيفياً وبصرياً غير موثوق تقنياً**. الحزمة ليست موقعاً جاهزاً؛ Codex سيبني الكود تدريجياً مع اختبارات ومراجعات.

## القرار النهائي المعتمد من المالك
1. المشروع: منظومة Petra للحيوانات الأليفة تشمل الطب البيطري، الملف الصحي، الخدمات، التجارة، التواصل الاجتماعي (منشورات/ريلز/ستوري/دايركت)، التبني، الإنقاذ، التبرعات، التاكسي، الفندق، التجميل، الولاء، الإدارة والمحاسبة.
2. **خمسة داشبوردات فقط**: العميل، الطبيب، العيادة، سائق Pet Taxi، مدير المنصة. **يلغى دور «صاحب المتجر» ولوحته ومسار تسجيله تماماً**؛ إدارة متجر المنتجات والخدمات جزء مدمج داخل داشبورد العيادة، مملوك لها وبصلاحيات موظفيها. هذا قيد Product + RBAC + Data Model + Routing، وليس تغيير اسم في القائمة.
3. **محاسبة متكاملة** مالية وتشغيلية، قائمة على قيود مزدوجة محكمة، داخل لوحة المدير وعلى مستوى العيادات حسب نطاق الصلاحية. لا تعتمد الحسابات على تجميع المجاميع بالواجهة، ولا تتحرك الأرصدة دون حدث موثق.
4. **واجهة استثنائية بحركة تفاعلية مدروسة (Motion-first, not motion-heavy)**. العربية RTL أولاً، واجهات عامة جذابة وفخمة، مع تجربة استخدام سريعة وصديقة لذوي الحساسية للحركة. ليست مجرد داشبورد Tailwind عادي.
5. بناء نظيف **من الصفر**. الملفات `legacy_reference/` للقراءة واستخلاص السلوك والشاشات والأسماء والألوان فقط؛ يمنع نسخ منطق الأعمال/الأمان/SQL القديم كما هو.
6. هدف التوسع مستقبلاً إلى ملايين الحسابات، مع إثبات القدرة حسب الحمل الحقيقي والميزانية، لا ضمان رقم بلا اختبارات.

## كيفية الاستخدام في Codex
1. فك ضغط الحزمة إلى مجلد جديد خاص. **افتح جذر الحزمة كمشروع Codex** أو ارفع محتوياتها إلى مستودع Git خاص ثم افتحه في Codex.
2. اقرأ `CODEX_MASTER_PROMPT.md` وانسخه كأول رسالة إلى Codex. سيقرأ `AGENTS.md` تلقائياً إذا كان في جذر المشروع.
3. المرحلة الأولى **التوثيق وتصميم النظام وواجهات العرض التجريبية فقط**؛ لا تبدأ ببناء أقسام مبعثرة. أنجز Phase 00 وPhase 01 حسب `16_IMPLEMENTATION_ROADMAP.md`.
4. كل مرحلة: تنفيذ جزئي قابل للتشغيل → اختبارات → تقرير ما اكتمل وما لم يكتمل → موافقة قبل الانتقال للمرحلة التالية.
5. لا تضف بيانات إنتاجية حقيقية أو مفاتيح أو وصول حسابات حساسة إلى المحادثة أو المستودع. استخدم `.env.example` فقط في الكود الجديد.

## خريطة الملفات
| الملف | ماذا يشرح؟ |
|---|---|
| `CODEX_MASTER_PROMPT.md` | أمر التشغيل المطوّل الذي يلزم Codex بالخطة |
| `AGENTS.md` | قواعد هندسية ثابتة لكل تعديل |
| `01_PRODUCT_PRD.md` | رؤية المنتج والأقسام الأساسية ونطاق الإطلاق |
| `02_ROLES_AND_DASHBOARDS.md` | الداشبوردات الخمسة وإلغاء صاحب المتجر نهائياً |
| `03_CARE_AND_MEDICAL.md` | استكمال مركز الرعاية والملفات الطبية والتأمين والباقات |
| `04_CLINIC_MARKETPLACE.md` | متاجر العيادات والمنتجات والطلبات والمخزون |
| `05_ACCOUNTING_ERP.md` | المحاسبة المزدوجة والمالية والعمولات والتسويات |
| `06_SOCIAL_MEDIA.md` | ريلز، ستوري، منشورات، دايركت وإشراف |
| `07_RESCUE_ADOPTION_DONATIONS.md` | التبني والطوارئ والإنقاذ والحملات |
| `08_TAXI_AND_SERVICES.md` | رحلات Pet Taxi والفندق والتجميل |
| `09_ARCHITECTURE.md` | هيكلة الكود وقرارات التقنية والربط |
| `10_DATABASE_AND_EVENTS.md` | الجداول والقيود والأحداث والتعاملات |
| `11_SECURITY_AND_PRIVACY.md` | الصلاحيات والأمان والخصوصية |
| `12_DESIGN_MOTION_SYSTEM.md` | الهوية والأنيميشن والتفاعلات ونماذج الشاشات |
| `13_SCREEN_AND_ROUTE_MAP.md` | جميع الشاشات والمسارات المطلوبة |
| `14_API_CONTRACTS.md` | العقود بين الواجهات والسيرفر |
| `15_INFRA_SCALING.md` | البيئة والإطلاق والمراقبة والتوسع |
| `16_IMPLEMENTATION_ROADMAP.md` | مراحل التنفيذ والتبعيات والنواتج |
| `17_ACCEPTANCE_TESTS.md` | حالات قبول واختبارات must-pass |
| `18_REFERENCE_AUDIT.md` | ما لوحظ فعلياً في مشروع Bolt القديم وحدود المراجعة |
| `19_DECISIONS_AND_ASSUMPTIONS.md` | قرارات لا يجوز افتراضها بلا تحقق |
| `20_CODEX_PHASE_COMMANDS.md` | رسائل جاهزة لكل مرحلة من مراحل Codex |
| `21_FINANCIAL_EXAMPLES.md` | أمثلة قيود وتسويات محاسبية واختبارات مالية |
| `22_DESIGN_REVIEW_CHECKLIST.md` | الجودة البصرية والحركة والـ RTL وقابلية الاستخدام |
| `23_GLOSSARY_AND_STATE_MACHINES.md` | المصطلحات والحالات الانتقالية لكل نظام |
| `legacy_reference/` | نسخة مصدر قديم مرجعية مع إزالة بيانات اتصال ظاهرة؛ لا تشغّلها إنتاجياً |

## تعريف الإنجاز
ميزة «مكتملة» تعني: حفظ حقيقي + تحقق سيرفر + صلاحيات + رسائل خطأ واضحة + اختبارات + سجلات + أداء مقبول + واجهة نهائية RTL / responsive / motion + توثيق. أي Demo بلا Backend أو Mock لا يُسوّق على أنه نظام مكتمل.

## تحديثات مهمة
المشروع السابق يحتوي على بعض القواعد/الواجهات التي تحمل اسم `store_owner` أو `store`؛ في المشروع الجديد يُمنع إنشاء دور مستقل أو داشبورد مستقل بهذا الاسم، ويمكن الاحتفاظ بالاسم المنطقي `storefront` لواجهة المتجر العامة **على أن مالكه `clinic_id`**. لا تعتمد الهجرة على قاعدة Bolt السابقة؛ المشروع جديد.


<!-- END README_START_HERE_AR.md -->


---

<!-- BEGIN CODEX_MASTER_PROMPT.md -->

# CODEX MASTER EXECUTION PROMPT — PETRA GREENFIELD REBUILD

You are the technical lead and a coordinated engineering team: Principal Architect, Staff Backend Engineer, DB Architect, Security Engineer, Accounting Systems Engineer, Product Designer (Arabic RTL / advanced motion), Mobile Engineer, QA Lead, DevOps/SRE. You are to **actually implement** a new working codebase over successive milestones, not merely output mock screens. Read `README_START_HERE_AR.md`, `AGENTS.md`, and **all requirements files 01–23** before architectural decisions. The old Bolt source inside `legacy_reference/` is REFERENCE ONLY and must not be used as trusted production code, security policy, or DB schema.

## Immutable user requirements
- Petra is an Arabic-first, responsive multi-sided pet care ecosystem: owners/pets/vets/clinics/appointments/care plans/hospitality/grooming/marketplace/social posts/reels/stories/direct messages/adoption/rescue/donations/taxi/loyalty/admin/analytics.
- EXACTLY FIVE user-facing dashboards: customer, doctor, clinic, pet-taxi driver, platform admin. NO store owner persona, signup, role, dashboard, route, or standalone seller portal. All commerce back-office functions and services are **inside the clinic dashboard**, with staff permissions scoped to one or more clinic organizations. A clinic may operate multiple branches, catalogs, inventories and storefronts, but they remain clinic-owned. Customers shop in a public Marketplace.
- Full financial accounting: double-entry, balanced immutable posted journals, controlled reversals, revenue vs platform commission, clinic/doctor/driver payables, receipts/invoices/credit notes, payment reconciliation, inventory and cost of goods, refunds, donations with restricted funds, closing periods, financial statements, and reliable audit trails. See `05_ACCOUNTING_ERP.md` and `21_FINANCIAL_EXAMPLES.md`. NEVER treat summaries generated in React as the source of truth. Money logic is server-side, idempotent, transactional, tested.
- CARE CENTER is a first-class, COMPLETE product area: pet profiles, longitudinal clinical record, appointments, vaccines, schedules, treatments, prescriptions, labs, medical passport, reminders, subscriptions/care packages (insurance only with appropriate licensed partner), consent and medical confidentiality. See `03_CARE_AND_MEDICAL.md`.
- DESIGN: premium, emotionally warm, modern, animated and interactive in public areas; refined, fast, legible motion in dashboards. Build a full motion token system, page transitions, staggered reveals, hover microinteractions, meaningful loading and success states, parallax sparingly, visually rich hero, dynamic content and accessible reduced-motion fallback. See `12_DESIGN_MOTION_SYSTEM.md`. Do not deliver stock/admin-template aesthetics. Retain Petra's teal/orange spirit as inspiration, evolve rather than reproduce flawed old UI.
- Secure production-grade architecture with practical modularity, clear tenancy boundaries, API contracts, migrations, monitoring, and incremental scaling. Millions of users is a long-term capacity goal requiring real load testing, not an immediate promise.

## Process and operating instructions
1. Start Phase 00: repository setup + repo structure + ADR/architecture proposal + traceable `REQUIREMENTS_TRACEABILITY.md` + initial sitemap/user flows + database schema draft. Document assumptions, open product/legal decisions and risks. Do not prompt the user for routine coding choices; apply documented defaults. Ask only for blocking legal/payment/provider decisions at the appropriate gate. Do not assume availability of payment providers, licenses or verified identities.
2. Use a TypeScript monorepo, modular NestJS API, Next.js website and dashboards, React Native/Expo mobile skeleton with shared API contracts, PostgreSQL, Redis and media workers. Establish stable boundaries and local Docker Compose for dev. Alternative choices require explicit written ADR explaining trade-offs. Infrastructure should start simple and managed (not premature Kubernetes).
3. Establish CI checks, strict lint/types, format, database migrations, seed data, unit/integration/E2E tests, SAST/dependency/secret checks and documented repeatable dev commands. All fixture users in local demo environments ONLY.
4. For every phase, implement **vertical slices**: real UI → API → RBAC → database transaction → events → tests → docs. No dead endpoints or buttons, no disconnected sample counters or fabricated metrics.
5. Commit in small coherent units, run migrations in a clean test DB, run all relevant checks. If a test cannot run, explain why and leave the phase INCOMPLETE. Never claim a security audit or load-test result that was not performed.
6. Maintain `PROGRESS.md`, `DECISIONS_LOG.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md`, screenshots or preview evidence for key responsive states, and a feature matrix with status: not started / partial / tested / blocked.
7. After every phase output: implemented features, file paths, tests and commands/results, demo steps and accounts, technical debt, security concerns, remaining decisions and next recommended milestone.
8. All monetary, pet medical and sensitive identity data must be protected with strong authentication and per-resource authorization. Never insert production secrets into code. Use providers behind interfaces. Social UGC requires moderation/abuse reporting and privacy.
9. The legacy source's existing data model, migrations and authorization logic are untrusted. Understand intended behavior from the reference, then implement new schemas and domain invariants; do not import seed/credentials/user data or blindly copy SQL.
10. Keep phases realistically sized; when functionality is impossible without an external contract/provider (e.g. payment, telemedicine, geolocation), build documented provider interfaces and use clearly labeled SANDBOX/DEMO adapters only for development. Do not silently fake completion.

## FIRST ACTION NOW
Read all docs. Print the proposed implementation sequence and known assumption log. Inspect `legacy_reference/` for feature parity, especially the five dashboards and the original teal/orange identity. Generate and commit Phase 00 baseline artifacts, a polished interactive design proof-of-concept for the public landing and core dashboard shell (using placeholder *content* only in the design proof, prominently labeled as such), plus test harnesses and architecture skeleton. Then continue Phase 01 only after checks. DO NOT attempt the entire platform in one giant unreviewed patch.

## Definition of Done
Backend permissions tested server-side; transactional DB invariants verified; UI works RTL and responsive with reduced-motion fallback; accessibility basics; no fake production integrations; test commands green; critical-path E2E tests; observability/logging; documented deployment and rollback. See `17_ACCEPTANCE_TESTS.md`.


<!-- END CODEX_MASTER_PROMPT.md -->


---

<!-- BEGIN AGENTS.md -->

# AGENTS.md — binding repository instructions for Codex

## Priority and intent
The user owns the Petra product. Product constraints inside `README_START_HERE_AR.md`, `02_ROLES_AND_DASHBOARDS.md`, `05_ACCOUNTING_ERP.md`, `12_DESIGN_MOTION_SYSTEM.md`, and `17_ACCEPTANCE_TESTS.md` are binding. Build the NEW platform from scratch. Legacy code under `legacy_reference/` is read-only reference material; never import it into runtime or deploy it.

## Never violate
- Only dashboard personas: `platform_admin`, `clinic_member`, `doctor`, `driver`, `customer`. Role = set of capabilities, not a mutable string trusted from sign-up or client JWT claims without server enforcement. A person may be doctor + clinic member + customer; admin never self-registers.
- No standalone `store_owner` identity/dashboard/registration/navigation. Each store/catalog, product, inventory, service and merchant payout is linked to `clinic_id`/organization. Clinic staff can have scoped `commerce_manager`, `inventory_clerk`, `cashier`, `clinic_admin` permissions within clinic dashboard without becoming a 6th dashboard persona.
- No direct balance edits, unbalanced ledger entries, delete/update of posted journal, payment capture purely from client, money stored as floating point, payout without approval/reconciliation, or donation counter changes without verified settlement.
- No sharing another clinic's medical/patient/financial data through changing URL IDs or hidden UI tabs. Verify ownership server-side. Even admin actions audited.
- No fake medical diagnosis as a substitute for licensed clinicians. Medical recommendations limited to general education, and urgent alerts should route to professional/veterinary contact with region-specific verification.
- No production key in git; do not use old credentials. No licensed insurance claim unless legal/provider agreements confirmed.
- No gratuitous animations interfering with financial forms or accessibility. Honor `prefers-reduced-motion`, performance and viewport constraints.

## Engineering agreements
- Default architecture: pnpm workspace + turborepo optional; apps/web (Next.js), apps/api (NestJS), apps/mobile (Expo when phase scheduled), apps/workers; packages/ui, packages/contracts, packages/config; PostgreSQL (migrations), Redis (queues/cache); external media storage via adapters.
- Modular monolith with domain modules and events, database transaction boundaries. Keep domain services away from React components. Create an ADR before major deviations.
- Strict TypeScript, schema validation at API edge, DTOs/versioning, consistent error envelope, UTC timestamps, configurable locale/timezone, IQD as initial currency (other currencies only if enabled/configured), integer minor units/decimal as needed, explicit rounding policy.
- All state changing endpoints authenticated, authorized and validated. Monetary endpoints additionally idempotent with deterministic event and reference IDs. Implement audit records.
- Accessibility: semantic controls, keyboard focus, labeled forms, error summary, color contrast, RTL bidi-safe numeric displays, keyboard-friendly motion.
- New documents and user-facing UI text should be Arabic (Iraqi audience), professional Modern Standard/approachable; architect docs can contain English technical terms. No accidental mixed-direction text corruption.
- Prefer simple, tested mechanisms over distributed complexity. Workers for heavy video/notifications. Provider stubs only in sandbox with explicit labels.

## Workflow each phase
(1) consult requirements & dependencies; (2) define minimal implementable slice; (3) code with migrations and fixtures; (4) execute automated checks, record exact commands/results; (5) screenshot key UI states when possible; (6) update PROGRESS and traceability; (7) report blockers with concrete details. Do not mark phase complete without acceptance criteria. Never hide failing tests.

## Mandatory invariants
`SUM(journal_lines.debit) == SUM(journal_lines.credit)` per posted journal and currency/ledger entity; invoice totals independently recalculated server-side; no negative available inventory without controlled backorder; appointments cannot overlap provider/resource allocation; social/privacy rules apply to every feed and media query; doctor records read by permitted principals only; dispatcher assignment atomic; duplicate webhook/event yields one financial effect; dates stored UTC and localized on display.


<!-- END AGENTS.md -->


---

<!-- BEGIN 01_PRODUCT_PRD.md -->

# 01 — وثيقة المنتج الشاملة PRD

## 1. رسالة Petra
بيئة رقمية واحدة لرحلة الحيوان الأليف: أمانه، صحته، رعايته اليومية، التواصل المجتمعي، الخدمات الطبية والبيطرية، التسوق، المساعدة الإنسانية والنقل. القيمة ليست «صفحات كثيرة» بل معاملات مترابطة بين مالك الحيوان والطبيب والعيادة والسائق والمدير، مع تواصل اجتماعي يزيد الاكتشاف والتفاعل.

## 2. الجمهور
- مالك الحيوان / العائلة / المتبني: التسجيل والملف الطبي والتذكيرات والمشتريات والحجوزات والمنشورات.
- الطبيب: العمل المستقل مهنياً أو كعضو في عيادة، مواعيد وحالات طبية وروشتات وصلاحيات محدودة.
- العيادة: نشاط تجاري/طبي له موظفون وفروع وخدمات ومتجر **داخلي** ومخزون ومحاسبة.
- السائق: نقل الحيوانات بمتطلبات سلامة وعمليات وحساب مستحقات.
- مدير المنصة: توثيق وتدقيق ومحتوى ومالية ومخاطر وتشغيل وتكوين.
- الزائر: بحث واستعراض عام بحدود الخصوصية قبل تسجيل الدخول.

## 3. مناطق المنتج المترابطة
1. الموقع التسويقي العام: صفحة رئيسية متحركة، التعريف، اكتشاف العيادات/الأطباء، استعراض المتجر، محتوى اجتماعي عام بعد الإشراف، دليل الخدمات، المساعدة والدعم، السياسات والتواصل.
2. الهوية والعضويات: OTP / بريد / دخول، MFA للإدارة، إدارة الأجهزة والجلسات، الاسترجاع، توثيق الأطباء والعيادات والسائقين.
3. ملفات الحيوانات والرعاية: بيانات الحيوان، المربي، الحالة الطبية، اللقاحات، ملف المرض، المتابعة، الجواز، المختبر، الروشتات وخطط الرعاية.
4. اكتشاف مقدمي الخدمة: البحث والموقع/المسافة والاختصاص/التقييم، الحجز، الدفع/الحضور، الاستشارات عن بعد وفق القوانين.
5. تجارة وخدمات العيادات: متجر عام متعدد العيادات، تشكيلة المنتجات وخدماتها، مخزون وفروع وأسعار، طلبات وتوصيل وتسويات.
6. Petra Social: منشورات/صور، قصص، ريلز، التعليقات والمتابعة، الملف الشخصي، الرسائل، الإبلاغ والإشراف والخصوصية.
7. التبني والإنقاذ: إعلان وقبول، تحقق الجهات، SOS ومفقودات ومعثورات، متابعات ميدانية، حملات مساعدة.
8. التبرعات: حملات موثقة، تأكيد دفع، تعقب إيصالات واستحقاقات، تقرير شفاف بالحد المسموح قانوناً.
9. Pet Taxi: ملف السائق والتحقق، تسعير وحجز/إسناد وتتبع أثناء الرحلة وحالات السلامة والتسويات.
10. الفندق والتجميل: باقات، توافر، حجز، إلغاء، تسعير، تأكيد حضور، فاتورة.
11. الولاء والباقات: نقاط ومكافآت وقسائم وبرامج الرعاية؛ التأمين فقط مع شركة/جهة مرخصة بعد المراجعة.
12. CMS: بنرات، صفحات أقسام، محتوى، تصنيفات، سياسات، ترجمات، إعدادات غير سرية، feature flags.
13. المحاسبة/ERP: دفتر الأستاذ العام، ذمم، عمولات، تحصيل، صرف، فواتير، مخزون وقيود، تقارير، أدوار مراجعة.

## 4. التدفقات العابرة للأقسام
- مستخدم يسجّل حيواناً → يختار طبيباً → يحجز موعداً → الطبيب يوثّق الزيارة → تُضاف الوصفة/المختبر/اللقاح لسجل الحيوان → فاتورة/دفع → قيد محاسبي → تذكير متابعة → تقييم.
- عيادة تعتمد حسابها → تُنشئ متجرها داخل داشبورد العيادة → تضيف منتجات/خدمات → عميل يطلب → حجز مخزون → دفع/تسليم → كشف مستحقات العيادة والعمولة → قيود محاسبية.
- مستخدم ينشر قصة عن حيوان مفقود → يتحول إلى بلاغ بنظام الأمان لا تلقائياً لحالة «إنقاذ مؤكدة» → البلاغات والجهات والتحقق والمتابعة.
- طلب Pet Taxi → عرض سعر قابل للتأكيد → قبول سائق مناسب → نقل فعلي مع الموافقات → إغلاق رحلة → حساب مستحق السائق وعمولة المنصة.
- حملة تبرع → تحقق الجهة → إظهار علني مقيد → التبرع المؤكد من بوابة دفع → حسابات أمانات/أموال مقيدة → صرف مصرح → كشف مالي قابل للتدقيق.

## 5. المتطلبات غير الوظيفية
- واجهة responsive كاملة وبنفس الوظائف الأساسية على الأجهزة الشائعة، RTL العربية وLTR الإنجليزية لاحقاً، دعم الأرقام والعناوين المختلطة.
- زمن استجابة وأداء تحدده SLO/SLA واقعية حسب المرحلة؛ lazy loading, CDN, mobile performance, query plans; لا تعد بأرقام عامة بلا قياس.
- مستخدمون كثر: دعم horizontal scaling حيث يلزم، قراءة آمنة، قيود استعلام، bounded queues، idempotency.
- الخصوصية والبيانات الطبية والصور ومواقع النقل: least privilege، موافقة ونطاق الاستخدام واحتفاظ وحذف حسب المتطلبات القانونية.
- معايير قبول منفصلة لكل ميزة؛ عدم تسويق المحاكاة باعتبارها خدمة دفع/استشارة حقيقية.

## 6. خارج نطاق الإطلاق الأول، لكن له عقود مصممة
خوارزمية توصية متقدمة للريلز، مكالمات فيديو طبية مدفوعة واسعة النطاق، تأمين فعلي من دون مزود مرخّص، تغطية جغرافية خارج المناطق المعتمدة، تسوية أموال حقيقية بلا مزود قانوني وتوثيق، تسعير تاكسي معقد بلا بيانات تشغيل.

## 7. معايير نجاح المنتج
اكتمال رحلة تسجيل→حيوان→حجز، ثم رحلة العيادة→متجر→طلب→تسوية؛ نسبة الطلبات المتعثرة، الأخطاء الحرجة، دقة المخزون، فروقات التسوية المالية (يجب أن تكون صفر)، زمن إنشاء موعد، تحويلات البحث، سرعة الصفحات، بلاغات الإساءة وحسمها، رضا المستخدم.


<!-- END 01_PRODUCT_PRD.md -->


---

<!-- BEGIN 02_ROLES_AND_DASHBOARDS.md -->

# 02 — خمسة داشبوردات حصراً + دمج المتجر في العيادة

## القرار الصارم
**يحذف Dashboard صاحب المتجر بالكامل** ولا يوجد تسجيل باسم Store Owner أو role مستقل بهذه التسمية. المتجر هو **وظيفة داخل Dashboard العيادة**، مع فروع ومخزون وإدارة خدمات وطلبات، وكل storefront مربوط بـ `clinic_id`. لا يُقبل أن يحذف Codex القائمة ويبقي route أو جدول role/store-owned معزولاً. وفي حال وجود متاجر عامة غير مرتبطة بعيادة مستقبلاً فهذا **قرار تغيير نطاق** يتطلب موافقة صريحة منفصلة، وليس افتراضاً.

## 1. العميل / Customer
الرئيسية الشخصية، إضافة وإدارة عدة حيوانات، التقويم والرعاية والتطعيمات، جواز/تقارير، اكتشاف أطباء، حجوزات، محفظة مستندات ومدفوعات، متجر ومفضلة وسلة وطلبات وإرجاع، اجتماعي/ريلز/ستوري/رسائل، تبنٍّ وإنقاذ وتبرعات، تاكسي، فندق وتجميل، نقاط الولاء، إعدادات الخصوصية، الدعم، حذف/تصدير حساب حيث تنطبق السياسة.

## 2. الطبيب / Doctor
ملف مهني/توثيق، الانتماء لعيادات، جداول ومستثنيات، مواعيد وتعارضات، قائمة مرضى مخولين، زيارة وملف حالة وفحوص ونتائج، وصفات، ملاحظات بتوقيع/تاريخ، متابعة بعد الزيارة، استشارة نصية/مرئية حيث متاحة، نشر اجتماعي مهني، الأرباح والمستحقات فقط، طلب نقل عند الحاجة، تنبيهات SOS إن كانت صلاحياته مفعلة.

## 3. العيادة / Clinic — المقر الرئيسي لكل تجارة
قائمة موحدة: (أ) نظرة عامة، (ب) الأطباء والموظفون والفروع، (ج) مواعيد العيادة، (د) العيادات/الخدمات الطبية، (هـ) **المتجر والمنتجات والخدمات**، (و) **المخزون والمشتريات والموردون**، (ز) **طلبات المتجر والشحن والاسترجاع**، (ح) **نقطة البيع POS (اختياري مرحلي)**، (ط) الفندق والتجميل، (ي) مراجعات العملاء، (ك) الدردشة/السوشل، (ل) التاكسي/SOS، (م) **المالية والمحاسبة وتقارير العيادة**، (ن) إعدادات المنشأة والموظفين والأذونات.
  - `clinic_admin`: إدارة العيادة والتعيينات والسياسات التجارية.
  - `doctor_member`: فقط زياراته حسب علاقة العميل/حالة المعالجة.
  - `receptionist`: الحجوزات وخدمة العملاء ضمن سياسة الاطلاع.
  - `commerce_manager`: كتالوج، أسعار، خصومات، إدارة المتجر.
  - `inventory_clerk`: منتجات وكميات/مخازن وحركات مع موافقات.
  - `clinic_accountant`: الفواتير وقيود العيادة والتقارير، لا وصول إلى دفاتر منصة أو عيادات أخرى.
  - `cashier`: تحصيل نقدي ونقطة بيع ضمن حدود مالية؛ لا يجوز حذف قيود.
هذه **صلاحيات داخل نفس Dashboard العيادة**، وليست داشبوردات سادسة إلى عاشرة.

## 4. السائق / Driver
تقديم مستمسكات والتحقق، المركبة ومتطلبات النقل، حالة متاح/غير متاح، الطلبات المناسبة، قبول/رفض محدود، خريطة أثناء الرحلة، حالات وصول/بدء/إنهاء مع إثبات/تأكيد، أرباح ومحفظة مقيّدة، سحب مستحقات بموافقة، سجل حوادث ودعم.

## 5. مدير المنصة / Platform Admin
أدوار داخل الإدارة (super admin محدود، العمليات، الموارد البشرية، التوثيق، الإشراف على المحتوى، دعم العملاء، المحاسبة، التدقيق المالي، إدارة التبرعات، إدارة النقل)، لوحة مؤشرات حقيقية، مراجعة عيادات وأطباء/سائقين، المستخدمين والبلاغات، الفهرسة، عمولات وسياسات، بيانات الفروع والمتاجر، الخدمات، التبرعات، سجل العمليات والأمان، الميزانية وتسويات ومستحقات البائعين والسائقين والأطباء، إدارة واجهة الموقع CMS، إعدادات وحوكمة.

## صفوف صلاحيات نموذجية
| الإجراء | عميل | طبيب | عيادة | سائق | مدير/فريق مخول |
|---|---|---|---|---|---|
| عرض سجل حيوان طبي | المالك أو المفوض | بحالة علاج/تفويض | الموظف المصرح ضمن العيادة | لا | استثناء تدقيقي مقيد ومبرر |
| إدارة متجر / منتج | شراء فقط | لا افتراضياً | نعم بصلاحية | لا | إشراف واعتماد فقط |
| نشر قيد محاسبي للعيادة | لا | لا | محاسب مخول | لا | مراجعة حسب صلاحية |
| مراجعة سجل المنصة العام | لا | لا | لا | لا | فريق مالي / مدقق |
| إدارة رحلة السائق | طلب/متابعة | قد يطلب فقط | قد تطلب | رحلة معينة | إدارة عمليات النقل |
| إنشاء مدير نظام | لا | لا | لا | لا | مسار إداري متعدد الموافقات |

## التوجيه Authentication / Workspaces
هوية واحدة `user_id` + `organization_memberships` + scopes؛ الطبيب قد ينتمي لأكثر من عيادة. يجب إعطاء المستخدم خيار «تبديل مساحة العمل» عند وجود أكثر من عضوية، والخادم يتحقق منها عند كل API. لا يجعل تسجيل الدخول بنفس البريد نسخة ثانية من المستخدم. لا تُسند صلاحيات إدارية عند التسجيل الذاتي.

## اختبارات منع العودة إلى دور المتجر
- لا `store_owner` في register options أو RBAC roles أو routing أو API policies أو docs الحية.
- صفحة المتجر عامة موجودة ضمن `/marketplace`؛ الإدارة محصورة ضمن `/clinic/:clinicId/commerce`.
- تحرير منتج بتمرير `clinicId` آخر ينتج 403 ولا يكشف أي معلومة.
- مالك عيادة يمكنه إدارة عدة فروع دون تبديل حساب أو إنشاء dashboard متجر.


<!-- END 02_ROLES_AND_DASHBOARDS.md -->


---

<!-- BEGIN 03_CARE_AND_MEDICAL.md -->

# 03 — مركز الرعاية البيطرية: استكمال جميع الأساسيات الناقصة

> يشمل قسم «الرعاية» والملف الصحي والتقويم والخطط/الاشتراكات والتأمين الموجود بالنسخة المرجعية. لا نعتبر القسم منجزاً بمجرد وجود بطاقات وأزرار؛ يجب أن تدعم كل وظيفة رحلة حقيقية محفوظة ومترابطة.

## A. سجل الحيوان الرئيسي / Pet 360
- هوية الحيوان: الاسم، صور متعددة، النوع والسلالة والجنس واللون والوزن، تاريخ ميلاد دقيق/تقديري، حالة التعقيم، الشريحة التعريفية/رقمها حيث قانوني، الحساسية والأمراض المزمنة، صفات خاصة، جهات اتصال طوارئ.
- العلاقة بالمالك: مالك أساسي، وصي/مشارك، نقل ملكية باعتماد، سجل تاريخ الملكية، حسابات عائلية مع تفويض محدود، رفع الوثائق ومشاركة مؤقتة مع طبيب.
- timeline لحياة الحيوان: زيارات، لقاحات، تشخيصات طبيب، وصفات، فحوص، إجراءات، تذكيرات، حالات إنقاذ، حجوزات الفندق/التجميل، سجل الوزن.
- خصوصية granular للصور، الموقع، العمر، الأمراض؛ ملف الحيوان العام لا يكشف الملف الطبي بأي شكل افتراضياً.
- وثائق/QR بطاقة خاصة بالحيوان للوصول إلى **بيانات سلامة محدودة فقط** (بيانات المالك القابلة للعرض بموافقته) وليس فتح السجل الطبي كاملاً.

## B. الرعاية الوقائية / Care Plans & Reminders
- تقويم رعاية سنوي: لقاحات، مراجعات، علاج دوري موثق، عناية الأسنان والفراء، قص الأظافر، إعادة صرف الدواء، زيارة متابعة.
- قواعد التذكير بحسب جدول يضبطه الطبيب والمالك؛ يتم التحقق من صلاحية أي جدول طبي من المختص. لا تكتب إرشادات علاج جرعات تلقائية أو مخططات لقاح ثابتة لجميع الأنواع دون أساس طبي.
- states لكل مهمة: planned/due/completed/skipped/expired مع attribution لمن أنشأها/أكدها؛ تذكيرات قبل وبعد و«عدم الإزعاج» وتفضيلات قنوات الإشعار.
- مسار: إنشاء الحيوان → اقتراح إعداد تذكيرات آمنة اختيارية → تقويم → تذكير → حجز → اكتمال بإثبات زيارة.

## C. نظام العيادة الطبي EMR
- visit/encounter: حجز، حضور، مشكلة رئيسية، ملاحظات SOAP عند الحاجة، فحص وعلامات حيوية، تشخيص/انطباع الطبيب، خطة متابعة، مستندات، clinician_signature, version history.
- كل ملاحظة طبية ترتبط بطبيب معتمد وزمنها وعيادتها وحيوانها؛ تمنع تعديل السجلات المقفلة دون Addendum موقّع يحفظ الأصل.
- سجلات أدوية وروشتات: دواء، تعليمات صادرة من الطبيب، مدة، بيانات الحساسية، status, PDF رقمي؛ عدم إصدار وصفة تلقائية من AI أو واجهة العميل.
- طلبات/نتائج مختبر وأشعة: أمر فحص، جهة، حالة انتظار/نتيجة/اعتماد، ملفات مشفرة/تحكم وصول، تعليقات وإشعار بالنتيجة.
- اللقاحات/الجواز الطبي: نوع اللقاح، تاريخ، رقم التشغيلة عند الحاجة، منفذ الخدمة، تاريخ إعادة الجرعة وفق الطبيب، دليل قابل للطباعة مع QR محدود.
- مشاركة السجل: authorization by owner/clinic-treatment relationships، سجل وصول، إلغاء التفويض، حالات طوارئ ضمن سياسة محددة؛ تصدير PDF للمالك.

## D. اكتشاف الأطباء وحجز المواعيد
- ملفات مهنية وتراخيص وفق سوق العمل، تخصص، مواقع/فروع، وسائل الحجز، أسعار الخدمات، المراجعات، التوفر.
- calendar slots يراعي دوام الطبيب/العيادة، استثناءات، الإجازات، مدة الخدمة، buffer بين المواعيد، حجز موارد/غرفة عند الحاجة، timezone.
- slot locking في DB وconfirmation retries؛ منع double-booking بين هاتفين على نفس slot.
- رحلة: اختيار حيوان، خدمة، فرع، طبيب اختياري، موعد، عرض نهائي، سياسة إلغاء، دفع/تأكيد وفق طريقة الحجز، إشعار، check-in، completion، follow-up.
- الحالات: draft/held/pending/confirmed/checked_in/in_progress/completed/cancelled/no_show/refunded (انتقالات محكومة).

## E. الاستشارة الطبية والتواصل
- قناة آمنة للمحادثة الطبية منفصلة منطقياً عن الدايركت الاجتماعي. ربط conversation بحالة طبية/حجز، موافقة على الاستخدام، مرفقات مسموحة، مؤشرات عدم التوفر والطوارئ.
- الاستشارة المباشرة بالصوت/الفيديو **مشروطة** بقرار ترخيص وموفر جلسات آمن وإدارة الوقت والدفع. لا عرضها كخدمة متاحة قبل التكامل الحقيقي.
- لا تنسب إجابة AI لطبيب؛ كل ملاحظة طبية موقعة بمن قام بها.

## F. باقات الرعاية / Health Plans / Subscription
- package catalog: اسم، فئة، خدمات مغطاة، عدد الاستخدامات، فترات صلاحية، قيد العيادة/الفرع، سياسة الإلغاء والتجديد، حدود وفترات انتظار.
- شراء/اشتراك/ترقية/إيقاف/تجديد/انتهاء؛ `entitlements` لمزايا الباقة؛ استهلاك خدمة مشمولة ينتج حركة خصم usage ledger في معاملة واحدة بلا استهلاك مزدوج.
- باقات الرعاية ليست بالضرورة «تأميناً». كلمة تأمين وبيع تغطية مخاطر لا يستخدمان إلا مع شريك مرخص ومراجعة عقود/تنظيم في البلد المختار.
- دفتر إيرادات مؤجلة / revenue recognition للاشتراكات بحسب سياسة محاسبية معتمدة؛ حساب الخدمة المستهلكة وصلاحيات الطبيب/العيادة.
- لوحة العيادة: ضبط وإدارة باقاتها، محتوى، توافر، مبيعات وخدمات مستخدمة وتقارير؛ لوحة المدير: الإشراف على سياسات ومعاملات/عمولات.

## G. رعاية منزلية وتغذية ونمط حياة (مرحلة لاحقة بعد الأساس)
- سجل وزن ونشاط وأكل/شرب اختياري، أهداف بسيطة يضعها المالك أو الطبيب، تتبع الحساسية والتنبيهات السلوكية العامة؛ عدم استنتاج تشخيص تلقائي.
- مكتبة مقالات مع مراجعة تحريرية بيطرية وتاريخ مراجعة وإخلاء مسؤولية؛ قابلية التصفية حسب النوع والعمر.
- خدمات رعاية منزلية/زيارة منزلية مرتبطة بعيادة/طبيب مع جدول وأسعار وإشراف؛ لا تخلطها مع مزودين مجهولين.

## H. دليل الشاشات في مركز الرعاية
1. `Care Home` — ملخص الحيوان النشط، تنبيهات، مواعيد قادمة، متابعة.
2. `My Pets` — قائمة/بطاقة/إضافة/تحرير ونقل ملكية.
3. `Pet Profile 360` — Timeline, health tabs, vaccinations, weight chart, attachments, privacy.
4. `Medical Passport` — معاينة/طباعة/مشاركة محددة.
5. `Vaccines & Reminders` — تقويم مع حالات.
6. `Appointments` — استكشاف → حجز → متابعة/إلغاء.
7. `Consultations` — المحادثات الطبية ونتائجها.
8. `Prescriptions` — أوامر من أطباء، لا يحررها العميل.
9. `Labs & Imaging` — طلبات/نتائج ومرفقات مصرح بها.
10. `Care Packages` — مقارنة وخيارات/شراء/استهلاك/التجديد.
11. `Health Educational Hub` — مكتبة مراجعة وآلية شكاوى وتصحيح.
12. `Emergency Contacts` — جهات مصرح لها/إرشادات آمنة.

## I. اختبارات قبول حرجة
- مالك A لا يرى تحاليل حيوان B ولو عرف ID. طبيب X لا يرى السجلات بلا علاقة علاج أو تفويض صالح.
- الطبيب يحاول تعديل روشتة موقعة: يطلب Addendum ولا يغير الأصل.
- مستخدمان يحجزان نفس الموعد متزامناً: حجز واحد فقط.
- استخدام حق اشتراك مرتين بطلب مكرر: خصم خدمة مرة واحدة.
- عطل عملية الإشعار لا يلغي نجاح الزيارة؛ يُعاد إرسال الإشعار بصف مهام.
- حذف حيوان مع زيارات مالية/طبية يخضع للاحتفاظ القانوني ويفصل الهوية العامة دون تدمير سجلات ملزمة.


<!-- END 03_CARE_AND_MEDICAL.md -->


---

<!-- BEGIN 04_CLINIC_MARKETPLACE.md -->

# 04 — Marketplace متكامل مُدار من داشبورد العيادة فقط

## Ownership / Data Model
- متاجر البيع كيانات `clinic_storefronts` تابعة لعيادة (`clinic_id`)، ويمكن للعيادة اختيار واجهة واحدة أو أكثر حسب الفروع مع منطق ملكية واضح. لا حساب ولا داشبورد «صاحب متجر» منفصل.
- منتجات وخدمات العيادة تظهر للعميل في `/marketplace` وعبر الصفحة العامة للعيادة. يضيفها موظف العيادة فقط في `/clinic/.../commerce`.
- العميل يدفع حسب seller-of-record وخطة المدفوعات المعتمدة؛ رقم عمولة المنصة منفصل عن إيراد العيادة وعن ضرائب/خصومات/شحن.

## أقسام لوحة تجارة العيادة
1. **Overview**: إجمالي الطلبات وصافي المبيعات والمردود والمنتجات منخفضة المخزون وطلبات بحاجة إجراء، من backend.
2. **Catalog**: تصنيفات/ماركات/وسوم؛ منتج بسيط أو متعدد الخيارات؛ SKU, barcode, unit, variant, images, specs, description, status, SEO, age/species suitability لا يدعي ميزات طبية دون مراجعة.
3. **Services**: خدمات علاجية/فندق/تجميل/زيارة منزلية، أسعار ومدد وتوافر، أسعار بحسب الفرع، متطلبات الحجز.
4. **Inventory**: مستودعات ومواقع بنطاق العيادة والفروع، opening stock، receipts, adjustments, movements, reservations, returns, expiry/batches، near-out-of-stock، ledger لا يتلف بعد التسويات.
5. **Purchasing**: موردون، طلب شراء PO، استلام بضائع GRN، فاتورة مورد، مستحقات/دفع، مطابقة 2/3-way حسب مستوى التعقيد.
6. **Pricing/promotions**: قوائم أسعار، قسائم، سياسة تكديس، خصم نسبة/ثابت، حدود، تواريخ صلاحية، ربط محاسبي.
7. **Orders**: عرض/تفصيل/قبول/تجهيز/شحن/تسليم/مرتجع/نزاع. تحتوي الطلبات متعددة العيادات على `parent_order` و`clinic_orders` و`order_lines` و`shipment`.
8. **Refunds**: RMA وإرجاع مخزون مشروط وفاتورة إشعار دائن ومستحقات إعادة دفع دون الإخلال بمبالغ العمولة.
9. **Clinic finance**: دفتر مبيعات العيادة، الذمم، طرق السداد، تسويات المنصة، ربحية المخزون، تقارير طباعة وتصدير.
10. **Store Settings**: الشعار وصورة الغلاف وأوقات التوفر وسياسة التسليم والإرجاع، إعدادات المخازن والفروع والشحن دون تعديل قالب الأمان.

## واجهة المستهلك
- بحث وفلاتر حسب الحيوان والفئة والعيادة والسعر والتوفر والمحافظة والتقييم، صفحات SEO مناسبة، صفحات خدمة/منتج مفصلة، Wishlist، مقارنات اختياري، سلة متعددة العيادات، كوبونات، عنوان وشحن، checkout، tracking، reviews موثقة لشراء.
- السلة تستعرض الرسوم النهائية لكل عيادة قبل الاعتماد؛ الدفع بمعاملة موثوقة ولا يثق خادم الطلب في الأسعار المرسلة من المتصفح.
- المنتجات غير المتاحة أو التي قد تتطلب وصفة/تقييد مهني تخضع لقواعد عرض وبيع قابلة للتهيئة بعد مراجعة تنظيمية.

## سياسة المخزون والطلب
`AVAILABLE = ON_HAND - RESERVED - NON_SELLABLE`. أي بيع/حجز كمية في معاملة DB؛ لا كميات سالبة افتراضياً. حجز قابل لانتهاء الصلاحية، worker releases stale reservations، ومراجعة ثنائية للحركات الكبيرة.
- إنشاء الطلب Idempotency-Key؛ حدث `OrderPlaced` بعد commit عبر transactional outbox.
- حالات: cart→checkout_pending→confirmed→allocated→packed→shipped→delivered / cancelled / disputed / return_pending / returned / refunded.
- multi-seller: تجميع إجمالي العميل، تقسيم الطلبات حسب العيادة، توزيع الشحن والخصومات والضرائب بدقة؛ لا تدفع للعيادة قبل تحقق الاستحقاق والسياسة.
- المخزون/السعر لا يتغيران في React بوصفهما المصدر الوحيد؛ backend validators يحسم الكميات والتسعير.

## الربط المحاسبي
- invoice lines + tax/discount/shipping + separate clinic payable, platform commission, processor fee, cash receipt and receivable.
- cogs and inventory asset change عند event الاستحقاق حسب سياسة الجرد المعتمدة؛ مرتجع/تالف/منتهي واضح مع صلاحية وموافقة.
- الحسابات والتقارير للعيادة تعكس حصة العيادة، وليس Gross Merchandise Value بالكامل تلقائياً.

## DoD
تسجيل عيادة موثقة→أضافت منتجاً بمخزون→تصفح مشتري→شراء اختباري sandbox→خصم/حجز سليم→شحنة→تسليم→فاتورة→عمولة→مستحق عيادة→تسوية→قيود متوازنة، وكل حالة لها tests وpermissions.


<!-- END 04_CLINIC_MARKETPLACE.md -->


---

<!-- BEGIN 05_ACCOUNTING_ERP.md -->

# 05 — نظام المحاسبة الكامل: دفتر الأستاذ، الفواتير، المخزون، التسويات

> **نطاق مطلوب وليس «ملخص إيرادات»**. البرنامج المحاسبي يبدأ كمصدر حقيقة مالي authoritative ledger للمنصة وكل عيادة (دفاتر منفصلة)، ويستوعب مبيعات الخدمات والمنتجات والعمولات وحجوزات النقل والتبرعات والاشتراكات والرواتب/مستحقات الأطباء والموردين وإدارة النقد والبنك. يلزم تحديد محاسب قانوني محلي للسياسات الضريبية والامتثال قبل الإطلاق الحقيقي.

## 0. مبادئ حاكمة
1. Double-entry GL: كل قيد POSTED متوازن مدين/دائن على مستوى عملة وكيان دفتر، وغير قابل للتعديل/الحذف؛ التصحيح بتسوية أو Reversing Entry مرجعي.
2. `entity_ledger` لكل كيان مالي: PLATFORM، CLINIC (وقد تتفرع cost centers / branches)، RESTRICTED_DONATION_FUND. لا تخلط ذمم العيادات في إيرادات المنصة.
3. money represented in integer minor units (وحدات أصغر حسب currency exponent) أو exact decimal بpolicy، NEVER IEEE float. سياق Iraq/IQD مبدئي قابل للتهيئة، التقريب والتحويل والفروقات منصوص عليها.
4. transaction + outbox + idempotency for every posting event؛ لا تنشر Invoice/Payment/Payout فقط بسبب API retry. Mutable draft / immutable posted + approvals.
5. منع حذف المعاملات المالية، ومعرفة user/actor, reason, timestamp, correlation_id, evidence, approval.
6. Financial effective dates, periods, lock periods, adjustment windows, backups, signatures, sequential numbers safe under concurrency.

## 1. وحدات المنصة المالية
- **Chart of Accounts**: دليل حسابات هرمي configurable مع نموذج افتراضي `Assets 1xxx, Liabilities 2xxx, Equity 3xxx, Revenue 4xxx, Expenses 5xxx, Contra accounts`, لكل دفتر ومراكز تكلفة.
- **General Ledger**: قيد يومية draft→approved→posted, lines, source, attachments, reversals, accruals/deferrals; Journal, GL Inquiry, trial balance.
- **Accounts Receivable (AR)**: فواتير مبيعات العملاء، مستحقات مواعيد/متاجر، أرصدة العملاء، قبض جزئي، credit notes، aging؛ لا تخلط Gross Checkout مع إيراد مكتسب.
- **Accounts Payable (AP)**: موردون وPO وفواتير ومستحقات، دفعات جزئية، شروط السداد، كشوف أعمار الديون.
- **Cash & Banks**: صندوق/خزينة لكل فرع إن لزم، سند قبض/صرف، إيداع/سحب، petty cash، حسابات بنكية، ملف كشف بنكي وتطابق bank reconciliation والعمليات المعلقة.
- **Sales & Billing**: إصدار فاتورة/إيصال/فاتورة خدمات/مردود/إشعار دائن، تسلسل فواتير، هوية المنشأة المصدرة، ضريبة قابلة للتهيئة حسب قرار قانوني.
- **Payments**: intents/authorizations/captures/refunds/chargebacks, webhook signatures, reconciliation, COD confirmation, merchant settlement with external PSP adapter.
- **Clinic Settlements**: مستحقات كل عيادة (صافي بعد عمولات/استرجاعات/رسوم/خصومات)، دورة حساب، كشف تسوية، اعتماد مزدوج، batch payouts، تتبع الفشل وإعادة المحاولة بلا صرف مزدوج.
- **Doctor Compensation**: doctor pay schemes per clinic: fixed, per-visit, percentage, hybrid, holdbacks. Accrual عند اكتمال حقيقي/تحقق، صلاحيات الموافقات، خصومات/تعديلات، statement وpayout/reconciliation. لا تفترض تلقائياً أن أجر الطبيب يُدفع من المنصة لا من العيادة.
- **Driver Wallet / Payout**: earnings per completed eligible ride, fees, tips (إن سمح), adjustments/refunds, liability, payout approvals; wallet display مشتق من ledger وليس قابل للتعديل.
- **Inventory Costing**: cost layers / weighted-average أو FIFO بحسب قرار ADR، stock valuation, GRN, COGS, shrinkage, wastage/expiry, returns; موازنة مع سجل الحركات.
- **Subscriptions/Care Plans**: billing cycles, renewals, prepaid/deferred revenue and revenue recognition; entitlement reconciliation.
- **Donations/Restricted Funds**: distinguish collected funds held for beneficiary from platform earned fees; campaign sub-ledgers, verification, disbursement approvals, beneficiary evidence, refund and transparent report. No counters inflated by a logged-in user.
- **Expense / Budget / Cost Centers**: recurring expenses, departments, purchase approvals, monthly budget versus actual, expense categories, receipts, allocation by clinic/platform.
- **Tax/Compliance Configuration**: tax categories, exemptions, fiscal periods, invoice fields, configurable withholding if lawful. Do not hardcode a tax rate or assert regulatory compliance.
- **Period Close**: month-end/year-end, reconciliation checklist, trial balance, adjust entries, lock period, rollover, audit export, reopening by highly controlled privilege.

## 2. محاسبة العيادة داخل Dashboard العيادة
داخل تبويب `المالية والمحاسبة` تظهر (بصلاحيات): ملخص إيرادات حقيقي، دفتر المبيعات، الفواتير الصادرة، إيصالات التحصيل، مشتريات الموردين والذمم الدائنة، خزينة/بنوك، مخزون وقيمته، أرباح وأتعاب الأطباء، مصروفات، كشوف تسويات المنصة، دليل حسابات العيادة أو mapping managed، قيود يدوية بحسب صلاحية، التقارير. الموظف/الطبيب لا يرى أرقام منشآت أخرى.

## 3. محاسبة الإدارة المركزية
لوحة محاسبة المنصة: إيراد عمولات التجارة/حجوزات العيادات/النقل والرسوم المسموح بها، مبيعات الاشتراكات، التزامات العيادات/السائقين، مبالغ قيد التسوية، أموال التبرعات المقيدة منفصلة، المصروفات، بنوك/نقد، الموازنات، تجزئة revenue by domain، trial balance، ميزانية عمومية، الأرباح والخسائر، التدفقات النقدية، aging، تقارير حملات، حركات مراجعة ومخالفات.

## 4. أدوار مالية وفصل المهام
- Clerk/Finance maker: إدخال Draft فقط.
- Reviewer/Approver: اعتماد القيد والفاتورة/دفعة عند توافر إثبات.
- Treasury executor: تنفيذ payout بعد موافقة.
- Auditor: قراءة وتصدير سجل غير قابل للتعديل، لا اعتماد.
- Admin general: لا يتمتع تلقائياً بكل أذونات الصرف النهائي؛ التخصيص واضح وفصل dual control للمبالغ العالية.
- عتبات اعتماد configurable لكل عملة وكيان؛ لا يسمح لنفس الشخص بإعداد وصرف وتسوية دفعة عالية دون مراجعة.

## 5. التقارير الأساسية (كلها تصدر من ledger / materialized views مؤكدة)
Trial Balance; General Ledger; Journal; Balance Sheet; Profit & Loss; Cash Flow وفق السياسة؛ AR/AP Aging; Sales by clinic/branch/product/service; Gross vs Net; Contribution/Commission; Stock Valuation + Reconciliation; Doctor Payable; Driver Payable; Clinic Settlement Statement; Bank Reconciliation; Donation Fund Movement; Refund & Chargeback Analysis; Cashier Shift Closure; Budget vs Actual; Period Close Checklist. Export CSV/PDF مع صلاحيات وaudit.

## 6. النموذج البياني الأساسي
`ledger_entities`, `chart_of_accounts`, `accounting_periods`, `journals`, `journal_lines`, `journal_reversals`, `account_balances` (derived snapshots), `financial_events`, `financial_documents`, `invoices`, `invoice_lines`, `credit_notes`, `cash_receipts`, `payments`, `payment_attempts`, `payment_webhook_events`, `refunds`, `chargebacks`, `payout_batches`, `payout_items`, `settlements`, `settlement_lines`, `bank_accounts`, `bank_transactions`, `bank_reconciliations`, `vendors`, `purchase_orders`, `goods_receipts`, `vendor_bills`, `stock_movements`, `inventory_valuations`, `expense_claims`, `cost_centers`, `approvals`, `audit_events`, `tax_profiles`, `donation_funds`, `donation_disbursements`, `subscription_billing`.

Tables are illustrative and may be consolidated with justification; immutable journals, document references, legal entity separation and idempotency are non-negotiable.

## 7. Posting & reconciliation pipeline
Business action completed → canonical domain event written atomically to outbox → verified processor constructs accounting instruction → idempotency fingerprint by `(ledger_entity, event_type, event_id, posting_type)` → DB transaction validates amounts and accounting period and writes balanced journal → notification/read model update. Failed event retries are bounded + dead letter queue + operator dashboard. Any payout requires beneficiary identity/verification, available-to-settle balance, maker-checker, provider response and bank match.

## 8. Non-negotiable acceptance gates
- `SUM(debit) == SUM(credit)` for every posted entry by ledger entity and currency; fractional rounding handled explicitly.
- Payment webhook delivered 3 times → one payment settlement effect and one posting set.
- Debit/cancellation in same race does not create negative payable or double-refund.
- Month closed → cannot backdate normal posted transactions into period; authorized adjustment strategy only.
- Clinic A accountant cannot query Clinic B journal, vendor, inventory valuation or payouts.
- Driver cannot manipulate wallet by client data.
- Reversal preserves original immutable entry with links and reason.
- Funds held for beneficiary are not recognized as unrestricted platform revenue.
- Bank payouts + ledgers reconcile down to exact minor units with explained fees/differences.
- All reports are reproducible for given as-of and accounting period; audit export logs who exported it.

## 9. Illustrative accounting examples and exceptional flows
See `21_FINANCIAL_EXAMPLES.md`; implement invariant-based tests for happy path + refunds/partial payment/commission reversals/chargebacks/COD/donations/late settlements, not only UI.


<!-- END 05_ACCOUNTING_ERP.md -->


---

<!-- BEGIN 06_SOCIAL_MEDIA.md -->

# 06 — Petra Social: مجتمع متكامل قابل للنمو

## الوظائف الأساسية
- حساب اجتماعي مربوط بحساب Petra، صورة وغلاف واسم ومعرف unique، خصوصية عام/خاص، ملفات منشورات وحيوانات مختارة، متابعة/طلب متابعة، كتم/حظر/إخفاء، حذف/تعطيل حساب، البحث.
- Feed: نص وصورة وألبوم وفيديو، mentions/hashtags، تفاعل إعجاب/حفظ وتعليق/رد ومشاركة، تعديل منشور مع history محدود، report/delete، صفحات شخصية للأطباء والعيادات ضمن الأدوار القائمة.
- Reels: vertical stream 9:16، upload مع quotas ونوع/حجم مسموح، virus/media validation، encode متعدد الجودة، thumbnails, adaptive playback via CDN، prefetch محدود، captions، أزرار تفاعل، moderation، privacy وحقوق موسيقى/الملكية.
- Stories: صور وفيديو عمودي، مدة عرض محددة بتكوين، مؤشرات viewed، رد/رسالة، privacy، حظر، expiry cleanup، highlights إن كانت معتمدة، حالات رفض/حذف وstorage lifecycle.
- Direct: 1:1 أولاً، غرف، رسائل نص ومرفقات/صوت حسب سياسة، read receipts/typing/presence اختياري، block enforcement، soft delete، pagination، إشعارات، abuse report، الاحتفاظ والحذف.
- Explore: فئات حيوانات/عيادات/نصائح/تبني، بحث آمن ومصفى، ranking v1 chronological+basic relevance، عدم استخدام خوارزمية «ملايين» منذ البداية.
- Social Commerce: عيادة يمكن أن تنشر منتجاً/خدمة من متجرها مع CTA إلى checkout موثوق؛ الطبيب يعرض ملفه وحجزه من رابط داخلي، لا إدخال بيانات دفع في الدايركت.

## الحدود الهندسية
`SocialProfile`,`Post`,`PostMedia`,`Comment`,`Reaction`,`Follow`,`Block`,`Report`,`ModerationCase`,`Story`,`StoryView`,`Reel`,`MediaAsset`,`Conversation`,`Participant`,`Message`,`MessageReceipt`,`NotificationPreference`; Graph-based feed لاحقاً فقط بعد قياس.
- Object storage + processing worker + transcoding provider, signed URLs where private; upload intent signed and validated server-side; quarantine before publishing suspicious media.
- WebSocket/realtime gateway for chat with last-seen synchronization؛ وصول replay من DB بعد reconnect؛ long polling fallback عند القيود.
- Spam/rate limits على التعليقات والمتابعات والدايركت، account age limits، review queue، حذف بيانات وصور برابط صالح/TTL.

## الشاشات / Animated UX
`Social Home` feed image cards with restrained stagger؛ `Reels Viewer` swipe/scroll snap, skeleton first frame، `Create Studio` stepper with upload progress، `Stories` progress and tap/hold، `Profile` animated segmented tabs، `Explore` search transitions، `Inbox` threads، `Chat` realtime bubble streaming فقط إن كان صحيحاً، `Notifications` grouped.

## اختبارات جوهرية
- حظر A لـB يمنع الرسائل والوصول حسب إعدادات الخصوصية حتى عبر direct URL/API.
- منشور private لا يظهر في نتائج بحث عامة أو عند تخمين media URL.
- Story expired لا تُعرض من CDN إذا كانت خاصة وأُلغي وصولها.
- duplicate media worker message لا ينشئ Reel ثانٍ ولا فواتير معالجة غير متوقعة.
- تنقل الريلز على شبكة بطيئة يعمل مع fallback وretry دون استنزاف تام للجهاز.
- أزرار إعجاب/تعليق/حفظ/متابعة تحدث تغييراً حقيقياً ومحكوماً server-side.


<!-- END 06_SOCIAL_MEDIA.md -->


---

<!-- BEGIN 07_RESCUE_ADOPTION_DONATIONS.md -->

# 07 — التبني والإنقاذ والطوارئ والتبرعات

## التبني
- listing: جهة معلنة / فرد ضمن سياسة؛ بيانات حيوان وصور وظروف واحتياجات وموقع تقريبي، حالة verified/pending/active/paused/adopted/removed، شروط التبني.
- application workflow: استمارة متقدم، فحص ملاءمة، موافقات، مقابلة/زيارة إن لزم، قرار قبول/رفض مسبب لا يفضح المعلومات الحساسة، محضر تسليم، إغلاق الإعلان وتحديث حالة الحيوان.
- يمكن للمدير/فريق الإنقاذ المصرح فقط الاطلاع على البيانات الخاصة بالطلبات؛ الأسماء والعناوين المخفية من القوائم العامة.
- منع إعلان حيوان واحد كمتاح بعد تسليمه، وتتبع history & complaints.

## SOS / الإنقاذ
- `rescue_case`: بلاغ، صور/فيديو، موقع اختياري محدود الوصول، نوع خطر، حالة، جهة معالجة مصرح بها، assignment، time stamps، evidence، outcomes.
- حالات: submitted→triaged→verified→assigned→in_progress→resolved / rejected / duplicate / cancelled. لا يُعلن «تم إرسال فريق» قبل قبول جهة فعلياً.
- قوائم جهات إنقاذ معتمدة ونطاق خدمتهم؛ الإشعار عند توفر متطوعين مرخصين حسب السياسة؛ SLA واقعي وقابل للضبط وليس وعداً بطوارئ طبية مضمونة.
- خريطة بلاغات عامة تخفي إحداثيات البيوت/البيانات الحساسة.

## مفقودات ومعثورات
- Lost/Found animal alerts، مطابقة يدوية/مساعدة خوارزمية غير قطعية، نافذة تواصل وسيطة، توثيق استلام، إغلاق.

## التبرعات — تدقيق مالي إلزامي
- campaign creation only by approved beneficiary/authorized admin، docs/verification، الهدف/الغرض، محتوى، موعد وصلاحية، سقف، رسوم معلنة، إفصاح عن المستفيد والوضع القانوني.
- donator selects amount → donation intent → provider payment → signed and idempotent webhook → successful collection → restricted funds posting → campaign confirmed counter derived from settled transactions → payout request → dual approval → bank transaction reconciliation → public progress/status per policy.
- refund/chargeback/reversal must update fund liabilities, fee and campaign confirmed metrics; `failed`, `pending`, `refunded` not counted as funds raised.
- beneficiary payout evidence, receipts to donor, report campaign spend with privacy protections, donor anonymity preference.
- **BLOCKER**: activation of real donations requires country-specific legal/charitable/payment provider decision. Build sandbox by default, conspicuously labeled.

## اختبار السيناريوهات الحرجة
- مستخدم عادي لا يرفع الرصيد المجموع للحملة عبر API.
- إعادة Webhook لنفس الدفع لا تزيد المبلغ مرّتين.
- متبرع مجهول لا تظهر هويته في public feed.
- رفض/إغلاق الحملة يمنع جمع تبرعات جديدة، لكن لا يحذف دفاتر الأموال القديمة.
- لا يمكن نشر مكان حيوان مصاب بشكل يعرّضه أو صاحب البلاغ لخطر بدون صلاحية.


<!-- END 07_RESCUE_ADOPTION_DONATIONS.md -->


---

<!-- BEGIN 08_TAXI_AND_SERVICES.md -->

# 08 — تاكسي الحيوانات والفندق والتجميل

## Pet Taxi
- driver application: بيانات هويات ومستمسكات مؤهلة/مركبة، تاريخ صلاحية، تحقق إداري، سياسة نقل الحيوان، حظر وسجل سلامة؛ validate النوع/الأعداد والقفص/الحزام والمتطلبات.
- إنشاء رحلة: origin/destination، حيوان/عدة حيوانات، نوع النقل، راكب مصاحب إن سمح، زمن فوري/مجدول، ملاحظات، تسعير estimate واضح، وسيلة دفع، قبول سياسة.
- state machine: requested→priced→accepted→driver_en_route→arrived→in_transit→completed; cancelled_by_customer/driver/admin, failed, disputed. Prevent invalid transitions/replay.
- dispatch service: matching مؤهل حسب المنطقة/النوع/التوفر، atomic claim يمنع قبول سائقين للرحلة نفسها، timeout/reassign، notification queue.
- live tracking: مشاركة الموقع أثناء رحلة نشطة فقط وبإذن، تقليل الدقة عند الحاجة، حذف/إخفاء بعد مدة، منع الاطلاع العام، fallback عند فقد GPS.
- المحاسبة: rider payment/cash collection, gross fare, discounts, platform fee, driver payable, payouts, refunds/cancellations, optional tips، COD reconciliation؛ لا يعد أي رصيد في واجهة السائق مصدر الحقيقة.
- safety: cancel/emergency contact/report incident, pet-specific travel warnings (without claiming guaranteed safety), dispute workflows.

## Grooming
- service catalog linked to clinic/branch, package/duration/add-ons, eligibility by species/size, staff and room availability, booking, pricing, checkout, completion photos with consent, cancel/refund, review, invoice.

## Pet Hotel / Boarding
- units/rooms/kennels inventory, species/size restrictions, pet health/vaccine requirements reviewed by clinic, date range availability and conflict locks, check-in/out, optional add-ons, incident log, charges per night/day policy, deposits, refund and invoice.

## Home Visits / Other Care Services
- doctor/clinic service area, availability and dispatch, schedule and pricing, staff identity and appointment linking, consent and invoice. No independent provider persona by default.

## Tests
- Same driver cannot concurrently start incompatible rides; trip accepted once even concurrent clicks.
- Trip location never exposed after closing/revoking sharing.
- Boarding capacity cannot go below zero during concurrent bookings.
- Cancelled service fees and payouts settle exactly once and balance in ledger.


<!-- END 08_TAXI_AND_SERVICES.md -->


---

<!-- BEGIN 09_ARCHITECTURE.md -->

# 09 — المعمارية البرمجية التفصيلية

## التوجه
**Greenfield modular monolith** للنواة، workers منفصلة للوسائط والإشعارات والمهام الثقيلة، وتسمح حدود الوحدات بنقل خدمة مستقلة مع نمو الحمل. لا تبدأ بعشرات الخدمات أو Kubernetes بلا حاجة. كل قرار مهني موثق ADR ويوازن التكلفة وصيانة فريق صغير ونمو المنصة.

## Monorepo المقترح
```
petra/
  apps/
    web/           # Next.js public site + customer + doctor + clinic + admin + driver responsive shells
    api/           # NestJS REST API & application/domain modules
    mobile/        # React Native Expo mobile app when mobile phase begins
    workers/       # background jobs: notifications/media/payment reconciliation/reminders
  packages/
    ui/            # design system components, animation primitives, tokens
    contracts/     # DTOs, validation, typed shared interfaces, events (no secrets)
    config/        # shared lint/ts/env schemas
    testing/       # fixtures, harness, factories, contract tests
  infra/
    docker/        # local Compose infrastructure
    deployment/    # infrastructure templates & runbooks
  prisma-or-drizzle/
    schema/ migrations/ seeds/
  docs/            # ADR, diagrams, API, records, decision log
  legacy_reference/ # DO NOT COMPILE OR IMPORT
  AGENTS.md
```

## طبقات الخدمات
Client (Next.js/Expo) → API BFF (if needed) / NestJS HTTP → Application use cases → Domain invariants → Repository interfaces & DB adapter → PostgreSQL. Events from DB outbox → worker queues → integrations/media/realtime. All writes include actor, tenant/org, request ID, idempotency context when appropriate.

## الوحدات (Bounded Contexts)
- IdentityAuth: users, sessions, recovery, MFA, verification and devices.
- Organizations: clinics, branches, memberships, staff privileges, doctor affiliations.
- PetsCare: pets, consents, vaccine records, prescriptions, results, records and care plans.
- Scheduling: provider/resource availability, appointments, telehealth sessions.
- Commerce: catalogs, variants, inventory, PO, pricing, cart, orders, fulfillment, returns.
- Finance: accounting entities, journals, invoices, payments, settlement, payroll/earnings and restricted donations.
- Social: profiles, content, follows, interactions, reports and feed query.
- Messaging: conversations, participants, attachment permissions, read receipts.
- Media: assets, upload intents, validation, transcoding statuses, CDN.
- RescueAdoption: rescue cases, adoption applications, lost&found, approved rescue groups.
- Donations: campaign lifecycle, donors, payment intents, beneficiaries, disbursement orchestration (finance posts ledger).
- Transport: ride state and dispatch, driver credentials, transient location events.
- Hospitality: hotel/grooming bookings, capacity, payment.
- NotificationsLoyalty: reminders, templates, preferences, point transactions.
- Administration: moderation, approvals, CMS, reporting configuration, auditing, feature flags.

## قواعد الفصل
- كل Module يملك domain entities وخدماته وعملياته المنطقية؛ لا يستدعي كود بيانات وحدة أخرى مباشرة إلا عبر interface/domain event.
- transactional outbox داخل Postgres يضمن حفظ الحدث مع العملية الأصلية، مع مستهلك idempotent.
- جداول الكيانات المشتركة وقراءة التقارير تُستخدم views/projections، لا side effects من React.
- API validation Zod أو class-validator بحسب قرار ADR؛ error response consistent with code/requestId and localized safe message.
- API versions; cursor pagination للـ feeds والطلبات; optimistic concurrency version أو row locks عند الحاجة.
- media bucket منفصل مع signed URLs عند الخصوصية، quotas, scanning, transcoding workflow؛ إشعارات لا توقف الطلبات الأساسية.
- caching: keys include tenant/user authorization scopes; invalidation deterministic؛ لا تكاش بيانات طبية بذاكرة مشتركة دون تحكم.

## قرارات تقنية تبدأ بها (قابلة للتحسين المبرر)
- Next.js + React + TypeScript + Tailwind CSS + motion library suitable for React, RTL supported.
- NestJS API + PostgreSQL; ORM Prisma أو Drizzle حسب احتياج transactions/schema migrations مع ADR. PostgreSQL constraints at DB level where viable.
- Redis for BullMQ queues and approved cache/realtime coordination; object storage S3-compatible, CDN, managed media processing/encoder adapter; email/SMS/payment/map provider adapters.
- Auth: verified provider/standards, server-side session/access checks; admin MFA; never home-made token signing.
- Local dev: docker compose Postgres/Redis/compatible storage emulator; independent service credentials in untracked env; seeded demo test accounts.
- Tests: Vitest/Jest where applicable, Playwright E2E, contract tests, API integration with ephemeral DB, load tests with k6/Artillery when phase scheduled.

## Scalability roadmap
1. Initially database indexes/explain analyze, horizontal API replicas, CDN and queued media, basic search with PG; ensure p95 queries measured.
2. Read replicas/materialized reporting views after measurement; dedicated search engine only if queries demand it.
3. Separate media/realtime/social ranking/transport dispatch services by pressure and independent availability needs, preserving stable contracts and eventual consistency with reconciliation.
4. Multi-region only once business requirements/privacy budgets justify its consistency and legal complexities. Large user count doesn't alone mandate microservices.

## Important failure modes
- DB transaction committed but event queue fails: outbox worker retries.
- Payment webhook delayed: order remains awaiting authoritative confirmation; UI displays pending without optimistic finalization.
- Failed media processing: preview shows processing/retry, never broken 'published' state.
- Realtime offline: fetch from durable DB on reconnect.
- High traffic: back-pressure, rate limiting and graceful degradation for recommendation-heavy feeds, never for financial integrity.

## Diagrams
```
Web / Mobile
   |
API Gateway / NestJS Modular Core
  |    |      |      |
 Auth Care Commerce Finance ... Social/Taxi
  |         Postgres + Outbox
  |                |
  |           Redis Queues --------> Workers --> PSP/Media/SMS/Maps adapters
  |                                  |
  +---- Realtime Gateway -----------+ --> CDN/Object Storage
```

## Deployment runbook minimum
Environment config and secret manager, DB migration ordering (expand/contract), backup/restore drill, health checks, structured logs, alerts, deployment rollback, release flags, disaster recovery exercise, traffic test baseline.


<!-- END 09_ARCHITECTURE.md -->


---

<!-- BEGIN 10_DATABASE_AND_EVENTS.md -->

# 10 — نموذج بيانات المنصة والأحداث

## مبادئ قاعدة البيانات
PostgreSQL relation-first مع migrations تاريخية وقابلة للإعادة في بيئة نظيفة. جميع جداول بيانات المؤسسات الحساسة لها `organization_id`/`clinic_id` حسب الملكية، وتحقق خادم/DB من العلاقات. مفاتيح UUID أو ULID حسب ADR، timestamps UTC، `created_by`, `updated_by`, `row_version`, soft-delete عند الحاجة مع retention. استخدام `CHECK`, `UNIQUE`, FKs, exclusion constraint / locks لمنع الحجز المكرر، الفهارس والبحث المدروس.

## تجميع الجداول (مقترح لا يُنفذ حرفياً دون design review)

| المجال | نماذج/جداول الحد الأدنى | القيود المحورية |
|---|---|---|
| الهوية | users, profiles, sessions, verification_requests, permissions, grants | لا امتيازات من self-signup |
| المنظمة | clinics, clinic_branches, memberships, doctor_profiles, doctor_affiliations | membership-scoped access |
| الرعاية | pets, pet_guardians, consents, encounters, diagnoses, vaccinations, care_tasks, prescriptions, prescription_items, lab_orders, lab_results, medical_attachments | تعلق بالسجل والنسخ والأذونات |
| الحجوزات | service_catalog, provider_schedules, schedule_exceptions, appointment_slots, appointments, resources | no double booking |
| التجارة | clinic_storefronts, categories, products, variants, price_lists, warehouses, inventory_movements, reservations, suppliers, purchase_orders, goods_receipts, carts, checkout_sessions, orders, clinic_orders, order_items, deliveries, returns | EVERY storefront has clinic_id |
| المحاسبة | ledger_entities, chart_of_accounts, accounting_periods, journal_entries, journal_lines, approvals, invoices, credit_notes, receipts, payment_intents, transactions, provider_events, clinic_settlements, payouts, bank_reconciliation, vendor_bills, cost_centers, donation_funds | balanced immutable ledger, idempotency |
| Petra Social | social_profiles, posts, attachments, comments, reactions, follow_edges, story_assets, stories, story_views, reels, conversations, participants, messages, message_receipts, moderation_cases, blocks | query-level privacy |
| الإنقاذ | adoption_listings, adoption_applications, rescue_cases, rescue_case_updates, lost_found_alerts, rescue_orgs | verified assignment and PII privacy |
| التبرعات | beneficiaries, campaigns, donation_intents, donations, donation_disbursements, fundraising_reports | verified provider funds only |
| التاكسي | driver_profiles, vehicles, driver_documents, ride_requests, ride_assignments, ride_events, location_points (short TTL), driver_statements | atomic driver assignment |
| خدمات إضافية | grooming_services, grooming_bookings, boarding_units, boarding_bookings, care_subscriptions, plan_entitlements, entitlements_usage | capacity and entitlement locks |
| التشغيل | notifications, outbox_messages, inbox_consumed_events, audit_logs, support_tickets, feature_flags, cms_pages, site_banners, event_metrics | read/write scopes |

## تفاصيل ضرورية
- `users` separate from clinic membership; doctor professional profile per user, can join multiple clinics with scoped access.
- `clinic_storefronts.clinic_id NOT NULL`; unique external slugs scoped, active toggles. No store owner column modeled as separate persona.
- `products` can belong to storefront + clinic, variants SKUs unique within tenant/domain; `inventory_movements` immutable posted with reservation/state.
- `appointments` unique/exclusion on doctor/resource/time span where conflicts; manager can reschedule only via validated workflow.
- `social content` privacy at read query and media delivery, not only frontend condition.
- `journal_entries` headers with ledger_entity, accounting_date, status, source_type/source_id, reverses_journal_id, hash/version; `journal_lines` balanced at posting validation in one transaction; locking during closure and posting.
- `payment_provider_events`: provider_event_id unique + signature_verified + processed_at; `outbox` unique event identifier; `inbox` processing idempotence.

## Event vocabulary / names (public domain events)
`UserRegistered`, `ClinicVerificationApproved`, `DoctorAffiliationApproved`, `PetCreated`, `CareReminderDue`, `AppointmentBooked`, `AppointmentCompleted`, `ClinicProductPublished`, `InventoryReserved`, `OrderPlaced`, `PaymentCaptured`, `OrderDelivered`, `OrderRefunded`, `InvoiceIssued`, `CommissionAccrued`, `ClinicSettlementApproved`, `PayoutSucceeded`, `DonationConfirmed`, `DonationDisbursed`, `RideAccepted`, `RideCompleted`, `StoryExpired`, `ReelTranscoded`, `ReportSubmitted`.

Each event has `event_id`, `occurred_at`, `aggregate_id/type`, `aggregate_version`, `actor_context`, minimal payload (do not put secrets/medical information on public event bus). Define producer/consumer, retries and idempotency explicitly in docs/events/.

## Example: one completed order flow
```
API placeOrder(idempotencyKey)
  -> within DB transaction verify clinic/product/price/stock
  -> create parent order + clinic suborders + immutable price snapshots
  -> reserve stock + outbox(OrderPlaced)
Worker/payment adapter -> authorized payment provider captures
Webhook verified -> transaction mark captured + outbox(PaymentCaptured)
Ledger processor -> balanced journals; retry deduped
Order fulfillment -> delivery confirmation -> settlements eligible
Settlement maker+checker -> payout -> bank reconciliation
```

## Migration and seed guidelines
- No old migrations copied from `legacy_reference` into production migration directory.
- Use local fake fixtures and deterministic seed, never migrate real users or payments from ZIP.
- SQL migration smoke test: create empty DB, migrate up, seed, rollback strategy for code (usually forward migrations), constrained schema assertions, concurrent transaction tests.


<!-- END 10_DATABASE_AND_EVENTS.md -->


---

<!-- BEGIN 11_SECURITY_AND_PRIVACY.md -->

# 11 — الأمن والخصوصية وحماية بيانات Petra

## threat model الأولي
Assets: identity, clinic memberships, sensitive veterinary records, donor identity, payment records, chat/social UGC, live trip location, child-related data if any, financial journals, signed files. Threats: broken object authorization / role escalation, marketplace price tampering, tampered donation counters, duplicate webhooks, media malware, account takeover, abuse/spam, PII leakage, internal fraud, cross-tenant cache leakage.

## متطلبات إلزامية
- Use proven auth provider/protocol, MFA for admin and financial approvers, secure cookies/sessions with CSRF protections as applicable, device/session revocation, re-auth for sensitive operations, account recovery anti-enumeration.
- RBAC + ABAC: persona roles and clinic membership scope; API cannot accept client-supplied `role=admin`, ownership or clinic_id without independent authorization; privilege grants via controlled audited admin workflow.
- Tenant isolation + object authorization for every read/write; separate DB policies if relevant (RLS if Supabase retained as infra—not required); never rely on UI condition or client JWT claimed role alone.
- Encrypt data in transit/rest by provider and use controlled storage buckets for medical attachments, driver documents, private chats and invoice evidence; short-lived signed object access; retention and secure erasure policies.
- Upload filters: MIME/content signature check, file size, antivirus/scan where supported, sandbox transcode, thumbnail safety, content moderation workflow; no executable files served as trusted app content.
- Privacy-by-design: social public/private, block lists, consent to sharing medical data, no display of exact rescue/ride home locations publicly, donor anonymity, medical access logs.
- Payout/refund/donation: signed provider webhooks, idempotency and replay defense, maker-checker and AML/KYC/merchant legal gates where required, immutable audit trail.
- CMS content/XSS protection; parameterized SQL, output encoding, CSP where practical, CORS allowlist, per-IP/user rate limiting, anti-CSRF.
- Secrets: environment validation, rotation, secret manager, separate sandbox/prod, CI secret scanning, non-production test data.
- Logging: correlation IDs and structured redaction, no passwords/tokens/patient notes in telemetry, admin and finance access audit events, alerts for anomalous payouts/logins/permission edits.
- Retention and data rights: access/export/delete requests with legal hold, backups, active session invalidation, contracted providers, public privacy policy and terms.

## 5x5 authorization test pack
Cross-tenant attacks: doctor A vs unrelated pet; clinic A vs clinic B inventory/finances; customer editing clinic catalog; driver viewing private medical notes; content moderator querying payments; general admin viewing full medical history without explicit policy; public visitor obtaining private story media; taxi driver querying old live location. All must be 403/404 as appropriate with no data leakage.

## Critical release blockers
P0: privileged self-registration, missing authorization on medical or money endpoints, unsigned webhooks, donations altered by generic user, unbalanced journals, unencrypted sensitive access, shared production secrets, unreviewed provider payment or financial compliance. Launch cannot proceed until verified closed and independently reviewed.


<!-- END 11_SECURITY_AND_PRIVACY.md -->


---

<!-- BEGIN 12_DESIGN_MOTION_SYSTEM.md -->

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


<!-- END 12_DESIGN_MOTION_SYSTEM.md -->


---

<!-- BEGIN 13_SCREEN_AND_ROUTE_MAP.md -->

# 13 — شجرة صفحات الويب وشاشات التطبيق

> أسماء routes مقترحة، تُراجع مع team قبل final routing. البيانات عبر API server وauthenticated role check. لا route منفصل لـ store owner.

## Public
`/`, `/about`, `/care`, `/clinics`, `/clinics/:slug`, `/doctors`, `/doctors/:slug`, `/services`, `/marketplace`, `/marketplace/products/:slug`, `/marketplace/clinics/:slug`, `/social/explore` (public-safe), `/adoption`, `/adoption/:id`, `/rescue`, `/lost-found`, `/donations` (only legal-enabled), `/donations/:id`, `/pet-taxi`, `/faq`, `/support`, `/contact`, `/terms`, `/privacy`, `/login`, `/register`, `/recover`, `/verify`, `/not-found`.

## Customer `/app`
`/app/home`, `/app/pets`, `/app/pets/new`, `/app/pets/:id`, `/app/pets/:id/care`, `/app/pets/:id/vaccines`, `/app/pets/:id/passport`, `/app/pets/:id/records`, `/app/pets/:id/labs`, `/app/pets/:id/prescriptions`, `/app/care/calendar`, `/app/care/plans`, `/app/appointments`, `/app/appointments/new`, `/app/appointments/:id`, `/app/consultations`, `/app/marketplace/cart`, `/app/checkout`, `/app/orders`, `/app/orders/:id`, `/app/wishlist`, `/app/social`, `/app/social/reels`, `/app/social/stories`, `/app/social/profile/:handle`, `/app/messages`, `/app/messages/:id`, `/app/adoptions`, `/app/adoptions/applications`, `/app/rescue`, `/app/lost-found`, `/app/donations`, `/app/taxi`, `/app/taxi/rides`, `/app/hotel`, `/app/grooming`, `/app/loyalty`, `/app/notifications`, `/app/settings`, `/app/support`.

## Doctor `/doctor`
`/doctor/home`, `/doctor/onboarding`, `/doctor/profile`, `/doctor/affiliations`, `/doctor/schedule`, `/doctor/appointments`, `/doctor/appointments/:id`, `/doctor/patients`, `/doctor/patients/:petId/encounters`, `/doctor/prescriptions`, `/doctor/labs`, `/doctor/consultations`, `/doctor/earnings`, `/doctor/social`, `/doctor/notifications`, `/doctor/settings`.

## Clinic `/clinic/:clinicId`
`/home`, `/profile`, `/branches`, `/staff`, `/doctors`, `/schedule`, `/appointments`, `/appointments/:id`, `/patients` (with authorization), `/services`, `/care-plans`, `/labs`, `/grooming`, `/hotel`, `/reviews`, `/social`, `/messages`, `/rescue`, `/taxi-request`, `/commerce` (overview), `/commerce/catalog`, `/commerce/products/new`, `/commerce/products/:id/edit`, `/commerce/services`, `/commerce/categories`, `/commerce/inventory`, `/commerce/warehouses`, `/commerce/suppliers`, `/commerce/purchases`, `/commerce/orders`, `/commerce/orders/:id`, `/commerce/returns`, `/commerce/promotions`, `/commerce/storefront-settings`, `/finance`, `/finance/invoices`, `/finance/receipts`, `/finance/payables`, `/finance/expenses`, `/finance/journals`, `/finance/cash-and-banks`, `/finance/settlements`, `/finance/reports`, `/finance/accounting-periods`, `/settings`, `/staff-permissions`.

## Driver `/driver`
`/driver/onboarding`, `/driver/home`, `/driver/availability`, `/driver/requests`, `/driver/rides`, `/driver/rides/:id`, `/driver/map`, `/driver/vehicle`, `/driver/documents`, `/driver/earnings`, `/driver/payouts`, `/driver/incidents`, `/driver/support`, `/driver/settings`.

## Admin `/admin`
`/admin/home`, `/admin/accounts`, `/admin/clinics`, `/admin/clinics/:id`, `/admin/doctors`, `/admin/drivers`, `/admin/verification`, `/admin/content`, `/admin/reports`, `/admin/moderation`, `/admin/marketplace`, `/admin/orders`, `/admin/appointments`, `/admin/pet-registry` (restricted access), `/admin/rescue`, `/admin/adoption`, `/admin/donations`, `/admin/taxi`, `/admin/financial` (overview), `/admin/financial/ledger`, `/admin/financial/chart-of-accounts`, `/admin/financial/journals`, `/admin/financial/ar`, `/admin/financial/ap`, `/admin/financial/settlements`, `/admin/financial/banks`, `/admin/financial/donations`, `/admin/financial/period-close`, `/admin/financial/reports`, `/admin/cms`, `/admin/notifications`, `/admin/settings`, `/admin/security-audit`.

## Surface matrix
- Public + customer: visually rich interactive, conversion and clarity.
- Doctor/clinic: high information density with clear motions and keyboard workflows.
- Driver: mobile-first large touch targets and offline-safe statuses.
- Admin/accounting: large monitors/tablet adapt, immutability cues, audit views, role-based disabled states with explanations.

## Routing test rule
Every route has: required scopes, tenant context, layout, error boundary, loading/empty/denied states, breadcrumb/active nav, functional API association; catalog routes should be SEO-friendly, authenticated routes noindex.


<!-- END 13_SCREEN_AND_ROUTE_MAP.md -->


---

<!-- BEGIN 14_API_CONTRACTS.md -->

# 14 — واجهات API ومواصفات الأحداث والعقود

## Conventions
- URL `/api/v1/...`, structured JSON error `{code, message, details?, requestId}`, standardized UTC timestamps, pagination cursor/page size caps, validation and permission checks server-side.
- Auth session/token standard secure flow; idempotency key mandatory for orders/payments/refunds/posting/settlements/driver accept; `If-Match`/row version for conflict-prone updates.
- Never expose medical/financial/private media raw URLs without authorization/expiry. All routes list `action`, `subject`, `scope` and rate limits.
- OpenAPI generated from code plus contract tests and client SDK, no undocumented breaking changes.

## Representative endpoints (names provisional)

### Identity / Organizations
- `POST /auth/register` ordinary customer only (no role=admin/clinic direct privilege)
- `POST /auth/login`, `/auth/logout`, `/auth/recover`, `/auth/mfa/challenge`, `/auth/mfa/verify`
- `GET /me`, `GET /me/workspaces`, `POST /me/active-workspace` (server verifies membership)
- `POST /clinic-applications`, `GET /clinics/:id/members`, `POST /clinics/:id/members/invitations`
- `POST /doctor-applications`, `POST /driver-applications`, `POST /admin/verifications/:id/decision`

### Care / Scheduling
- `GET/POST /pets`, `GET/PATCH /pets/:id`, `GET /pets/:id/medical-record`, `POST /pets/:id/consents`
- `GET/POST /pets/:id/care-tasks`, `GET/POST /pets/:id/vaccinations` (doctor-authorized write)
- `POST /appointments/holds`, `POST /appointments`, `POST /appointments/:id/reschedule`, `POST /appointments/:id/cancel`, `POST /appointments/:id/check-in` and `/complete`
- `POST /encounters/:id/prescriptions`, `POST /encounters/:id/labs`, `POST /encounters/:id/sign`, `POST /encounters/:id/addenda`
- `GET /care-plans`, `POST /care-plan-subscriptions`, `POST /care-plan-redemptions`.

### Clinic Commerce
- `GET /marketplace/products`, `GET /marketplace/products/:slug`, `GET /marketplace/clinics/:slug`
- `POST/PATCH /clinics/:id/products`, `GET /clinics/:id/inventory`, `POST /clinics/:id/stock-adjustments` (approval)
- `POST /clinics/:id/purchase-orders`, `POST /clinics/:id/goods-receipts`
- `POST /checkout/quote`, `POST /orders` + `Idempotency-Key`, `GET /orders/:id`, `POST /orders/:id/returns`, `/refund-requests`.

### Accounting
- `GET /clinics/:id/finance/overview`, `/invoices`, `/journal`, `/settlements`
- `POST /finance/journals/drafts`, `POST /finance/journals/:id/approve`, `/post`, `/reverse` (separation of duties)
- `POST /finance/invoices`, `POST /finance/receipts`, `POST /finance/payments/refunds`, `POST /finance/settlements/:id/approve`
- `GET /finance/reports/trial-balance`, `/profit-loss`, `/balance-sheet`, `/cash-flow`, `/ar-aging`, `/stock-valuation`
- `POST /integrations/payments/:provider/webhook` with raw payload and verified signature (no user login substitute).

### Social / Messaging
- `GET/POST /social/posts`, `POST /social/posts/:id/reactions`, `GET /social/feed`, `POST /social/follows`, `POST /social/blocks`
- `POST /media/upload-intents`, `POST /media/uploads/:id/complete`, `GET /media/:id/status`
- `GET/POST /social/stories`, `GET /social/reels`, `POST /social/reels`, `GET /messages/conversations`, `POST /messages/conversations/:id/messages`
- `POST /social/reports`, `POST /admin/moderation/:caseId/decision`.

### Rescue/Taxi/Donation
- `POST /adoption-listings`, `POST /adoption-listings/:id/applications`, `GET /adoption/applications/:id`
- `POST /rescue-cases`, `POST /rescue-cases/:id/assign`, `POST /rescue-cases/:id/status`
- `POST /donations/intents`, `GET /donation-campaigns`, `POST /donation-campaigns/:id/disbursements` restricted and regulated.
- `POST /taxi/quotes`, `POST /taxi/rides`, `POST /taxi/rides/:id/accept`, `POST /taxi/rides/:id/status`, `GET /taxi/rides/:id/live` authorized and TTL.

## SDK contracts
Typed DTOs and validation contracts in `packages/contracts`, exceptions translated into user-safe errors; require API integration tests to validate cross-tenant ID tampering, concurrent holds, payment retries. Never rely only on snapshot tests.

## Websocket topics
`messages.room.<conversationId>`, `rides.<rideId>`, `notifications.<userId>`, `appointments.<clinicId>` with gateway authorization on join/reconnect, events with sequence/cursor for replay, bounded messages and rate limits. Don't transmit medical record content on public topics.


<!-- END 14_API_CONTRACTS.md -->


---

<!-- BEGIN 15_INFRA_SCALING.md -->

# 15 — التشغيل السحابي والأداء والمراقبة والتوسع

## البيئات
- local: compose Postgres/Redis/object-storage emulator, local fake mail/media/PSP; deterministic seeds and e2e.
- staging: isolated managed resources, sandbox providers, anonymized fixtures, full security/protocol rehearsal, pre-production volume test.
- production: managed DB with PITR/backups, Redis queues, stateless containerized API, edge CDN/object storage, workers, secret manager, private networks, observability.

## CI/CD
PR gates: lint/types/unit/integration/contract, migration validity, security dependency scan, secret scan, build, component visual diff critical pages and performance quick baseline. Release: canary/blue-green as appropriate, environment checks, safe migrations, rollback plan and flags. Protect `main` and production deploy privileges.

## metrics/SLOs proposed for validation
- Error rate per route and domain, request latency p50/p95/p99, saturation (CPU/memory/DB connections), transaction processing latency, dead-letter queue, outbox lag, cron/reminder success, websocket reconnect, video transcode processing success/duration, cache hit rate, CDN transfer volume.
- Financial invariants: unbalanced journals (zero), orphan payments (zero or incident queue), unreconciled payouts by age, failed postings, unsettled donations, stock mismatch.
- Security: abuse reports, brute-force, permission denied anomaly, expired credentials, missing backups.

## Performance and cost discipline
- Set tested target workflows in staging. Example test profiles: regular browsing high reads, clinic inventory writes, concurrent appointment slot attempts, 1:1 chat bursts, media uploads+playback, payment webhook duplicates, financial report generation; capacity plan from measured profile and peak concurrency, not 1M user account count.
- Budget per service (DB, compute, media encoding, CDN egress, map/geocoding, SMS/notifications, PSP, monitoring); media and map bandwidth can dominate cost. Show monthly cost estimate ranges only when provider/region/capacity assumptions available.
- Cache only safe public/feed data with rigorous invalidation. Keep financial and medical integrity in primary database transaction paths.

## Recovery / runbooks
Backup frequency and retention as approved, PITR testing, restore rehearsals, app secrets rotation, incident severities and on-call routing, vendor outage fallback, degraded-mode banners, no simulated payments in prod, auth provider failure handling, media processing retry/review, provider settlement reconciliation, privacy/security incident response and communication.

## Security launch gates
External vulnerability review or qualified independent review, scoped penetration testing, consent and policy review, financial/legal signoff for payment/donation/insurance/clinical remote services, monitoring dashboards and alerts, rollback and backup restore proof.


<!-- END 15_INFRA_SCALING.md -->


---

<!-- BEGIN 16_IMPLEMENTATION_ROADMAP.md -->

# 16 — خطة التنفيذ المرحلية الفعلية | لا تبنِ الموقع بأمر واحد

> كل مرحلة تبدأ من بيانات المرحلة السابقة وتنتج كوداً يمكن تشغيله واختباره. التوقيت والميزانية يعتمد على الفريق، التكاملات، ومعايير الجودة؛ لا يعد Codex بزمن تسليم ثابت. ما يلي ترتيب وتبعيات، ليس مدة تنفيذ.

## Phase 00 — Discovery, foundation, product map
**Input** docs + legacy_reference; **Output** ADR-000, diagrams, requirements traceability, sitemap, workflow maps, data dictionary v1, monorepo and toolchain, local Docker services, env.example, format/lint/typecheck/build/test CI, README dev instructions.
- UI proof of concept: animated landing hero + design tokens + one customer shell + clinic finance layout using demonstrative placeholders clearly labeled design-only.
- Gate: repository bootstraps clean on fresh environment, no secrets, CI green, architecture + five dashboards and clinic commerce agreement documented.

## Phase 01 — Identity, authorization, organizations
**Build** sign-up/login/recovery/MFA admin, profile, clinics + branches + doctor affiliations, staff invitations, memberships, scoped permissions, user workspace switcher, admin verification pipeline, audited role grants.
- Gate: cross-role and cross-clinic tests; no self-register admin/store_owner, unauthorized requests rejected.

## Phase 02 — Pet profiles + Care Center foundations
**Build** pet CRUD, guardians/consents, medical access audit, vet directory, service catalog and availabilities, appointments + concurrency guard, visit records, vaccines/reminders/passport, prescriptions/lab workflow.
- Gate: full end-to-end owner→pet→booking→doctor→signed visit→reminder. Private data access denial tests.

## Phase 03 — Clinic dashboard & marketplace integration
**Build** clinic staff/branches/doctor schedule, services; clinic-owned storefront inside dashboard, product variants/catalog, inventory movement, PO/GRN/vendor, cart/checkout sandbox, multi-clinic orders and returns.
- Gate: clinic→product→customer order→stock reservation→delivery→return test; no store owner routes.

## Phase 04 — Accounting Core / Business transactions
**Build** chart of accounts, ledger entities, posted journal DB invariants, periods, approvals, invoices, receivables/payables, cash/banks, sale / COGS / commission posting and clinic settlement; clinic finance views and admin reports.
- Gate: all examples from `21_FINANCIAL_EXAMPLES.md`; duplicate events idempotent; trial balance and reconciliation correct. Payments remain sandbox until provider legal approval.
- NOTE: develop Finance event contract in Phase 00, scaffold actual ledger before any real transaction is processed. Never defer financial integrity until after real-money launch.

## Phase 05 — Care Plans, wellness + lodging/grooming
**Build** plans/entitlements, expiry, renewals, verified usage, deferred revenue, care content, medical consultation chat with authorized access, grooming/hotel rooms/booking and invoices.
- Gate: no double entitlement redemption, no overbook, continuity of care record, protected documents.

## Phase 06 — Social / Reels / Stories / Direct
**Build** social profile, posts, interactions/follows, privacy, moderation, async media, reels transcoding, story expiry, direct messaging/realtime with reconnect and blocked privacy, notifications.
- Gate: no privacy bypass; async worker retries; video performant; reduced motion; moderation admin functioning.

## Phase 07 — Adoption/Rescue/SOS/Lost & Found
**Build** adoption listings/applications, verified rescue ops, case handling, lost and found, safety/privacy policies, auditing/moderation. Begin donation campaigns in SANDBOX / legal-gated mode.
- Gate: secure private applicant data, rescue status transitions and campaign figures confirmed only by events.

## Phase 08 — Taxi and driver financial integration
**Build** driver verification and vehicle, quote, dispatch, atomic accept, live trip location with TTL, driver settlements, cancellation/dispute and operational dashboard.
- Gate: dispatch race test; current-only driver location; finance exactness and permissions.

## Phase 09 — Production hardening / compliance / launch
**Build/verify** CMS sections, analytics/retention policies, reporting, admin moderation/support, performance profiling, scalable CDN architecture, automated E2E/regression, accessibility, SEO, privacy policies, backup+restore, red team and payment certification/legal checks, localization audits and runbooks.
- Gate: no P0 findings, realistic load tests, independent security and finance review, operational signoff, controlled staged launch.

## Phase 10 — Mobile applications / Growth
Build Expo customer and driver native experiences (then doctor/clinic as priority demands) using same API, push notifications, background restrictions, offline safety, deep links, analytics and crash reporting. No hidden split-brain database logic; app store submission requires review and provisioning.

## Work package per phase
- Tasks <= 1–3 day developer sized units, clear dependencies, feature flags, schemas/migrations, API and UI vertical slices, tests, owner review and screenshots.
- Progress fields: `feature_id`, `phase`, `scope`, `owner`, `status`, `PR link`, `migration`, `tests`, `security review`, `UX review`, `acceptance evidence`.
- Codex agent work separation permitted only for independent modules. Ledger and auth architecture require integrated review; agents must not concurrently edit shared migrations or RBAC policies without coordination.


<!-- END 16_IMPLEMENTATION_ROADMAP.md -->


---

<!-- BEGIN 17_ACCEPTANCE_TESTS.md -->

# 17 — اختبارات القبول (Definition of Done) | تطبيق فعلي لا استعراض

## Global Release Gates
1. fresh clone → install → env.example→local services→migrate→seed→run web/api succeeds documented.
2. lint/typecheck/build/unit/integration/contract/E2E green with exact commands logged.
3. all endpoints validate inputs and authorize actor/tenant; critical data cannot be obtained by changing IDs.
4. five dashboards only; internal clinic commerce works with scoped staff roles.
5. all CRUD states persistent and reflected consistently across refresh/relogin, skeleton/empty/error/offline state defined.
6. production routes never use fake data/metrics, simulated payments or unapproved media assets.
7. RTL/accessibility/reduced-motion and mobile responsive UI tests; camera-less keyboard navigation.
8. DB backups/restore tested, zero P0 security, finance integration with reconciliation and maker-checker audit.

## AT-IDENTITY
- New customer account has no admin, doctor, clinic or store owner powers.
- Doctor verified for clinic A but not clinic B cannot access B patient/appointment.
- Doctor member of clinic A and B chooses each workspace with separate context; unauthorized switching denied.
- Admin MFA + audit logs; revoked session cannot perform privileged operation.

## AT-CARE
- Two concurrent users book one slot; exactly one succeeds.
- Owner consents to doctor access, revokes it; doctor access stops except separately justified record retention.
- Signed visit medical note has immutable original/addendum workflow.
- Vaccine due reminders update status and do not invent schedules.
- Subscription entitlement duplicate redemption produces one usage item.

## AT-COMMERCE
- Product belongs to clinic; clinic B cannot edit clinic A product or see finance.
- Clinic staff manage product and inventory **within clinic dashboard**. No sixth dashboard.
- Cart multiple clinics -> split orders and payments snapshot correct totals.
- Concurrent orders with stock 1 -> one reserved, no negative stock.
- Partial return -> correct stock movement, credit note, commission reversal and payout adjustment.

## AT-ACCOUNTING
- Posted journals balanced exactly; any imbalance rejected DB-side and service-side.
- Posted journal cannot be updated or deleted; reversal entry linked and approved.
- Duplicate PSP webhook -> one captured payment, one ledger financial event, one receipt.
- Simulate donation 100, fee 5: liability to beneficiary 95, fee 5 only with legal policy; not 100 unrestricted revenue.
- Bank reconciliation exact, statement and accounting ledger reconcile; unbalanced report blocks close.
- Clinic A finance API cannot retrieve clinic B journals/payouts (including pagination/export).
- Driver balance derived from ledger and cannot be overwritten via API.
- Closed period cannot accept unauthorized backdated posting.
- Period-end trial balance reports debit=credit; profit/loss and balance sheet reconcile according to defined policy.

## AT-SOCIAL
- Block/privacy suppresses posts/messages/reels/story access by unauthorized actor (including media links).
- Reels with slow upload show retry/progress, publish only after processing; delete revokes access consistent with policies.
- Expired stories excluded from feed.
- Direct chat reconnect replays durable messages without duplication.
- Abuse report exists and moderation action audited.

## AT-SERVICES
- Driver claim race: one accepted assignment.
- Inactive taxi ride: no ongoing precise tracking available to other users.
- Pet hotel dates over capacity rejected even with concurrent requests.
- SOS cannot claim real professional dispatch unless accepted by verified provider.
- Donation campaign can only increase from confirmed payments, and refunds/chargebacks reflected accurately.

## AT-MOTION-UX
- Website home makes premium animated first impression on 390px and 1440px devices, no horizontal overflow, labels legible, CTA and navigation functional.
- `prefers-reduced-motion` removes parallax and nonessential animation; layout remains complete.
- 100+ products / 100+ rows admin finance remain responsive; long scroll and virtualized table where needed.
- Keyboard users can complete login, checkout, appointment and finance approval without hover/drag-only controls.
- LCP/INP/CLS and frame metrics measured and logged; failures documented and optimized rather than guessed.

## Test matrix and evidence
Unit: formulas/domain guards/state transitions. Integration: DB transaction/idempotency/RBAC/closed periods. E2E: 10 primary user journeys. Contract: typed client↔API. Performance: load profile and baseline traces. Security: SAST/DAST manually prioritized to OAuth/RBAC/webhooks/media/money, independent review. Accessibility: axe-like checks + manual keyboard/RTL. Visual regression: homepage, social, clinic accounting, admin and mobile states.

## Prohibition
DO NOT mark as done when only a front-end component renders, when data is fake on a production route, when test commands are not executed, or when a financial/legal/provider integration lacks verification.


<!-- END 17_ACCEPTANCE_TESTS.md -->


---

<!-- BEGIN 18_REFERENCE_AUDIT.md -->

# 18 — تقرير مبدئي للمشروع المرجعي المرفوع من Bolt

## مصدر التقرير
ملف المستخدم `project-bolt-sb1-dgaln6zt (47).zip` والذي تم فك محتواه محلياً؛ المشروع القديم هو نسخة مرجعية فقط، مع فحص ثابت (static inspection). **لم تُنفذ مراجعة أمنية شاملة، ولا اختبارات اختراق، ولا تأكيد كل وظيفة في إنتاج فعلي**. نقص المخططات الكاملة/الخدمات يمنع افتراض نجاح تشغيل كل شيء.

## حقائق ظاهرة من الملفات
- React + Vite + TypeScript + Tailwind؛ يتصل بـ Supabase؛ تطبيق mobile مبدئي React Native/Expo؛ 27 ملفات SQL migrations حسب القائمة، وبعضها fixes لمسائل RLS والصلاحيات.
- ألوان أساسية من Tailwind: lagoon `#0E6873`، fire `#FE7E3C`، pearl `#1A2C30`؛ شعار Petra SVG أصلي داخل مكون Logo. يُستخدم مرجعاً قابلاً للتطوير، لا يفرض حرفياً.
- ملفات واجهات: `CustomerDashboard.tsx`, `DoctorDashboard.tsx`, `ClinicDashboard.tsx`, `TaxiDriverDashboard.tsx`, `AdminApp.tsx` و`AdminAppInventory.tsx`.
- مكونات public/portal/social تشمل: المتجر Storefront، منتجات/مخزن العيادة، طلبات متجري، التبني، الإنقاذ، SOS، LostAndFound، جواز حيوان، وصفات، تحاليل، تأمين وباقات HealthPlans، PetTaxi، Grooming, Hotel, SocialFeed, SocialReels, SocialDirectMessages, PaymentVerification, Loyalty, FinancialCenter.
- في `ClinicDashboard.tsx` توجد tabs `inventory`, `store_orders`, `revenue` بالفعل؛ هذا يؤكد جدوى دمج المتجر في داشبورد العيادة حسب طلب المالك بدلاً من واجهة صاحب المتجر.
- في `CustomerDashboard.tsx` قائمة خدمات تحتوي على مواعيد، جواز، روشتات، مختبر/أشعة، استشارات، فندق، تجميل، تأمين وباقات، تاكسي، إنقاذ، طوارئ ومفقودات؛ لا يجوز حذفها من نطاق إعادة البناء لمجرد غيابها عن وصف المستخدم الأول.
- `FinancialCenter.tsx` يحتوي واجهات دليل حسابات/قيود/مصروفات/تقارير، وmigrations تشمل `chart_of_accounts`, `journal_entries`, `journal_lines`؛ لكن **وجودها لا يعني أن محاسبة حقيقية مترابطة ومكتملة**.
- `mobile/src/lib/supabase.ts` في ZIP الأصلي احتوى عنوان الاتصال ومفتاح عميل ثابتاً، والنسخة المرجعية المرفقة هنا تتضمن redaction. لا تنشر المفتاح أو تعيد استخدامه؛ تقييم تسريب مفاتيح أو تدويرها مع مالك Supabase حسب الحاجة.

## مخاطر بنيوية أولية تتطلب تجنباً في إعادة البناء
- قاعدة قديمة تعتمد على بيانات/استدعاءات مباشرة من واجهات React بكثرة، تجعل ownership/transaction boundaries مشتتة.
- FinancialCenter يتعامل مع أكثر من نوع حساب ويدوي؛ يجب توحيد financial source of truth وإغلاق فجوات استدعاءات متعددة.
- Migration `20260729134731_add_increment_campaign_raised_rpc.sql` تحتاج تدقيق permissions عند أي محاولة إعادة استخدام؛ لا تنقلها إلى المنتج الجديد.
- Existing design uses simple Tailwind animated fade/slide; المالك يريد تجربة Motion أعمق وأرقى.
- قد توجد جداول Supabase غير متضمنة في ZIP؛ لا تستنتج اكتمال schema من قائمة migrations وحدها.

## قواعد الاستفادة
1. اقرأ مسار الواجهة وسلوكها وcopy لتخطيط رحلة المستخدم، ثم ارسم شاشة جديدة وAPI مستقل.
2. استخرج قائمة الوظائف من أسماء الملفات والـ routes وسلوك React ولكن اعتبر اكتمالها «غير مثبت».
3. لا تنسخ SQL/RLS أو auth trigger أو أسرار المشروع القديم، ولا تستخدم الـ bundle المبني `dist`.
4. لا تعيد إطلاق role store owner منفصل؛ merge into clinic.
5. لا تنقل إلى الواجهة الجديدة أكواد markup أو تخطيط قديم كما هو إذا تعارض مع Motion system.


<!-- END 18_REFERENCE_AUDIT.md -->


---

<!-- BEGIN 19_DECISIONS_AND_ASSUMPTIONS.md -->

# 19 — الأسئلة/القرارات التجارية والقانونية التي لا يجوز لـ Codex افتراضها

> لا توقف عمل مرحلة التصميم بسبب هذه النقاط؛ استخدم adapters وmock مقيدة بوسم SANDBOX. ولكن **لا تشغّل دفعاً أو إنقاذاً أو استشارة أو تبرعات فعلية** قبل حسم ما يلزم.

| قرار | الوضع الحالي | الافتراضي المؤقت الآمن |
|---|---|---|
| الاسم التجاري/الشعار | Petra ظاهر في مصدر Bolt، المالك لم يطلب تغييره | Petra كاسم عمل قابل للتخصيص؛ استخدام ألوان مرجعية، وعدم ادعاء ملكية أصول لا يملكها |
| البلد الأول | المستخدم بالعراق، لم يثبت وحده جميع مناطق الخدمة | ar-IQ + IQD configurable، تحديد التغطية عند الإطلاق |
| بوابة الدفع والبنوك | غير محددة | PSP adapter in sandbox فقط، لا live capture |
| ضرائب وفواتير | تتطلب بلد/شكل شركة/محاسب | قوالب tax configurable بلا نسب مفترضة |
| المستفيد من المدفوعات | هل العيادة merchant of record أو المنصة؟ | بنية تدعم صيغاً مختلفة دون إطلاق live قبل قرار |
| عمولة التجارة والحجوزات | غير محددة | configurable per category, no made-up default rate |
| عمولات الطبيب والسائق | عقد تشغيل غير محدد | payout model configurable حسب الجهة المستحقة |
| برامج التأمين | خدمة مالية منظمة | care plans غير تأمينية افتراضياً إلى حين شريك مرخص |
| الجهات المؤهلة للتبرعات | غير محددة | التبرعات الحقيقية disabled حتى تحقق قانوني |
| مزود الخرائط | غير محدد | interface + dev/mock map, location permissions |
| برامج التحقق | وثائق الأطباء/العيادات/السائقين تحتاج تدقيق | manual moderation & secure document storage |
| المكالمات الطبية | تنظيم/مزود Video مطلوب | consultation scheduling/text؛ video gated |
| نوع الحيوان والتخصصات | تختلف بحسب البلد والخدمات | admin-managed taxonomies |
| العملة والتوقيت | متغيرات حسب السوق | IQD base + Asia/Baghdad display; DB stores UTC |
| عمر المستخدمين والأهلية | غير محدد | adult-first policies, age restrictions/legal counsel |
| سياسات الاحتفاظ والحذف | غير محددة قانونياً | configurable; no irreversible deletion of finance/medical records until policy |
| SLA طوارئ الإنقاذ | بدون جهات وشبكة تشغيل مؤكدة | لا وعد بوصول إسعاف؛ وصف دقيق لدور المنصة |
| التبرعات مجهولة الاسم | سياسة تتبع/خصوصية غير محددة | public anonymity allowed, accounting records remain controlled |
| Analytics/Ads | بحاجة موافقة خصوصية | minimal opt-in analytics, no cross-context ad tracking by default |

## product choices engineering can decide now
Modular core, typed APIs, RBAC/ABAC, clinic-owned commerce, immutable finance, mobile-ready, Arabic RTL, animation with reduced-motion, five dashboards, reliable eventing, auth review, no legacy SQL copy.

## Gate checklist before real-money launch
Legal entity + merchant of record; licensed payment provider availability; KYC/AML where applicable; invoicing/tax fields; charity donation authorization; data/privacy terms; disbursement policy; financial approval workflows; refund rules; insurance qualification; customer support obligations.


<!-- END 19_DECISIONS_AND_ASSUMPTIONS.md -->


---

<!-- BEGIN 20_CODEX_PHASE_COMMANDS.md -->

# 20 — الأوامر المتسلسلة لـ Codex: انسخ الأمر الخاص بالمرحلة

## بعد فتح الحزمة
```
Read README_START_HERE_AR.md, AGENTS.md, CODEX_MASTER_PROMPT.md and all numbered requirements. Inspect legacy_reference ONLY as behavior/design evidence. Confirm that the new product has exactly five dashboards and clinic-owned commerce, full double-entry accounting, complete care center, and professional animated Arabic RTL UX. Create requirements traceability and Phase 00 architecture, then implement the Phase 00 foundation and motion proof-of-concept with executable tests. Do not touch any live external providers.
```

## Phase 01 — accounts & clinic identity
```
Implement Phase 01 from 16_IMPLEMENTATION_ROADMAP.md as full vertical slices: customer identity, authentication, admin MFA, verified doctor/clinic/driver applications, memberships, granular clinic permissions, secure workspace switching. No store owner role or dashboard. Add migrations/API/UI/tests for cross-tenant and privilege escalation. Update progress documentation with exact run outputs.
```

## Phase 02 — Care Center
```
Implement Pet 360 and Care Center in 03_CARE_AND_MEDICAL.md: pets, guardian permissions, medical record, vaccines, reminders, passport, appointments with race-safe slots, doctor encounters, prescription/labs and privacy. Preserve consent and retention safeguards; do not generate clinical advice. Complete documented acceptance tests before the next feature.
```

## Phase 03 — Clinic commerce
```
Implement the clinic-owned Marketplace from 04_CLINIC_MARKETPLACE.md. All management and financial tabs belong inside the Clinic Dashboard with scoped staff privileges. Build product catalog, warehouses, stock movements, purchasing, customer checkout sandbox, clinic-split orders and returns. Provide E2E proof that no standalone store-owner route, role or dashboard exists.
```

## Phase 04 — Finance + reporting
```
Implement 05_ACCOUNTING_ERP.md and 21_FINANCIAL_EXAMPLES.md. Build immutable balanced double-entry general ledger for platform and clinic entities, invoice/receivable/payable, cash/bank, inventory costing, commission, clinic/doctor/driver settlement, refunds, restricted donations and financial reports. Use transaction boundaries, approvals, source-referenced journals and idempotent webhook ingestion. Prove tests including 3 duplicate payment webhooks and an exact reversal. Keep all external payments sandbox.
```

## Phase 05 — Care plans / hospitality
```
Complete care packages, entitlements, renewal and deferred revenue; grooming/hotel booking and capacity constraints. Ensure clinic-provided services integrate scheduling, invoices and customer/clinic dashboards. Never label a plan legal insurance without licensed partner confirmation.
```

## Phase 06 — Social & advanced animated interactions
```
Build posts, follow graph, reactions, moderated media uploads, Reels adaptive playback with background processing, Story lifecycle, direct messages with realtime and privacy/reconnect, notifications and feed. Follow Motion tokens and reduced-motion rules. Do not bypass safety, authorization or CDN privacy.
```

## Phase 07 — Rescue/adoption/donations
```
Implement adoption and rescue workflows, SOS and Lost&Found. Donation campaign payment and payouts must stay in explicit sandbox until real provider and legal authorization. Audit all transitions and ensure restricted fund journal handling.
```

## Phase 08 — Pet Taxi
```
Implement verified driver dashboard, quotes, race-safe dispatch and trip states, location consent+TTL, incidents and financial driver earnings/settlements, integrate with admin and clinic booking contexts.
```

## Phase 09 — Launch audit
```
Perform exhaustive Phase 09 tests/security/performance/RTL/accessibility and operational deployment checks. Produce an honest launch readiness report with pass/fail, unresolved dependencies, screenshots and real test commands; do not claim compliant or million-user capable without independent testing.
```

## Generic review prompt after EVERY phase
```
Review implementation against AGENTS.md, 17_ACCEPTANCE_TESTS.md and traceability matrix. List every missing or partially implemented requirement, hardcoded mock, silent failure, security/ledger issue, non-working action and motion/RTL problem. Fix P0/P1 first, rerun tests, and produce a diff-based report. Never mark incomplete as done.
```


<!-- END 20_CODEX_PHASE_COMMANDS.md -->


---

<!-- BEGIN 21_FINANCIAL_EXAMPLES.md -->

# 21 — أمثلة مالية ملزمة للاختبار (أرقام توضيحية فقط وليست أسعار/نسب عمل فعلية)

## قواعد المثال
- الأمثلة بـ IQD، لا ضريبة مضافة للتبسيط (ليست قاعدة ضريبية). كل بند حسب سياسة recognition والكيان المتعاقد / merchant of record؛ الأمثلة تعلم مسارات ledger وليست قراراً قانونياً عن تملك أموال العملاء.
- المرجع المالي الأساسي يحدد بوضوح `platform-ledger` و`clinic-ledger` و`restricted-fund`. لا تُنشأ الإيرادات مرتين عبر دفاتر منفصلة. التشعب حسب المحاسب وسياسة الوكيل/الأصيلية؛ أي اختلاف تجاري يتطلب ADR.

## EX-FIN-001 عمولة متجر (المنصة وسيط تحصيل)
تم شراء منتج من عيادة بقيمة 100,000 د.ع، عمولة منصة 10,000، مستحق عيادة 90,000. **بعد تأكيد تحصيل فعلي**:
- Ledger المنصة بالتمثيل المبسط للعلاقة كوكيل تحصيل: DR نقد/تسوية PSP 100,000؛ CR مستحق العيادة 90,000؛ CR إيراد عمولة منصة 10,000.
- عند التحويل للعيادة: DR مستحق العيادة 90,000؛ CR النقد/البنك 90,000.
- Ledger العيادة بحسب سياق تحقق البيع: DR مستحق التحصيل من المنصة 90,000؛ DR مصروف عمولة 10,000؛ CR إيراد مبيعات 100,000؛ ومن ثم COGS: DR تكلفة البضاعة المباعة (وفق التكلفة الفعلية)؛ CR مخزون.
- إذا كانت الأموال في حيازة PSP أولاً وليس حساب المنصة، يُستخدم `PSP Clearing` ولا يعرض النظام Bank Cash قبل التسوية الفعلية.

## EX-FIN-002 شراء متعدد العيادات
- إجمالي 150,000؛ عيادة A 100,000 وعيادة B 50,000؛ رسوم المنصة 10% **كمثال فقط**.
- منصة: عمولة 15,000؛ التزامات A 90,000، B 45,000 (مع تجاهل أي رسوم PSP/شحن مثالياً). تحقق total = 150,000.
- رد جزئي لـB بمبلغ 20,000 قبل التسوية: reversal/credit note مقابل بائع B وعمولته 2,000 بصورة صحيحة، ولا تمس حصة A. Use original order item references and idempotency.

## EX-FIN-003 حجز عيادة ودفع أتعاب طبيب
- خدمة 60,000، حصة طبيب متفق عليها 20,000، المتبقي قبل المصروفات 40,000 مع تجاهل عمولة المنصة هنا.
- عند إنجاز الخدمة وثبوت استحقاق أتعاب الطبيب في دفتر المنشأة المعنية: DR تكلفة/مصروف أتعاب طبيب 20,000؛ CR مستحق الطبيب 20,000؛ وعند الدفع DR مستحق الطبيب 20,000؛ CR نقد/بنك 20,000.
- لا تُحتسب أتعاب الطبيب من مجرد «إجمالي زيارات» أو قبل حالة إكمال معتمدة؛ توقيت استحقاق الإيراد والسياسات يخضعان لقرار المحاسب.

## EX-FIN-004 تبرع مقيد (مع مزود وجهة قانونية معتمدة)
- متبرع يدفع 100,000، الرسوم المعلنة 5,000 إذا كانت مسموحة نظامياً، مستحق الجهة 95,000.
- بعد تأكيد التحصيل: DR PSP Clearing / Cash 100,000؛ CR Funds Held for Beneficiary 95,000؛ CR Fee Revenue 5,000 فقط إذا تم استحقاقه قانونياً وعقدياً.
- عند صرف معتمد: DR Funds Held for Beneficiary 95,000؛ CR Cash / Bank 95,000؛ المستفيد/الحملة مستندات وآلية تبرير؛ يظهر للجمهور «تم التحصيل المؤكد» وليس initiated/failed.
- إذا كان يجب تحويل 100% للجهة قانونياً، فلا تفترض اقتطاع 5,000. القاعدة قابلة للتكوين بعد مراجعة القانون والاتفاق.

## EX-FIN-005 Pet Taxi
- أجرة 30,000، حصة السائق 24,000، عمولة المنصة 6,000 توضيحياً.
- في دفتر جهة التحصيل عند completion/settlement وفق السياسة: DR cash/PSP clearing 30,000؛ CR driver payable 24,000؛ CR platform commission revenue 6,000. بعد payout يعكس driver payable.
- إذا جمع السائق نقداً من العميل، تنشأ ذمم بين السائق والمنصة وتتم مطابقتها؛ لا تعتبر المنصة قبضت Cash فعلياً.

## EX-FIN-006 رصيد اشتراك مقدم
- العميل دفع 120,000 لقاء اشتراك سنة لخدمات مؤهلة، وفق policy recognition شهرية 10,000 فرضاً: عند التفعيل DR نقد/تحصيل 120,000؛ CR إيراد مؤجل 120,000؛ شهرياً DR إيراد مؤجل 10,000؛ CR إيراد اشتراكات 10,000. الاسترداد والإلغاء يحدد وفق شروط وأيام الاستحقاق والضريبة إن لزم.

## EX-FIN-007 مردود منتج + جرد المخزون
- عملية بيع 50,000، تكلفة بضاعة 30,000. عند رد صالح للبيع: DR مبيعات مردودة/contra revenue 50,000؛ CR نقد مسترد/ذمة العميل 50,000؛ DR مخزون 30,000؛ CR COGS 30,000، مع عكس عمولة المنصة وقيد حساب PSP حسب أحداث الأصل. المنتج التالف يذهب حساب خسارة/هالك، لا يعاد لمخزون قابل للبيع تلقائياً.

## EX-FIN-008 الدفعات الجزئية والمطابقة
- فاتورة مورد 100,000، سددت 40,000 ثم 60,000؛ accounts payable aging يطابق remaining؛ لا تُنشأ فاتورة ثالثة/قيد مكرر عند retry.

## EX-FIN-009 فشل webhook متكرر
- webhook payment captured ID X يصل ثلاث مرات، ثم request timeout: exactly-one processed provider event، exactly-one ledger posting group وexactly-one order payment state transition؛ outbox retry safe.

## EX-FIN-010 إغلاق الفترة
- حسابات الفترة متوازنة، bank matching checked، sub-ledgers reconciled، pending exceptions listed; finance reviewer locks period. تعود محاولة إدخال قيد بتاريخ مغلق بـ domain error مع مسار `post_adjustment` محكوم ومبرر.

## اختبار invariant جداول
| ID | Given | When | Then |
|---|---|---|---|
| F01 | Order value 100k | payment settled | platform=10k earned; clinic liability=90k; journal balanced |
| F02 | partial refund | finance event retried | one reversal chain, no duplicate refund |
| F03 | donor anonymous | campaign payout | beneficiary receives allowable amount; donor identity private |
| F04 | doctor eligible payment | payout approved | payable reduces to 0 without repeat transfer |
| F05 | accounting period locked | insert backdated journal | blocked with audited reason |
| F06 | clinic user A | request clinic B balance | denied |
| F07 | monthly reports | export after close | retained immutable as-of evidence |
| F08 | inventory cost movement | refund damaged item | COGS and write-off reflect correct classifications |


<!-- END 21_FINANCIAL_EXAMPLES.md -->


---

<!-- BEGIN 22_DESIGN_REVIEW_CHECKLIST.md -->

# 22 — نموذج مراجعة جمالية ووظيفية لكل شاشة

## System-level
- Visual hierarchy inspired by premium consumer applications, not boilerplate admin.
- Consistent Petra teal/orange tokens, whitespace rhythm, expressive pet imagery with license, Arabic type, exact copy grammar and no Arabic text distortions.
- Global shell states and interactive navigation; dark/hover/focus/pressed/disabled/loading/error variants as designed.
- Motion language: intentional entrances, content transformations, live state confirmations, contextual panels, subtle feedback; no enormous generic animations repeated every visit.
- Presentation: content skeleton matches final dimensions to eliminate layout shift; mobile gestures paired with accessible buttons.

## Landing
- Story-driven hero compelling above fold at 390px and 1440px; buttons visible; intentional animated layers not hiding text; no intrusive pop-ups.
- Reveal sections staggered and reversible navigation, iconography/reusable illustration patterns, a real-feature preview without passing fake stats as genuine.
- Hero preview static/reduced-motion fallback, responsive image loading, SEO and correct RTL.

## Customer care
- Pet avatar/progress and upcoming care tasks with genuine data; no fake vaccinations or medical summary.
- Medical record readability, document links, trust indicators with accessible labels; calendar touch-friendly.

## Marketplace
- Product cards have image hierarchy, price, seller (clinic), availability, add-to-cart transition, currency alignment; full right-to-left responsive checkout.
- State transitions inventory and price conflicts understandable; skeleton/empty/failed payments.

## Social
- Vertical reels frame, caption overlay safe zones, accessible playback controls, network fallback, progress; stories have timer readable and reduced motion.
- Direct chat usable from keyboard, screenreader, RTL text mixed with links and Latin IDs.

## Clinic + Accounting
- Dense tables balance readability and motion; sticky/virtual lists only if tested; line items, totals, debits/credits, dates with numerical bidi safety.
- Posted/reversed states visually unmistakable; approvals require confirmation, linked evidence visible; loss of connection never displays false success.

## Driver + SOS
- Large touch targets, critical controls accessible while stationary/safe, emergency warning not playful or distracting; map not sole source of directions, location consent clear.

## Accessibility & verification
- Semantics, accessible names, focus visible, contrast, keyboard, skip link, reduced motion, large text reflow, 200% zoom, RTL font fallbacks.
- Visual regression screenshots: 390px phone + 768px tablet + 1440px desktop, loading/empty/error/success, RTL and mixed English/Arabic numerical content.
- Real device motion/performance profile with slow network. Review failing cases before rollout; use design system tokens rather than inline animation hacks.


<!-- END 22_DESIGN_REVIEW_CHECKLIST.md -->


---

<!-- BEGIN 23_GLOSSARY_AND_STATE_MACHINES.md -->

# 23 — معجم النظام وحالات سير الأعمال

## مفاهيم
- **Petra user**: human account with one global identity.
- **Workspace**: UI/API context for one of five personas, with clinic membership when applicable.
- **Clinic**: verified organization owning branches, staff, clinical services and storefront(s).
- **Storefront**: clinic-owned publicly browsable commerce catalog — not standalone account/dashboard.
- **Pet guardian**: human granted access to specific animal and, optionally, medical record scopes.
- **Encounter**: doctor-documented clinical visit linked to pet/appointment.
- **Donation fund**: legally restricted funds owed to beneficiary, distinct from earned platform fee.
- **Ledger entity**: accounting book legal/reporting boundary, not just UI filter.
- **Settlement**: confirmed calculation of net amount payable to clinic, doctor, driver or beneficiary after adjustments.
- **Media asset**: uploaded file validated then processed; public visibility only after processing + moderation.

## State machines with denied transitions
- `ClinicVerification`: applied→under_review→approved/rejected/suspended, audit reason required.
- `DoctorVerification`: submitted→review→approved/rejected/suspended, valid licensing fields.
- `Pet`: active/archived/deceased (sensitive respectful flows; do not delete historical medical or financial records without policy).
- `Appointment`: created→pending/held→confirmed→checked_in→in_progress→completed, alternative cancelled/no_show/refunded; no direct `draft→completed` by customer.
- `Encounter`: draft→signed→addendum (no update signed original).
- `Product`: draft→under_review(optional)→published→paused/unpublished/archived.
- `Order`: draft→placed→awaiting_payment→paid→fulfilling→shipped→delivered, alternative cancelled/return_requested/partially_refunded/refunded/disputed.
- `Invoice`: draft→issued→partially_paid→paid / voided (only legal path) / credited.
- `Journal`: draft→approved→posted→reversed_by_linked_entry; never `posted→edited`.
- `Donation`: intent→pending_provider→confirmed→allocated/disbursed or failed/refunded/chargeback; only confirmed is raised amount.
- `CareSubscription`: proposed→active→paused?→expired/cancelled/refunded; entitlements usage decreases atomically.
- `RescueCase`: submitted→triaged→verified→assigned→in_progress→resolved, alternative rejected/duplicate/closed.
- `AdoptionApplication`: submitted→reviewing→interview→approved/rejected→handover_completed; with cancellation/withdrawal.
- `TaxiRide`: request→priced→assigned→driver_en_route→arrived→in_transit→completed; cancelled/disputed states with permitted transitions.
- `Media`: upload_intent→uploaded→scanning→transcoding→ready/failed/rejected; never publish until ready.
- `Story`: active→expired/deleted with read permissions and storage lifecycle.
- `SupportTicket`: open→triaged→assigned→waiting_customer→resolved→closed / reopened.

## Status transition security contract
For every state change: who can request it, required current state, who owns record, required evidence, deadline/concurrency guard, related journal/inventory/notification side effect, audit reason, idempotency key, recoverable failure strategy. Implement as domain transition tests, not free-form `.update({status})` from React.


<!-- END 23_GLOSSARY_AND_STATE_MACHINES.md -->
