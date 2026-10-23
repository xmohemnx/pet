import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="error-page">
      <Link href="/" className="recovery-brand">
        Petra
      </Link>
      <h1>يبدو أننا سلكنا طريقًا آخر.</h1>
      <p>
        قد يكون الرابط غير صحيح أو تغيّر عنوان الصفحة. يمكنك العودة إلى الرئيسية
        أو فتح مساحتك.
      </p>
      <Link href="/" className="button primary">
        العودة للصفحة الرئيسية
      </Link>
      <Link href="/app">افتح مساحتي</Link>
    </main>
  );
}
