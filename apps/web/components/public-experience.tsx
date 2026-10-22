'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// The editorial content stays server rendered. Motion is a deferred enhancement.
const Motion = dynamic(
  () => import('./public-motion').then((module) => module.PublicMotion),
  { ssr: false },
);

export function PublicExperience({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const update = () => setEnhanced(!reduced.matches && !connection?.saveData);
    update();
    reduced.addEventListener('change', update);
    return () => reduced.removeEventListener('change', update);
  }, []);
  return (
    <div className="petra-public" ref={root}>
      {children}
      {enhanced && <Motion scope={root} />}
    </div>
  );
}
