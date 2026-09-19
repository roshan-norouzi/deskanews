import { useEffect } from 'react';

/** Runs callback on an interval only while the browser tab is visible. */
export function useVisibleInterval(callback: () => void, intervalMs: number) {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        callback();
      }
    };
    tick();
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [callback, intervalMs]);
}
