import { useMemo } from 'react';
import { appStore } from '@/store/appStore';
import { downloadStore } from '@/downloads/store';
import type { ReviewList } from '@/types/domain';
import { isSongAvailable } from './libraryVisibility';

/** UI review sections and badges should count this list, preserving unavailable entries in storage. */
export const availableReviewList = (list: ReviewList) => list.filter((item) => isSongAvailable(item.songId));

/** Subscribe to both availability and stored schedules without removing offline-hidden review entries. */
export function useAvailableReviewList() {
  const list = appStore((state) => state.reviewList),
    offline = appStore((state) => state.offlineMode);
  const entries = downloadStore((state) => state.entries);
  return useMemo(
    () => (offline ? list.filter((item) => entries[item.songId]?.status === 'done') : list),
    [list, offline, entries],
  );
}
