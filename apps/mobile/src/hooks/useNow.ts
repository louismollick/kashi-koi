import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Render time for due checks, refreshed when the app returns to the foreground so lines that came due show up. */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  return now;
}
