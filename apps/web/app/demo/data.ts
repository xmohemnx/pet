import { customerDemoSchema, financeDemoSchema } from '@petra/contracts';
export async function getCustomerDemo() {
  const r = await fetch(
    `${process.env.API_BASE_URL || 'http://127.0.0.1:4000'}/api/v1/demo/customer`,
    { cache: 'no-store', signal: AbortSignal.timeout(5000) },
  );
  if (!r.ok) throw new Error('تعذر تحميل بيانات العرض');
  return customerDemoSchema.parse(await r.json());
}
export async function getFinanceDemo() {
  const r = await fetch(
    `${process.env.API_BASE_URL || 'http://127.0.0.1:4000'}/api/v1/demo/clinics/demo-clinic/finance`,
    { cache: 'no-store', signal: AbortSignal.timeout(5000) },
  );
  if (!r.ok) throw new Error('تعذر تحميل بيانات العرض');
  return financeDemoSchema.parse(await r.json());
}
