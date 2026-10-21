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
