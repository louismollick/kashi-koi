import { isJapanese } from '@/japanese/text';
import { create } from 'zustand';
import type { Album, Artist, Line, LyricsStatus, Song, SongLyrics, ReviewList } from '@/types/domain';

export type Translations = Record<string, { translation: string; segments: Line['segments'] }>;
export type Library = {
  songs: Song[];
  albums: Album[];
  artists: Artist[];
  lyrics: Record<string, SongLyrics>;
  translations?: Translations;
};
export type Progress = { kind: 'sync' | 'scan'; completed: number; total: number };
const empty: Library = { songs: [], albums: [], artists: [], lyrics: {} };
const emptyLyrics = (songId: string): SongLyrics => ({ songId, lines: [], timeline: [] });

/** The in-memory library is seeded from SQLite at boot, or fixtures in Node tests. */
export const libraryStore = create<
  Library & {
    bySong: Record<string, Song>;
    byAlbum: Record<string, Album>;
    byArtist: Record<string, Artist>;
    progress: Progress | null;
    error: string | null;
    translations: Translations;
    translationStatus: 'installed' | 'supported' | 'unsupported' | null;
    translationProgress: { completed: number; total: number } | null;
    translationSongIds: Set<string>;
    translationError: string | null;
    applyTranslationsToSong: (songId: string, translations?: Translations) => void;
    setLibrary: (library: Library) => void;
    setLyricsResult: (songId: string, status: LyricsStatus, lyrics?: SongLyrics) => void;
    markPlayed: (songId: string, at?: number) => void;
  }
>((set, get) => ({
  ...empty,
  translations: {},
  translationStatus: null,
  translationProgress: null,
  translationSongIds: new Set(),
  translationError: null,
  bySong: {},
  byAlbum: {},
  byArtist: {},
  progress: null,
  error: null,
  setLibrary: (library) =>
    set({
      ...library,
      translations: library.translations ?? {},
      lyrics: applyTranslations(library.lyrics, library.translations ?? {}),
      bySong: Object.fromEntries(library.songs.map((song) => [song.id, song])),
      byAlbum: Object.fromEntries(library.albums.map((album) => [album.id, album])),
      byArtist: Object.fromEntries(library.artists.map((artist) => [artist.id, artist])),
    }),
  applyTranslationsToSong: (songId, translations = {}) => {
    const state = get(),
      song = state.lyrics[songId];
    // Grow the text cache in place; only the affected song and lines need new identities.
    Object.assign(state.translations, translations);
    if (!song) return;
    const updated = applySongTranslations(song, state.translations);
    if (updated !== song) set({ lyrics: { ...state.lyrics, [songId]: updated } });
  },
  setLyricsResult: (songId, status, lyrics) => {
    const song = get().bySong[songId];
    if (!song || (status === 'error' && song.lyricsStatus === 'synced' && get().lyrics[songId])) return;
    const updated = { ...song, lyricsStatus: status };
    const nextLyrics = { ...get().lyrics };
    if (status === 'none') delete nextLyrics[songId];
    else if (lyrics) nextLyrics[songId] = applySongTranslations(lyrics, get().translations);
    set({
      songs: get().songs.map((song) => (song.id === songId ? updated : song)),
      bySong: { ...get().bySong, [songId]: updated },
      lyrics: nextLyrics,
    });
  },
  markPlayed: (songId, at = Date.now()) => {
    const song = get().bySong[songId];
    if (!song) return;
    const updated = { ...song, played: at };
    set({
      songs: get().songs.map((song) => (song.id === songId ? updated : song)),
      bySong: { ...get().bySong, [songId]: updated },
    });
  },
}));

export const getSong = (id: string | null) => (id ? libraryStore.getState().bySong[id] : undefined);
export const getAlbum = (id: string) => libraryStore.getState().byAlbum[id];
export const getArtist = (id: string) => libraryStore.getState().byArtist[id];
export const getLyrics = (id: string | null) =>
  id ? (libraryStore.getState().lyrics[id] ?? emptyLyrics(id)) : emptyLyrics('');
