import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { downloadStore, isDownloaded } from '../downloads/store';
import { libraryStore } from '../store/libraryStore';
import { settingsStore } from '../store/settingsStore';
import type { Album, Artist, Song } from '../types/domain';

export type LibraryFilters = {
  hideUnsynced: boolean;
  hideNonJapanese: boolean;
  downloadedOnly?: boolean;
  /** Count lyric-hidden songs against the downloaded set without counting unavailable songs. */
  countHiddenOnly?: boolean;
};
export const isSongAvailable = (songId: string) => !settingsStore.getState().offlineMode || isDownloaded(songId);

/** Share the same filter mapping between queue actions and component selectors. */
const filtersFromSettings = (state: ReturnType<typeof settingsStore.getState>): LibraryFilters => ({
  downloadedOnly: state.offlineMode,
  hideUnsynced: state.hideSongsWithoutSyncedLyrics,
  hideNonJapanese: state.hideSongsWithoutJapanese,
});

/** The current settings as filters, for code outside React. */
export const getLibraryFilters = () => filtersFromSettings(settingsStore.getState());

/** In offline mode, download changes invalidate memoized browsing; online they don't affect visibility. */
export function useLibraryFilters() {
  const filters = settingsStore(useShallow(filtersFromSettings));
  const entries = downloadStore((state) => (filters.downloadedOnly ? state.entries : null));
  return useMemo(() => ({ ...filters, downloadEntries: entries }), [filters, entries]);
}

/** Synced lyrics with a Japanese line, read from the flag derived with the lyrics. */
export function hasJapaneseLyrics(songId: string) {
  const state = libraryStore.getState();
  return state.bySong[songId]?.lyricsStatus === 'synced' && !!state.lyrics[songId]?.hasJapanese;
}

/** Filters behind the "hidden" count: the active ones, or both when showing everything so the row can offer to hide again. */
export const countedFilters = (filters: LibraryFilters): LibraryFilters => ({
  ...filters,
  hideUnsynced: filters.hideUnsynced || !filters.hideNonJapanese,
  hideNonJapanese: filters.hideNonJapanese || !filters.hideUnsynced,
  countHiddenOnly: true,
});

/** Either enabled filter can hide a song. */
export function isHiddenSong(song: Song, filters: LibraryFilters) {
  if ((filters.downloadedOnly ?? settingsStore.getState().offlineMode) && !isDownloaded(song.id))
    return !filters.countHiddenOnly;
  return (
    (filters.hideUnsynced && song.lyricsStatus !== 'synced') ||
    (filters.hideNonJapanese && (song.lyricsStatus !== 'synced' || !hasJapaneseLyrics(song.id)))
  );
}

/** Use for browsing, Recently played and queue candidates in their existing order. */
export function getVisibleSongs(source: Song[], filters: LibraryFilters) {
  return source.filter((song) => !isHiddenSong(song, filters));
}

/** Albums need visible songs; artists need visible albums. */
export function getVisibleLibrary(
  filters: LibraryFilters,
  source: { songs: Song[]; albums: Album[]; artists: Artist[] } = libraryStore.getState(),
) {
  const visibleSongs = getVisibleSongs(source.songs, filters);
  const albumIds = new Set(visibleSongs.map((song) => song.albumId));
  const visibleAlbums = source.albums.filter((album) => albumIds.has(album.id));
  const artistIds = new Set(visibleAlbums.map((album) => album.artistId));
  const visibleArtists = source.artists.filter((artist) => artistIds.has(artist.id));
  return { songs: visibleSongs, albums: visibleAlbums, artists: visibleArtists };
}

/** Fill the short Home shortcut list from the visible recent order. */
export function getRecentlyPlayed(filters: LibraryFilters, limit: number, source = libraryStore.getState().songs) {
  return getVisibleSongs(source, filters)
    .filter((song) => song.played)
    .sort((a, b) => b.played! - a.played!)
    .slice(0, limit);
}

/** Count items per key in one pass, so grid tiles don't each rescan the whole library. */
export function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/** Group items per key in one pass, keeping their order. */
export function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

/** Album and artist ids with at least one synced song, for the cover badges. */
export function syncedIds(source: Song[]) {
  const albums = new Set<string>(),
    artists = new Set<string>();
  for (const song of source)
    if (song.lyricsStatus === 'synced') {
      albums.add(song.albumId);
      artists.add(song.artistId);
    }
  return { albums, artists };
}
