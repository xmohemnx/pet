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
