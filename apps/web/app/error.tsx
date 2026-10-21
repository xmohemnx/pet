'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <span className="eyebrow">نحتاج محاولة أخرى</span>
      <h1>تعذر تحميل هذه المساحة.</h1>
      <p>لم نتمكن من جلب البيانات الآن. أعد المحاولة، أو عد للصفحة الرئيسية.</p>
      <button className="button primary" onClick={reset}>
        إعادة المحاولة
      </button>
      <Link href="/">العودة للرئيسية</Link>
    </main>
  );
}
