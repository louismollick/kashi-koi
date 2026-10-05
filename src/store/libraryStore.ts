import { create } from 'zustand';
import type { Album, Artist, Line, LyricsStatus, Song, SongLyrics } from '@/types/domain';

export type Library = { songs: Song[]; albums: Album[]; artists: Artist[]; lyrics: Record<string, SongLyrics> };
export type Progress = { kind: 'sync' | 'scan'; completed: number; total: number };
const empty: Library = { songs: [], albums: [], artists: [], lyrics: {} };
const emptyLyrics = (songId: string): SongLyrics => ({ songId, lines: [], timeline: [] });

/** The in-memory library is seeded from SQLite at boot, or fixtures in Node tests. */
export const libraryStore = create<Library & {
  bySong: Record<string, Song>; byAlbum: Record<string, Album>; byArtist: Record<string, Artist>;
  progress: Progress | null; error: string | null;
  setLibrary: (library: Library) => void;
  setLyricsResult: (songId: string, status: LyricsStatus, lyrics?: SongLyrics) => void;
  markPlayed: (songId: string, at?: number) => void;
} >((set, get) => ({
  ...empty, bySong: {}, byAlbum: {}, byArtist: {}, progress: null, error: null,
  setLibrary: library => set({ ...library, bySong: Object.fromEntries(library.songs.map(song => [song.id, song])), byAlbum: Object.fromEntries(library.albums.map(album => [album.id, album])), byArtist: Object.fromEntries(library.artists.map(artist => [artist.id, artist])) }),
  setLyricsResult: (songId, status, lyrics) => {
    const song = get().bySong[songId];
    if (!song || status === 'error' && song.lyricsStatus === 'synced' && get().lyrics[songId]) return;
    const updated = { ...song, lyricsStatus: status };
    const nextLyrics = { ...get().lyrics };
    if (status === 'none') delete nextLyrics[songId]; else if (lyrics) nextLyrics[songId] = lyrics;
    set({ songs: get().songs.map(song => song.id === songId ? updated : song), bySong: { ...get().bySong, [songId]: updated }, lyrics: nextLyrics });
  },
  markPlayed: (songId, at = Date.now()) => {
    const song = get().bySong[songId];
    if (!song) return;
    const updated = { ...song, played: at };
    set({ songs: get().songs.map(song => song.id === songId ? updated : song), bySong: { ...get().bySong, [songId]: updated } });
  },
}));

export const getSong = (id: string | null) => id ? libraryStore.getState().bySong[id] : undefined;
export const getAlbum = (id: string) => libraryStore.getState().byAlbum[id];
export const getArtist = (id: string) => libraryStore.getState().byArtist[id];
export const getLyrics = (id: string | null) => id ? libraryStore.getState().lyrics[id] ?? emptyLyrics(id) : emptyLyrics('');
export const getAlbumSongs = (id: string) => libraryStore.getState().songs.filter(song => song.albumId === id).sort((a, b) => (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 0) - (b.track ?? 0));
export const getArtistAlbums = (id: string) => libraryStore.getState().albums.filter(album => album.artistId === id).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
export const getLineText = (line: Line) => line.segments.map(segment => segment.text).join('');
export const hasMeanings = (id: string | null) => { const lines = getLyrics(id).lines; return !!lines.length && lines.every(line => !!line.meaning); };
export const occurrenceLine = (id: string | null, index: number) => { const lyrics = getLyrics(id); return lyrics.lines.find(line => line.id === lyrics.timeline[index]?.lineId); };
export function getAnswers(song: Song, index: number) {
  const lines = getLyrics(song.id).lines, line = occurrenceLine(song.id, index);
  const distinctIndex = lines.findIndex(item => item.id === line?.id);
  return [lines[(distinctIndex + 2) % lines.length]?.meaning ?? '', line?.meaning ?? '', lines[(distinctIndex + lines.length - 1) % lines.length]?.meaning ?? ''];
}

/** Carry only cached results for songs that still exist; retry errors next scan. */
export function carryLyrics(library: Omit<Library, 'lyrics'>, previous: Library): Library {
  const oldSongs = new Map(previous.songs.map(song => [song.id, song]));
  const songs = library.songs.map(song => ({ ...song, lyricsStatus: oldSongs.get(song.id)?.lyricsStatus ?? 'unchecked' as const, played: Math.max(song.played ?? 0, oldSongs.get(song.id)?.played ?? 0) || undefined }));
  const ids = new Set(songs.map(song => song.id));
  return { ...library, songs, lyrics: Object.fromEntries(Object.entries(previous.lyrics).filter(([id]) => ids.has(id))) };
}
