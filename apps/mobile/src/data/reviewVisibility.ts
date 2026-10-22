import { useMemo } from 'react';
import { appStore } from '@/store/appStore';
import { downloadStore } from '@/downloads/store';

/** Subscribe to both availability and stored schedules without removing offline-hidden review entries. */
export function useAvailableReviewList() {
  const list = appStore((state) => state.reviewList),
    offline = appStore((state) => state.offlineMode);
  // Online, download progress can't change the list, so don't subscribe to it.
  const entries = downloadStore((state) => (offline ? state.entries : null));
  return useMemo(
    () => (entries ? list.filter((item) => entries[item.songId]?.status === 'done') : list),
    [list, entries],
  );
}
