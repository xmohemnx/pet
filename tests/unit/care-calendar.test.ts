import { it, expect } from 'vitest';
import { weeklyStarts } from '../../apps/api/src/care/calendar';
import { iqdToMinor } from '../../packages/contracts/src';
it('يولد الدوام بتوقيت بغداد ويترك مدة الخدمة والفاصل داخل الدوام', () => {
  const slots = weeklyStarts('2026-10-21', '2026-11-04', 3, 540, 780, 30, 15);
  expect(slots).toHaveLength(15);
  expect(slots[0]).toBe('2026-10-21T06:00:00.000Z');
  expect(slots[4]).toBe('2026-10-21T09:00:00.000Z');
  expect(new Set(slots).size).toBe(slots.length);
  for (const s of slots) {
    const d = new Date(Date.parse(s) + 3 * 3600000);
    expect(d.getUTCDay()).toBe(3);
    expect(d.getUTCHours() * 60 + d.getUTCMinutes() + 45).toBeLessThanOrEqual(
      780,
    );
  }
});
it('يرفض نطاقًا مقلوبًا أو كبيرًا وقيم مدة غير آمنة', () => {
  expect(() =>
    weeklyStarts('2026-11-01', '2026-10-01', 1, 540, 780, 30, 15),
  ).toThrow();
  expect(() =>
    weeklyStarts('2026-01-01', '2026-12-31', 1, 540, 780, 30, 15),
  ).toThrow();
  expect(() =>
    weeklyStarts('2026-01-01', '2026-01-01', 1, 540, 780, 0, 0),
  ).toThrow();
});
it('يحول الدينار والوحدات الصغرى دون حساب عائم أو فقد كسور', () => {
  expect(iqdToMinor('0.001')).toBe('1');
  expect(iqdToMinor('123.456')).toBe('123456');
  expect(iqdToMinor('999999999.999')).toBe('999999999999');
  for (const input of ['1.0001', '1e5', '-1', 'NaN', '01', '1000000000'])
    expect(() => iqdToMinor(input)).toThrow();
});
