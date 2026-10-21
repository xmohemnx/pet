import { describe, expect, it } from 'vitest';
import {
  financialEventSchema,
  formatIqd,
  workspaceSchema,
} from '../../packages/contracts/src';
import {
  customerDemo,
  financeDemo,
} from '../../packages/contracts/src/fixtures';
const event = {
  eventId: '00000000-0000-4000-8000-000000000001',
  occurredAt: '2026-10-20T10:00:00Z',
  aggregateId: '00000000-0000-4000-8000-000000000002',
  aggregateType: 'order',
  aggregateVersion: 1,
  type: 'PaymentCaptured',
  actorId: '00000000-0000-4000-8000-000000000003',
  clinicId: '00000000-0000-4000-8000-000000000004',
  ledgerEntityId: '00000000-0000-4000-8000-000000000005',
  idempotencyKey: 'local-test-event-0001',
  currency: 'IQD',
  amountMinor: '100000000',
};
describe('حدود العقود المشتركة', () => {
  it('يحدد خمس مساحات عمل ويرفض هوية تاجر مستقلة', () => {
    expect(workspaceSchema.options).toHaveLength(5);
    expect(workspaceSchema.safeParse('seller').success).toBe(false);
  });
  it('يحمل الحدث المالي سياق دفتر وعيادة ومفتاح منع التكرار', () => {
    expect(financialEventSchema.parse(event).amountMinor).toBe('100000000');
    const { clinicId: _, ...unscoped } = event;
    void _;
    expect(financialEventSchema.safeParse(unscoped).success).toBe(false);
  });
  it.each(['10.5', '-1', '1e3', '001'])(
    'يرفض مبلغ التخزين غير الصحيح %s',
    (amountMinor) => {
      expect(
        financialEventSchema.safeParse({ ...event, amountMinor }).success,
      ).toBe(false);
    },
  );
  it('يرفض حقولًا سرية إضافية وطابعًا زمنيًا بلا UTC', () => {
    expect(
      financialEventSchema.safeParse({ ...event, password: 'test' }).success,
    ).toBe(false);
    expect(
      financialEventSchema.safeParse({
        ...event,
        occurredAt: '2026-10-20T10:00:00',
      }).success,
    ).toBe(false);
  });
  it('يعرض وحدات IQD الثلاث دون تقريب عائم حتى المبالغ الكبيرة', () => {
    expect(formatIqd('1234567')).toBe('١٬٢٣٤٫٥٦٧ د.ع');
    expect(formatIqd('9007199254740993000')).toBe('٩٬٠٠٧٬١٩٩٬٢٥٤٬٧٤٠٬٩٩٣ د.ع');
    expect(formatIqd('0')).toBe('٠ د.ع');
  });
  it('يمنع خلط أمثلة التصميم ببيانات إنتاجية', () => {
    expect(customerDemo.mode).toBe('design-demo');
    expect(financeDemo.mode).toBe('design-demo');
    expect(
      customerDemo.appointments.every((a) =>
        customerDemo.pets.some((p) => p.id === a.petId),
      ),
    ).toBe(true);
  });
});
