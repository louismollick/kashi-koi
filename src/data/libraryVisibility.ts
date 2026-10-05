import { getSong, libraryStore } from '@/store/libraryStore';
import type { Album, Artist, ReviewMix, Song } from '@/types/domain';

/** A hidden song lacks synced lyrics while the global hide setting is on. */
export function isHiddenSong(song: Song, hideSongsWithoutSyncedLyrics: boolean) {
  return hideSongsWithoutSyncedLyrics && song.lyricsStatus !== 'synced';
}

/** Use for browsing, Recently played and queue candidates in their existing order. */
export function getVisibleSongs(source: Song[], hideSongsWithoutSyncedLyrics: boolean) {
  return source.filter(song => !isHiddenSong(song, hideSongsWithoutSyncedLyrics));
}

/** Cover badges use the whole album or artist, regardless of the current search. */
export function albumHasSyncedLyrics(albumId: string, source = libraryStore.getState().songs) {
  return source.some(song => song.albumId === albumId && song.lyricsStatus === 'synced');
}

export function artistHasSyncedLyrics(artistId: string, source = libraryStore.getState().songs) {
  return source.some(song => song.artistId === artistId && song.lyricsStatus === 'synced');
}

/** Display visible mix counts without changing the indices used by transport. */
export function getReviewMixProgress(mix: ReviewMix, hideSongsWithoutSyncedLyrics: boolean) {
  const queue = mix.songIds.map(getSong).filter((song): song is Song => !!song);
  return {
    position: getVisibleSongs(queue.slice(0, mix.index + 1), hideSongsWithoutSyncedLyrics).length,
    total: getVisibleSongs(queue, hideSongsWithoutSyncedLyrics).length,
  };
}

/** Albums need visible songs; artists need visible albums. */
export function getVisibleLibrary(hideSongsWithoutSyncedLyrics: boolean, source: { songs: Song[]; albums: Album[]; artists: Artist[] } = libraryStore.getState()) {
  const visibleSongs = getVisibleSongs(source.songs, hideSongsWithoutSyncedLyrics);
  const albumIds = new Set(visibleSongs.map(song => song.albumId));
  const visibleAlbums = source.albums.filter(album => albumIds.has(album.id));
  const artistIds = new Set(visibleAlbums.map(album => album.artistId));
  const visibleArtists = source.artists.filter(artist => artistIds.has(artist.id));
  return { songs: visibleSongs, albums: visibleAlbums, artists: visibleArtists };
}

/** Fill the short Home shortcut list from the visible recent order. */
export function getRecentlyPlayed(hideSongsWithoutSyncedLyrics: boolean, limit: number, source = libraryStore.getState().songs) {
  return getVisibleSongs(source, hideSongsWithoutSyncedLyrics).filter(song => song.played).sort((a, b) => b.played! - a.played!).slice(0, limit);
}
