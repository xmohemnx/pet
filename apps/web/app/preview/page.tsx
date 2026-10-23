import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Brand } from '../../components/brand';
import { isWebPreview } from '../../lib/web-preview';

export default function Preview() {
  if (!isWebPreview()) notFound();
  return (
    <main id="main" className="preview-explanation">
      <Brand />
      <h1>هذه نسخة لمعاينة الواجهة.</h1>
      <p>
        يمكنك استكشاف الصفحة الرئيسية وتصميم صفحات الدخول والتسجيل. الحسابات
        والحجوزات والرسائل والمدفوعات وحفظ البيانات غير مفعّلة في هذه النسخة.
      </p>
      <Link href="/" className="button primary">
        العودة إلى الرئيسية
      </Link>
    </main>
  );
}
