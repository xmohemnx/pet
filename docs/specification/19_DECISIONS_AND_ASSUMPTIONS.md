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
