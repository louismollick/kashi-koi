import { useEffect, useState } from 'react';

/**
 * Render time for due checks, refreshed when the tab becomes visible again so lines that came due show up, and at
 * midnight so day labels like "next due tomorrow" roll over.
 */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), new Date(now).setHours(24, 0, 0, 0) - now);
    return () => clearTimeout(timer);
  }, [now]);
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return now;
}
