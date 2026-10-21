import { it, expect } from 'vitest';
import { variantMatrix } from '../../packages/contracts/src/index';

it('يولد كل التركيبات بترتيب ثابت ومؤشرات تبدأ بواحد وتسمية صريحة', () => {
  const matrix = variantMatrix([
    { name: 'اللون', values: ['أحمر', 'أزرق'] },
    { name: 'المقاس', values: ['صغير', 'كبير'] },
  ]);
  expect(matrix.choices.map((c) => c.indexes)).toEqual([
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
  ]);
  expect(matrix.choices[2]).toEqual({
    indexes: [2, 1],
    attributes: [
      { name: 'اللون', value: 'أزرق' },
      { name: 'المقاس', value: 'صغير' },
    ],
    label: 'اللون: أزرق · المقاس: صغير',
  });
});
it('يطبع Unicode والمسافات قبل اكتشاف القيم والأبعاد المكررة', () => {
  expect(
    variantMatrix([{ name: ' اللون ', values: [' أحمر '] }]).dimensions,
  ).toEqual([{ name: 'اللون', values: ['أحمر'] }]);
  expect(() =>
    variantMatrix([{ name: 'Size', values: ['S', 'Ｓ'] }]),
  ).toThrow();
  expect(() =>
    variantMatrix([
      { name: 'SIZE', values: ['S'] },
      { name: 'size', values: ['M'] },
    ]),
  ).toThrow();
  expect(() =>
    variantMatrix([{ name: 'لون', values: ['أحمر', ' أحمر '] }]),
  ).toThrow();
});
it('يقبل 64 تركيبة ويمنع الانفجار التجميعي قبل توليد القائمة', () => {
  const axis = (name: string, n: number) => ({
    name,
    values: Array.from({ length: n }, (_, i) => String(i)),
  });
  expect(variantMatrix([axis('أ', 8), axis('ب', 8)]).choices).toHaveLength(64);
  expect(() =>
    variantMatrix([axis('أ', 8), axis('ب', 8), axis('ج', 2)]),
  ).toThrow();
  expect(() => variantMatrix([axis('أ', 9)])).toThrow();
  expect(() =>
    variantMatrix([axis('أ', 1), axis('ب', 1), axis('ج', 1), axis('د', 1)]),
  ).toThrow();
});
it('يرفض الفراغ وعلامات التحكم والاتجاه والتسميات الأطول من حد هوية الخيار', () => {
  for (const value of ['', ' ', 'أ\nب', 'أ\u202eب'])
    expect(() => variantMatrix([{ name: 'لون', values: [value] }])).toThrow();
  expect(() => variantMatrix([])).toThrow();
  expect(() =>
    variantMatrix([
      { name: 'أ'.repeat(30), values: ['ب'.repeat(30)] },
      { name: 'ج'.repeat(30), values: ['د'.repeat(30)] },
    ]),
  ).toThrow();
});
