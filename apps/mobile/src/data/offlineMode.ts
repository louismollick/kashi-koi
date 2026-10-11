let read = () => false;

/** The app injects its persisted setting without introducing store import cycles. */
export function setOfflineModeReader(next: () => boolean) {
  read = next;
}
export const isOfflineMode = () => read();
