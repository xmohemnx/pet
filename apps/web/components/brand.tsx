import { PawPrint } from 'lucide-react';
import Link from 'next/link';
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? 'brand-light' : ''}`}
      aria-label="Petra — الصفحة الرئيسية"
    >
      <span className="brand-symbol">
        <PawPrint size={26} strokeWidth={2} />
      </span>
      <span lang="en" dir="ltr">
        petra<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
