import { isJapanese } from '@/japanese/text';
import { getLineText, libraryStore } from '@/store/libraryStore';
import type { Album, Artist, Song } from '@/types/domain';

export type LibraryFilters = { hideUnsynced: boolean; hideNonJapanese: boolean };

/** Stop at the first Japanese line without allocating a filtered list. */
export function hasJapaneseLyrics(songId: string) {
  const state = libraryStore.getState();
  return (
    state.bySong[songId]?.lyricsStatus === 'synced' &&
    !!state.lyrics[songId]?.lines.some((line) => isJapanese(getLineText(line)))
  );
}

/** Filters behind the "hidden" count: the active ones, or both when showing everything so the row can offer to hide again. */
export const countedFilters = (filters: LibraryFilters): LibraryFilters =>
  filters.hideUnsynced || filters.hideNonJapanese ? filters : { hideUnsynced: true, hideNonJapanese: true };

/** Either enabled filter can hide a song. */
export function isHiddenSong(song: Song, filters: LibraryFilters) {
  return (
    (filters.hideUnsynced && song.lyricsStatus !== 'synced') ||
    (filters.hideNonJapanese && (song.lyricsStatus !== 'synced' || !hasJapaneseLyrics(song.id)))
  );
}

/** Use for browsing, Recently played and queue candidates in their existing order. */
export function getVisibleSongs(source: Song[], filters: LibraryFilters) {
  return source.filter((song) => !isHiddenSong(song, filters));
}

/** Cover badges use the whole album or artist, regardless of the current search. */
export function albumHasSyncedLyrics(albumId: string, source = libraryStore.getState().songs) {
  return source.some((song) => song.albumId === albumId && song.lyricsStatus === 'synced');
}

export function artistHasSyncedLyrics(artistId: string, source = libraryStore.getState().songs) {
  return source.some((song) => song.artistId === artistId && song.lyricsStatus === 'synced');
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
