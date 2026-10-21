import { describe, it, expect } from 'vitest';
import {
  petInputSchema,
  visitContentSchema,
} from '../../packages/contracts/src';
const pet = { name: 'لوز', species: 'cat', sex: 'unknown' };
const visit = {
  complaint: 'فحص',
  subjective: '',
  objective: '',
  assessment: 'تقييم الطبيب',
  plan: 'خطة الطبيب',
  prescriptions: [],
  vaccines: [],
  labs: [],
  followUps: [],
};
describe('حدود بيانات الرعاية الطبية', () => {
  it('يرفض نقل الملكية أو تجاوز النسخة عبر حقول ملف الحيوان', () => {
    expect(
      petInputSchema.safeParse({
        ...pet,
        ownerId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(
      petInputSchema.safeParse({ ...pet, birthDate: '2999-01-01' }).success,
    ).toBe(false);
    expect(petInputSchema.safeParse({ ...pet, weightGrams: -1 }).success).toBe(
      false,
    );
  });
  it('لا يقبل نتيجة معتمدة بلا نص ولا متابعة لقاح تسبق تنفيذه', () => {
    expect(
      visitContentSchema.safeParse({
        ...visit,
        labs: [{ test: 'فحص', status: 'reviewed', result: '' }],
      }).success,
    ).toBe(false);
    expect(
      visitContentSchema.safeParse({
        ...visit,
        vaccines: [
          {
            name: 'لقاح',
            administeredOn: '2026-01-01',
            batch: '',
            nextDueOn: '2025-01-01',
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('يرفض حقول توقيع يرسلها العميل وخطة طبية فارغة', () => {
    expect(
      visitContentSchema.safeParse({
        ...visit,
        signedAt: '2026-01-01T12:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      visitContentSchema.safeParse({ ...visit, assessment: ' ' }).success,
    ).toBe(false);
  });
});
