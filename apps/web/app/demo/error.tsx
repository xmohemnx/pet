'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <h1>تعذر تحميل العرض التجريبي</h1>
      <p>تأكد من تشغيل API وتفعيل وضع التصميم في الخدمتين، ثم أعد المحاولة.</p>
      <button className="button primary" onClick={reset}>
        إعادة المحاولة
      </button>
      <Link href="/">العودة للرئيسية</Link>
    </main>
  );
}
