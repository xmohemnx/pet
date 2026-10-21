import { customerDemoSchema, financeDemoSchema } from './index.js';
export const customerDemo = customerDemoSchema.parse({
  mode: 'design-demo',
  pets: [
    {
      id: 'luna',
      name: 'لونا',
      species: 'قطة شيرازي',
      description: 'رفيقتك الصغيرة، بعناية أكبر كل يوم.',
      color: 'mint',
    },
    {
      id: 'milo',
      name: 'ميلو',
      species: 'كلب كورجي',
      description: 'طاقة كبيرة، وخطوات صغيرة نحو رعاية أفضل.',
      color: 'peach',
    },
  ],
  appointments: [
    {
      id: 'visit-1',
      petId: 'luna',
      title: 'زيارة متابعة',
      clinic: 'عيادة الأصدقاء · مثال توضيحي',
      time: '١٠:٣٠ صباحًا',
      date: '2026-11-02',
    },
    {
      id: 'visit-2',
      petId: 'milo',
      title: 'جلسة عناية بالفراء',
      clinic: 'عيادة الأصدقاء · مثال توضيحي',
      time: '٠٤:٠٠ مساءً',
      date: '2026-11-04',
    },
  ],
});
export const financeDemo = financeDemoSchema.parse({
  mode: 'design-demo',
  clinicId: 'demo-clinic',
  currency: 'IQD',
  invoices: [
    {
      id: 'DEMO-001',
      customer: 'سارة أحمد',
      description: 'زيارة بيطرية',
      issuedAt: '2026-10-20',
      amountMinor: '35000000',
      status: 'paid',
    },
    {
      id: 'DEMO-002',
      customer: 'علي حسن',
      description: 'منتجات عناية',
      issuedAt: '2026-10-20',
      amountMinor: '62500000',
      status: 'pending',
    },
    {
      id: 'DEMO-003',
      customer: 'نور خالد',
      description: 'جلسة تجميل',
      issuedAt: '2026-10-19',
      amountMinor: '25000000',
      status: 'paid',
    },
    {
      id: 'DEMO-004',
      customer: 'مريم عمر',
      description: 'إرجاع منتج',
      issuedAt: '2026-10-18',
      amountMinor: '18000000',
      status: 'refunded',
    },
    {
      id: 'DEMO-005',
      customer: 'حسن محمد',
      description: 'مستلزمات تغذية',
      issuedAt: '2026-10-18',
      amountMinor: '48000000',
      status: 'paid',
    },
  ],
});
