'use client';
import { useEffect } from 'react';
import type { DriverHome } from '@petra/contracts';

// A visible workspace polls authorized server data; no location is collected.
export function useDriverUpdates(
  enabled: boolean,
  update: (home: DriverHome) => void,
  revoke: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    let live = true,
      revoked = false,
      controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!live || revoked || document.visibilityState !== 'visible') return;
      const request = new AbortController();
      controller = request;
      const deadline = setTimeout(() => request.abort(), 10000);
      try {
        const response = await fetch('/api/v1/driver/home', {
          cache: 'no-store',
          signal: request.signal,
        });
        if (!live || request.signal.aborted) return;
        if ([401, 403, 404].includes(response.status)) {
          revoked = true;
          revoke();
          return;
        }
        if (response.ok) {
          const home = (await response.json()) as DriverHome;
          if (live && !request.signal.aborted) update(home);
        }
      } catch {
        // A transient failure keeps the last view; expired offers are hidden.
      } finally {
        clearTimeout(deadline);
        if (controller === request) {
          controller = undefined;
          if (live && !revoked && document.visibilityState === 'visible')
            timer = setTimeout(() => void refresh(), 5000);
        }
      }
    };
    const visible = () => {
      if (timer) clearTimeout(timer);
      controller?.abort();
      controller = undefined;
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    void refresh();
    return () => {
      live = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
    };
  }, [enabled, update, revoke]);
}
