import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Render time for due checks, refreshed when the app returns to the foreground so lines that came due show up, and at
 * midnight so day labels like "next due tomorrow" roll over.
 */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), new Date(now).setHours(24, 0, 0, 0) - now);
    return () => clearTimeout(timer);
  }, [now]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  return now;
}
