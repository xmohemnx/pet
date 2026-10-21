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
