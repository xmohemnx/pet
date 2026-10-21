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
