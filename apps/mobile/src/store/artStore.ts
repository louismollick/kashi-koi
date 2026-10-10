import { create } from 'zustand';
import { Image } from 'expo-image';

/** Transient generation shared by mounted covers. */
export const artStore = create(() => ({ version: 0 }));

/** Remount covers after clearing both native image caches. */
export async function refreshAlbumArt() {
  const cleared = await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]);
  artStore.setState((state) => ({ version: state.version + 1 }));
  if (cleared.some((success) => !success)) throw new Error('Could not clear album art cache');
}
