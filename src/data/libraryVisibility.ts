import { albums, artists, getSong, songs } from './fakeData';
import type { Album, Artist, ReviewMix, Song } from '@/types/domain';

/** A hidden song lacks synced lyrics while the global hide setting is on. */
export function isHiddenSong(song: Song, hideSongsWithoutSyncedLyrics: boolean) {
  return hideSongsWithoutSyncedLyrics && !song.hasLyrics;
}

/** Use for browsing, Recently played and queue candidates in their existing order. */
export function getVisibleSongs(source: Song[], hideSongsWithoutSyncedLyrics: boolean) {
  return source.filter(song => !isHiddenSong(song, hideSongsWithoutSyncedLyrics));
}

/** Cover badges use the whole album or artist, regardless of the current search. */
export function albumHasSyncedLyrics(albumId: string, source = songs) {
  return source.some(song => song.albumId === albumId && song.hasLyrics);
}

export function artistHasSyncedLyrics(artistId: string, source = songs) {
  return source.some(song => song.artistId === artistId && song.hasLyrics);
}

/** Display visible mix counts without changing the indices used by transport. */
export function getReviewMixProgress(mix: ReviewMix, hideSongsWithoutSyncedLyrics: boolean) {
  const queue = mix.songIds.map(getSong);
  return {
    position: getVisibleSongs(queue.slice(0, mix.index + 1), hideSongsWithoutSyncedLyrics).length,
    total: getVisibleSongs(queue, hideSongsWithoutSyncedLyrics).length,
  };
}

/** Albums need visible songs; artists need visible albums. */
export function getVisibleLibrary(hideSongsWithoutSyncedLyrics: boolean, source: { songs: Song[]; albums: Album[]; artists: Artist[] } = { songs, albums, artists }) {
  const visibleSongs = getVisibleSongs(source.songs, hideSongsWithoutSyncedLyrics);
  const visibleAlbums = source.albums.filter(album => visibleSongs.some(song => song.albumId === album.id));
  const visibleArtists = source.artists.filter(artist => visibleAlbums.some(album => album.artistId === artist.id));
  return { songs: visibleSongs, albums: visibleAlbums, artists: visibleArtists };
}

/** Fill the short Home shortcut list from the visible recent order. */
export function getRecentlyPlayed(hideSongsWithoutSyncedLyrics: boolean, limit: number, source = songs) {
  return getVisibleSongs(source, hideSongsWithoutSyncedLyrics).slice(0, limit);
}
