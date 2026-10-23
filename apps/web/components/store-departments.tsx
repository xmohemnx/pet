'use client';
import { useState, useEffect } from 'react';
import { Boxes, ChevronLeft, Grid2X2 } from 'lucide-react';
import type { Product } from '@petra/contracts';
import { api } from '../lib/auth-client';
import type { Category } from './catalog-taxonomy';
export function StoreDepartments({
  onResults,
  clinicId,
  externalSearch = false,
}: {
  onResults: (p: Product[] | null) => void;
  clinicId?: string;
  externalSearch?: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {
    if (externalSearch) setSelected('');
  }, [externalSearch]);
  async function load() {
    try {
      const next = await api<Category[]>('marketplace/categories');
      setCategories(
        clinicId ? next.filter((c) => c.clinic_id === clinicId) : next,
      );
      setError('');
    } catch {
      setError('تعذر تحميل أقسام المتجر. أعد المحاولة.');
    }
  }
  useEffect(() => {
    void load();
  }, [clinicId]);
  async function choose(id: string) {
    setBusy(true);
    setError('');
    try {
      onResults(
        id
          ? await api<Product[]>(`marketplace/search?q=&categoryId=${id}`)
          : null,
      );
      setSelected(id);
      setFailedId(null);
    } catch {
      setFailedId(id);
      setError('تعذر تحميل منتجات القسم. أعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="store-departments">
      <div className="dashboard-section-title">
        <Boxes size={23} aria-hidden="true" />
        <h2>تسوّق حسب القسم</h2>
      </div>
      {error && (
        <p role="alert">
          {error}{' '}
          <button
            className="text-link"
            onClick={() => (failedId !== null ? choose(failedId) : load())}
          >
            إعادة المحاولة
          </button>
        </p>
      )}
      <nav aria-label="أقسام المتجر">
        <button
          aria-pressed={!selected && !externalSearch}
          disabled={busy}
          onClick={() => choose('')}
        >
          <Grid2X2 size={20} aria-hidden="true" />
          كل المنتجات
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            aria-pressed={selected === c.id}
            disabled={busy}
            onClick={() => choose(c.id)}
          >
            <Boxes size={20} aria-hidden="true" />
            <span>{c.names?.join(' / ') ?? c.name}</span>
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
        ))}
      </nav>
      {!categories.length && !error && (
        <p>تظهر الأقسام التي تحتوي منتجات منشورة من متاجر العيادات.</p>
      )}
    </section>
  );
}
