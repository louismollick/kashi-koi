import { useEffect, useState } from 'react';

/** Render time for due checks, refreshed when the tab becomes visible again so lines that came due show up. */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return now;
}
