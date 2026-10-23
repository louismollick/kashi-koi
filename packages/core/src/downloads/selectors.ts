import { useShallow } from 'zustand/react/shallow';
import { libraryStore } from '../store/libraryStore';
import { hasJapaneseLyrics } from '../data/libraryVisibility';
import type { Song } from '../types/domain';
import { downloadStore, type DownloadTarget } from './store';

type LibraryState = ReturnType<typeof libraryStore.getState>;

type Summary = { eligible: number; done: number; pending: number; failed: number };
const empty: Summary = { eligible: 0, done: 0, pending: 0, failed: 0 };
let cached:
  | {
      songs: Song[];
      byAlbum: LibraryState['byAlbum'];
      bySong: LibraryState['bySong'];
      entries: ReturnType<typeof downloadStore.getState>['entries'];
      summaries: Map<string, Summary>;
    }
  | undefined;
const keyOf = (target: DownloadTarget) => (target.kind === 'library' ? 'library' : `${target.kind}:${target.id}`);

/** Build song, album, artist and library counts together once per state change. */
export function downloadSummary(target: DownloadTarget): Summary {
  const library = libraryStore.getState(),
    { entries } = downloadStore.getState();
  // Key on the fields this reads. Eligibility (Japanese lyrics) changes only with `songs`; progress and translation updates replace `library` without touching them.
  if (
    !cached ||
    cached.songs !== library.songs ||
    cached.byAlbum !== library.byAlbum ||
    cached.bySong !== library.bySong ||
    cached.entries !== entries
  ) {
    const summaries = new Map<string, Summary>();
    for (const song of library.songs) {
      if (!hasJapaneseLyrics(song.id)) continue;
      const keys = ['library', `song:${song.id}`, `album:${song.albumId}`];
      const artistId = library.byAlbum[song.albumId]?.artistId;
      if (artistId) keys.push(`artist:${artistId}`);
      for (const key of keys) {
        const summary = summaries.get(key) ?? { ...empty },
          status = entries[song.id]?.status;
        summary.eligible++;
        if (status === 'done') summary.done++;
        else if (status === 'failed') summary.failed++;
        else if (status) summary.pending++;
        summaries.set(key, summary);
      }
    }
    cached = {
      songs: library.songs,
      byAlbum: library.byAlbum,
      bySong: library.bySong,
      entries,
      summaries,
    };
  }
  return cached.summaries.get(keyOf(target)) ?? empty;
}

export function useDownloadSummary(target: DownloadTarget) {
  libraryStore((state) => state.songs);
  libraryStore((state) => state.albums);
  downloadStore((state) => state.entries);
  return downloadSummary(target);
}
export const useIsDownloaded = (songId: string) => downloadStore((state) => state.entries[songId]?.status === 'done');
export const useDownloadProgress = () => downloadStore((state) => state.progress);
export function useDownloadStorage() {
  return downloadStore(
    useShallow(({ entries, art }) => ({
      songs: Object.values(entries).filter((entry) => entry.status === 'done').length,
      bytes:
        Object.values(entries).reduce((sum, entry) => sum + (entry.status === 'done' ? (entry.bytes ?? 0) : 0), 0) +
        Object.values(art).reduce((sum, entry) => sum + entry.bytes, 0),
    })),
  );
}
