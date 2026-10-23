'use client';
import Link from 'next/link';
import { ConnectionStatus } from '../components/connection-status';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" tabIndex={-1} className="error-page">
      <ConnectionStatus />
      <Link href="/" className="recovery-brand">
        Petra
      </Link>
      <h1>تعذر تحميل هذه المساحة.</h1>
      <p>لم نتمكن من جلب البيانات الآن. أعد المحاولة، أو عد للصفحة الرئيسية.</p>
      <button type="button" className="button primary" onClick={reset}>
        إعادة المحاولة
      </button>
      <Link href="/">العودة للرئيسية</Link>
    </main>
  );
}
