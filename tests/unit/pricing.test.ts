import { describe, it, expect } from 'vitest';
import {
  allocateDiscount,
  exclusiveTax,
  quantityRefund,
  refundCommission,
} from '../../packages/contracts/src';
describe('تسعير ومرتجعات بوحدات صحيحة', () => {
  it('يوزع أكبر البواقي بترتيب ثابت دون تجاوز أي بند', () => {
    expect(allocateDiscount([1n, 1n, 1n, 0n], 2n)).toEqual([1n, 1n, 0n, 0n]);
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 12; b++)
        for (let d = 0; d <= a + b; d++) {
          const parts = allocateDiscount([BigInt(a), BigInt(b)], BigInt(d));
          expect(parts[0]! + parts[1]!).toBe(BigInt(d));
          expect(parts[0]! <= BigInt(a) && parts[1]! <= BigInt(b)).toBe(true);
        }
  });
  it('يحفظ الدقة فوق مدى Number الآمن ويقرب الضريبة نصفاً إلى أعلى', () => {
    expect(exclusiveTax(9007199254740993n, 1250)).toBe(1125899906842624n);
    expect(exclusiveTax(1n, 5000)).toBe(1n);
    expect(exclusiveTax(2900n, 250)).toBe(73n);
  });
  it('يعيد كل البواقي عند رد ثلاث قطع على دفعات مع كامل العمولة', () => {
    const net = [0, 1, 2].map((n) => quantityRefund(2900n, 3, n, 1)),
      tax = [0, 1, 2].map((n) => quantityRefund(73n, 3, n, 1));
    expect(net).toEqual([966n, 967n, 967n]);
    expect(tax).toEqual([24n, 24n, 25n]);
    let before = 0n,
      fees = 0n;
    net.forEach((n) => {
      fees += refundCommission(362n, 2900n, before, n);
      before += n;
    });
    expect(before).toBe(2900n);
    expect(fees).toBe(362n);
    expect(
      quantityRefund(2973n, 3, 0, 2) + quantityRefund(2973n, 3, 2, 1),
    ).toBe(2973n);
  });
  it('يرفض الخصم الزائد والضريبة غير الصحيحة وتجاوز كمية الرد', () => {
    expect(() => allocateDiscount([10n], 11n)).toThrow();
    expect(() => allocateDiscount([-1n], 0n)).toThrow();
    expect(() => exclusiveTax(10n, 1.2)).toThrow();
    expect(() => exclusiveTax(10n, 10001)).toThrow();
    expect(() => quantityRefund(10n, 3, 2, 2)).toThrow();
    expect(() => quantityRefund(-1n, 3, 0, 1)).toThrow();
  });
});
