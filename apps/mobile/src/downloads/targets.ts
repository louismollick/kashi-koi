import { hasJapaneseLyrics } from '@/data/libraryVisibility';
import { libraryStore } from '@/store/libraryStore';
import type { Song } from '@/types/domain';
import type { DownloadTarget } from './store';

/** Artist targets follow album ownership, including songs credited to another artist. */
export function targetSongs(target: DownloadTarget): Song[] {
  const { songs, albums, bySong } = libraryStore.getState();
  if (target.kind === 'song') return bySong[target.id] ? [bySong[target.id]!] : [];
  if (target.kind === 'album') return songs.filter((song) => song.albumId === target.id);
  if (target.kind === 'library') return songs;
  const ids = new Set(albums.filter((album) => album.artistId === target.id).map((album) => album.id));
  return songs.filter((song) => ids.has(song.albumId));
}

/** Eligibility ignores browsing filters: synced Japanese lyrics are always required. */
export const eligibleSongs = (target: DownloadTarget) =>
  targetSongs(target).filter((song) => hasJapaneseLyrics(song.id));
