# 23 — مصطلحات موحّدة ودورات حالة الأعمال

## هوية كيانات المنصة
| المصطلح | المقصود |
|---|---|
| `User` | الهوية الأساسية لا تحدد وحدها كل الصلاحيات |
| `Clinic` | كيان تنظيمي موثّق مع فروع وموظفين وجدولة ومتجر تابع |
| `ClinicMember` | موظف/مستخدم له صلاحيات محددة داخل عيادة معينة |
| `Storefront` | واجهة متجر عامة **تملكها عيادة**؛ ليس لها حساب أو داشبورد مستقل |
| `DoctorProfile` | ترخيص ومهنة الطبيب؛ يمكن ربطه بعدة عيادات بصلاحيات مستقلة |
| `Pet` | حيوان له مالك/أوصياء وصلاحيات وسجل رعاية متتابع |
| `MedicalEncounter` | لقاء علاجي موثق وموقع من طبيب مخوّل |
| `Booking` | حجز خدمة/موعد ويخضع لتوافر المورد وعدم التداخل |
| `Order` | طلب شراء قد يحتوي بنوداً من عيادات مختلفة مع تجزئة تنظيمية |
| `LedgerEntity` | كيان محاسبي مستقل للمنصة أو العيادة أو صندوق مقيد |
| `PostedJournal` | قيد مالي معتمد ومتوازن غير قابل للتعديل |
| `PaymentAttempt` | محاولة دفع — لا تعادل تحصيلاً مؤكداً |
| `DonationFund` | أموال مقيدة لصالح حملة/مستفيد، لا إيراد حر |
| `RescueCase` | حالة إنقاذ منظمة ذات مسؤول/أولوية وسجل إجراءات |
| `TaxiRide` | طلب نقل يمر بإسناد وقبول وتتبع وإنهاء |

## انتقالات حالة حاكمة (state machines)

### الهوية المهنية
`draft → submitted → under_review → verified | rejected → suspended | revoked`
- التحقق من المهني قرار إداري موثّق، لا تعديل من العميل.
- الرفض يحتاج سبباً وقابلية إعادة طلب حسب السياسة؛ التعليق يسحب الصلاحيات المستقبلية فوراً.

### حجز طبيب/عيادة
`requested → pending_confirmation → confirmed → checked_in → in_progress → completed`
وبدائل `cancelled`, `no_show`, `rescheduled`, `rejected` بحسب سياسة المدفوعات والأوقات.
- لكل انتقال actor ونطاق صلاحية، slot lock/version، سبب، وطابع زمني.
- إنهاء الزيارة لا يوقع سجلاً طبياً نيابة عن الطبيب.

### الوصفة والسجل الطبي
`draft → reviewed → signed → amended_by_addendum`
- لا يُمحى سجل موقع؛ تعديل إلحاقي سبب/تاريخ/طبيب مع audit.
- مشاركة السجل عبر نطاق المريض وعيادته والموافقات الضرورية.

### متجر عيادة / طلب تجاري
`cart → checkout_pending → payment_pending → paid → processing → fulfilled → completed`
وبدائل `cancelled`, `partially_fulfilled`, `returned`, `refunded`, `disputed`.
- `paid` يتطلب حدث دفع موثق أو دورة COD معتمدة، لا boolean من العميل.
- Stock reservation/commit/release معاملات idempotent؛ لا مخزون سالب بلا Backorder مضبوط.
- تجزئة multi-clinic order تحت رقم رئيسي مع child fulfillment وربط مالي منفصل.

### تبرعات
`campaign_draft → compliance_review → approved → active → closed → reconciled → funds_disbursed`
وبدائل `rejected`, `frozen`, `cancelled`.
- التبرع `initiated → pending → settled | failed | refunded`; مبلغ الحملة مشتق من `settled` مؤكد.
- صرف المال خاضع لجهة مستفيدة موثقة، موافقة منفصلة ومطابقة بنك/مزود.

### SOS / Rescue
`new → triaged → assigned → responder_en_route → on_site → transferred_to_care → resolved`
وبدائل `cancelled`, `unable_to_serve`, `false_report`; تحفظ الأدلة ومحدودية مشاركة الموقع.
- لا تظهر كلمة «تم إرسال فريق» إذا لم تؤكد جهة إنقاذ معتمدة المهمة فعلياً.

### التبني
`listing_draft → verified → published → application_received → under_review → approved → handover_scheduled → adopted`
وبدائل `rejected`, `withdrawn`, `expired`, `returned` وفق السياسة.
- بيانات مقدمي الطلبات محفوظة وفق role scopes؛ وثّق التسليم وموافقات الجهة.

### الرحلة / Pet Taxi
`requested → quoted → matching → offered → accepted → driver_arriving → pet_picked_up → in_transit → dropped_off → completed`
وبدائل `cancelled`, `expired`, `failed`, `disputed`.
- قبول سائق واحد فقط via atomic transaction؛ route/location TTL وموافقة المستخدم؛ مدفوعات ورسوم السائق من حدث مكتمل مؤكد.

### Social moderation
`submitted → scanning → visible | quarantined → under_review → restored | removed | appealed`
- المنشور الخاص لا يظهر في الاستكشاف أو روابط سريعة؛ blocked users لا يرسلون رسائل مباشرة.
- stories لها expiry وحذف/إخفاء وحفظ حسب السياسة، مع التحقق من الوصول للملفات نفسها في التخزين.

### محاسبة
`draft → reviewed → approved → posted → reversed_by_new_journal`
- ترحيل قيود مكتملة بTransaction وقيد متوازن ومرجع حدث. لا تعديل لـ posted.
- `period_open → closing → closed`; إعادة الفتح فقط بضوابط تدقيق مصرح بها.

## تعليمات Codex للتنفيذ
- أنشئ typed enums للمراحل وجداول transitions/guards وأسباب انتقال مخزنة.
- اجعل كل transition على السيرفر مع فحص version/authorization وidempotency key وسجل audit.
- اختبر الانتقالات الممنوعة والتزامن والعودة من الأخطاء ومعالجة retry.
- واجهات RTL تعرض حالة العملية ومعنى الانتقال ومن له حق اتخاذها؛ لا تحاكي النجاح قبل التأكيد.
