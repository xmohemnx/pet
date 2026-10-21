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
