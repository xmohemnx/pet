'use client';

import { createContext, type ReactNode } from 'react';

export const WebPreviewContext = createContext(false);

export function WebPreview({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <WebPreviewContext.Provider value={enabled}>
      {enabled && (
        <aside className="preview-banner" aria-label="حالة المعاينة">
          معاينة واجهة Petra — تسجيل الدخول والحجوزات والعمليات غير متاحة
          حالياً.
        </aside>
      )}
      {children}
    </WebPreviewContext.Provider>
  );
}
