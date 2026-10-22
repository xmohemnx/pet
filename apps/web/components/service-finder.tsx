'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';

const needs = [
  {
    label: 'رعاية صحية',
    href: '/care/directory',
    detail: 'استكشف دليل الأطباء والعيادات وأوقات الحجز المنشورة.',
  },
  {
    label: 'مستلزمات رفيقي',
    href: '/marketplace',
    detail: 'تصفّح منتجات متاجر العيادات، واختر ما يناسب رفيقك.',
  },
  {
    label: 'رحلة آمنة',
    href: '/taxi',
    detail: 'خطّط لنقل حيوانك، وراجع تفاصيل الرحلة قبل طلبها.',
  },
  {
    label: 'مجتمع يهتم',
    href: '/social',
    detail: 'شارك لحظاتكم، وتواصل مع أشخاص يجمعهم حبّ الحيوانات.',
  },
] as const;

export function ServiceFinder() {
  const [selected, setSelected] = useState(0);
  const need = needs[selected]!;
  return (
    <div className="petra-finder">
      <div>
        <label htmlFor="petra-need">ماذا يحتاج رفيقك اليوم؟</label>
        <p aria-live="polite">{need.detail}</p>
      </div>
      <div className="petra-finder-controls">
        <select
          id="petra-need"
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
        >
          {needs.map((item, index) => (
            <option value={index} key={item.href}>
              {item.label}
            </option>
          ))}
        </select>
        <Link className="button primary" href={need.href}>
          استكشف الخدمة <ArrowUpLeft size={19} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
