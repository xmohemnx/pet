'use client';
import Link from 'next/link';
import { ConnectionStatus } from '../../components/connection-status';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="social-app social-empty">
      <ConnectionStatus />
      <h1>تعذّر الوصول إلى المجتمع الآن.</h1>
      <p>تحقق من الاتصال وحاول مجدداً. لم ننشر أو نغيّر شيئاً من هذه الشاشة.</p>
      <button type="button" className="social-button" onClick={reset}>
        إعادة المحاولة
      </button>
      <Link href="/app">العودة إلى مساحتي</Link>
    </main>
  );
}