export const getAlbumSongs = (id: string) =>
  libraryStore
    .getState()
    .songs.filter((song) => song.albumId === id)
    .sort((a, b) => (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 0) - (b.track ?? 0));
export const getArtistAlbums = (id: string) =>
  libraryStore
    .getState()
    .albums.filter((album) => album.artistId === id)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
export const getLineText = (line: Line) => line.segments.map((segment) => segment.text).join('');
export const japaneseLines = (id: string | null) => getLyrics(id).lines.filter((line) => isJapanese(getLineText(line)));
export const hasTranslations = (id: string | null) => {
  const lines = japaneseLines(id);
  return !!lines.length && lines.every((line) => !!line.translation);
};
/** New and missed lines are ready now; scheduled lines return at their due time. */
export const isDue = (line: ReviewList[number], now = Date.now()) => line.kind !== 'later' || line.dueAt <= now;
/** Due today excludes the separate new-from-listening group. */
export const dueLines = (list: ReviewList, now = Date.now()) =>
  list.filter((line) => line.kind !== 'new' && isDue(line, now));
/** Review actions need at least one Japanese line in a fully translated song. */
export const readyReviewLines = (list: ReviewList, now = Date.now()) =>
  list.filter(
    (item) =>
      isDue(item, now) &&
      hasTranslations(item.songId) &&
      japaneseLines(item.songId).some((line) => line.id === item.lineId),
  );
export const occurrenceLine = (id: string | null, index: number) => {
  const lyrics = getLyrics(id);
  return lyrics.lines.find((line) => line.id === lyrics.timeline[index]?.lineId);
};

/** Pick distinct same-song translations, then shuffle once when a line becomes current. */
export function getAnswers(song: Song, index: number, random = Math.random) {
  const line = occurrenceLine(song.id, index);
  if (!line?.translation || !isJapanese(getLineText(line))) return [];
  const others = [
    ...new Set(
      japaneseLines(song.id)
        .map((item) => item.translation)
        .filter((text): text is string => !!text && text !== line.translation),
    ),
  ];
  const shuffle = (texts: string[]) => {
    for (let i = texts.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [texts[i], texts[j]] = [texts[j]!, texts[i]!];
    }
    return texts;
  };
  return shuffle([line.translation, ...shuffle(others).slice(0, 2)]);
}

/** Reuse translations by Japanese text after loading or rescanning lyrics. */
function applyTranslations(lyrics: Library['lyrics'], translations: Translations): Library['lyrics'] {
  return Object.fromEntries(
    Object.entries(lyrics).map(([id, song]) => [id, applySongTranslations(song, translations)]),
  );
}
function applySongTranslations(song: SongLyrics, translations: Translations): SongLyrics {
  const lines = song.lines.map((line) => {
    const cached = translations[getLineText(line)];
    return cached && (line.translation !== cached.translation || line.segments !== cached.segments)
      ? { ...line, ...cached }
      : line;
  });
  return lines.some((line, index) => line !== song.lines[index]) ? { ...song, lines } : song;
}

/** Carry only cached results for songs that still exist; retry errors next scan. */
export function carryLyrics(library: Omit<Library, 'lyrics'>, previous: Library): Library {
  const oldSongs = new Map(previous.songs.map((song) => [song.id, song]));
  const songs = library.songs.map((song) => ({
    ...song,
    lyricsStatus: oldSongs.get(song.id)?.lyricsStatus ?? ('unchecked' as const),
    played: Math.max(song.played ?? 0, oldSongs.get(song.id)?.played ?? 0) || undefined,
  }));
  const ids = new Set(songs.map((song) => song.id));
  return {
    ...library,
    translations: previous.translations,
    songs,
    lyrics: Object.fromEntries(Object.entries(previous.lyrics).filter(([id]) => ids.has(id))),
  };
}
