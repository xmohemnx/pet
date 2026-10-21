import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="error-page">
      <span className="eyebrow">Petra · 404</span>
      <h1>يبدو أننا سلكنا طريقًا آخر.</h1>
      <p>هذه الصفحة غير موجودة، أو أن العرض التجريبي غير مفعّل.</p>
      <Link href="/" className="button primary">
        العودة للصفحة الرئيسية
      </Link>
    </main>
  );
}
