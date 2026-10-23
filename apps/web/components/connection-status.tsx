'use client';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <p className="connection-status" role="status">
      <WifiOff size={20} aria-hidden="true" />
      أنت غير متصل. تحقق من اتصالك؛ لا تعتبر تغييراتك محفوظة حتى يظهر تأكيدها.
    </p>
  );
}
