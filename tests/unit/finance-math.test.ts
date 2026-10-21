import { describe, it, expect } from 'vitest';
import {
  usageRecognition,
  refundCommission,
} from '../../packages/contracts/src';
describe('حفظ الوحدات المالية الصحيحة', () => {
  it('يعترف بكل قيمة الاشتراك تمامًا حتى مع باقي القسمة', () => {
    expect([0, 1, 2].map((i) => usageRecognition(10001n, i, 3))).toEqual([
      3333n,
      3334n,
      3334n,
    ]);
    for (let price = 1; price < 200; price++) {
      for (let uses = 1; uses < 15; uses++) {
        let sum = 0n;
        for (let used = 0; used < uses; used++)
          sum += usageRecognition(BigInt(price), used, uses);
        expect(sum).toBe(BigInt(price));
      }
    }
  });
  it('عكس العمولة الجزئي يحفظ الباقي في آخر رد', () => {
    expect(
      [0n, 5n, 10n].map((before) => refundCommission(1n, 15n, before, 5n)),
    ).toEqual([0n, 0n, 1n]);
    expect(refundCommission(10000000n, 100000000n, 0n, 50000000n)).toBe(
      5000000n,
    );
  });
  it('يرفض تجاوز حق الاشتراك ومبلغ المبيعات ومبالغ سالبة', () => {
    expect(() => usageRecognition(100n, 3, 3)).toThrow();
    expect(() => refundCommission(2n, 10n, 9n, 2n)).toThrow();
    expect(() => refundCommission(-1n, 10n, 0n, 1n)).toThrow();
  });
});
