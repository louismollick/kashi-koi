import { useSyncExternalStore } from 'react';

/** The desktop layout (browse column, harbor pane, now playing bar) starts here; below it the app is the phone layout. */
export const desktopQuery = '(min-width: 1024px)';

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(desktopQuery).matches);
}
