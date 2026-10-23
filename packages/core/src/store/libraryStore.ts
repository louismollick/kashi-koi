import { withSentences, type LyricsInput } from '@/lyrics/sentences';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import { create } from 'zustand';
import type { Album, Artist, Line, LyricsStatus, Playlist, Song, SongLyrics, ReviewList } from '@/types/domain';

export type Translations = Record<string, { translation: string; segments: Line['segments'] }>;
export type Library = {
  songs: Song[];
  albums: Album[];
  artists: Artist[];
  /** Missing in fixtures and before the first sync that fetched playlists. */
  playlists?: Playlist[];
  lyrics: Record<string, SongLyrics>;
  translations?: Translations;
  analyses?: Record<string, SongAnalysis>;
};
/** A library as loaded from SQLite: lyrics are raw input that `setLibrary` derives sentences for. */
export type LibraryInput = Omit<Library, 'lyrics'> & { lyrics: Record<string, LyricsInput> };
export type LyricsResult = { songId: string; status: LyricsStatus; lyrics?: LyricsInput };
export type Progress = { kind: 'sync' | 'scan'; completed: number; total: number };
const empty: Library = { songs: [], albums: [], artists: [], lyrics: {} };
/** Shared by every song without lyrics (and by no song at all), so reads never rebuild it. */
const emptyLyrics = withSentences({ songId: '', lines: [], timeline: [] });

/**
 * The in-memory library is seeded from SQLite at boot, or fixtures in Node tests.
 *
 * Visibility (Hidden song) depends on each song's `lyricsStatus` and whether its lyrics have Japanese. Both change
 * only in `setLibrary` and `setLyricsResults`, which replace `songs` too. Translation and analysis updates replace
 * `lyrics` alone, so visibility consumers subscribe to `songs` and never to `lyrics`.
 */
export const libraryStore = create<
  Library & {
    playlists: Playlist[];
    bySong: Record<string, Song>;
    byAlbum: Record<string, Album>;
    byArtist: Record<string, Artist>;
    progress: Progress | null;
    error: string | null;
    translations: Translations;
    analyses: Record<string, SongAnalysis>;
    setAnalysis: (analysis: SongAnalysis) => void;
    translationStatus: 'installed' | 'supported' | 'unsupported' | null;
    translationProgress: { completed: number; total: number } | null;
    translationSongIds: Set<string>;
    translationError: string | null;
    applyTranslationsToSong: (songId: string, translations?: Translations) => void;
    setLibrary: (library: LibraryInput) => void;
    setLyricsResult: (songId: string, status: LyricsStatus, lyrics?: LyricsInput) => void;
    /** Publish many scan results in one update, so subscribers walk the library once per batch. Applies them as given. */
    setLyricsResults: (results: LyricsResult[]) => void;
    markPlayed: (songId: string, at?: number) => void;
  }
>((set, get) => ({
  ...empty,
  playlists: [],
  translations: {},
  analyses: {},
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
      playlists: library.playlists ?? [],
      translations: library.translations ?? {},
      analyses: library.analyses ?? {},
      lyrics: applyTranslations(library.lyrics, library.translations ?? {}, library.analyses ?? {}),
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
    const updated = applySongTranslations(song, state.translations, state.analyses);
    if (updated !== song) set({ lyrics: { ...state.lyrics, [songId]: updated } });
  },
  setAnalysis: (analysis) => {
    const state = get();
    const analyses = { ...state.analyses, [analysis.fingerprint]: analysis };
    set({
      analyses,
      lyrics: Object.fromEntries(
        Object.entries(state.lyrics).map(([id, lyrics]) => [
          id,
          lyrics.fingerprint === analysis.fingerprint ? withSentences(lyrics, analysis) : lyrics,
        ]),
      ),
    });
  },
  setLyricsResult: (songId, status, lyrics) => get().setLyricsResults([{ songId, status, lyrics }]),
  setLyricsResults: (results) => {
    const state = get(),
      bySong = { ...state.bySong },
      lyrics = { ...state.lyrics };
    let changed = false;
    for (const { songId, status, lyrics: input } of results) {
      const song = bySong[songId];
      if (!song) continue;
      bySong[songId] = { ...song, lyricsStatus: status };
      if (status === 'none') delete lyrics[songId];
      else if (input) lyrics[songId] = applySongTranslations(input, state.translations, state.analyses, true);
      changed = true;
    }
    if (changed) set({ songs: state.songs.map((song) => bySong[song.id] ?? song), bySong, lyrics });
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
export const getLyrics = (id: string | null) => (id && libraryStore.getState().lyrics[id]) || emptyLyrics;
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
export const getPlaylist = (id: string) => libraryStore.getState().playlists.find((playlist) => playlist.id === id);
/** A playlist's songs in its order, skipping songs that left the library. */
export const getPlaylistSongs = (id: string) =>
  (getPlaylist(id)?.songIds ?? []).flatMap((songId) => {
    const song = libraryStore.getState().bySong[songId];
    return song ? [song] : [];
  });
/** Every song on the artist's albums, newest album first, in track order, as the artist page lists them. */
export const getArtistSongs = (id: string) => getArtistAlbums(id).flatMap((album) => getAlbumSongs(album.id));
export const getLineText = (line: Line) => line.segments.map((segment) => segment.text).join('');
export const hasTranslations = (id: string | null) => {
  const sentences = getLyrics(id).sentences;
  return !!sentences.length && sentences.every((sentence) => !!sentence.translation);
};
/** Reuse translations by Japanese text after loading or rescanning lyrics. */
function applyTranslations(
  lyrics: LibraryInput['lyrics'],
  translations: Translations,
  analyses: Record<string, SongAnalysis>,
): Library['lyrics'] {
  return Object.fromEntries(
    Object.entries(lyrics).map(([id, song]) => [id, applySongTranslations(song, translations, analyses)]),
  );
}
function applySongTranslations(
  song: LyricsInput,
  translations: Translations,
  analyses: Record<string, SongAnalysis>,
  force = false,
): SongLyrics {
  const lines = song.lines.map((line) => {
    const cached = translations[getLineText(line)];
    return cached && (line.translation !== cached.translation || line.segments !== cached.segments)
      ? { ...line, ...cached }
      : line;
  });
  if (
    !force &&
    song.fingerprint &&
    song.sentences &&
    song.sentenceTimeline &&
    song.hasJapanese !== undefined &&
    !lines.some((line, index) => line !== song.lines[index]) &&
    !song.analysis &&
    !analyses[song.fingerprint]
  )
    return song as SongLyrics;
  const derived = withSentences({ ...song, lines });
  return analyses[derived.fingerprint] ? withSentences(derived, analyses[derived.fingerprint]) : derived;
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
    analyses: previous.analyses,
    songs,
    lyrics: Object.fromEntries(Object.entries(previous.lyrics).filter(([id]) => ids.has(id))),
  };
}

/** Find the learning occurrence containing a displayed timeline line. */
export function sentenceOccurrenceAt(songId: string | null, lineIndex: number) {
  return getLyrics(songId).sentenceTimeline.find(
    (occurrence) => occurrence.start <= lineIndex && occurrence.end >= lineIndex,
  );
}

/** Sentence lines retain timeline order, repeats and contextual occurrence translations. */
export function currentSentence(songId: string | null, lineIndex: number) {
  const lyrics = getLyrics(songId);
  const occurrence = sentenceOccurrenceAt(songId, lineIndex);
  if (!occurrence) return undefined;
  const sentence = lyrics.sentences.find((sentence) => sentence.id === occurrence.sentenceId);
  if (!sentence) return undefined;
  const lines = lyrics.timeline.slice(occurrence.start, occurrence.end + 1).map((item) => {
    const line = lyrics.lines.find((line) => line.id === item.lineId)!;
    return item.translation ? { ...line, translation: item.translation } : line;
  });
  const previous = lyrics.sentenceTimeline[lyrics.sentenceTimeline.indexOf(occurrence) - 1];
  return { sentence, occurrence, lines, previous };
}

/** Resolve a review entry to its sentence and first timed occurrence. */
export function sentenceForReview(item: ReviewList[number]) {
  const occurrence = getLyrics(item.songId).sentenceTimeline.find(
    (occurrence) => occurrence.sentenceId === item.sentenceId,
  );
  return occurrence ? currentSentence(item.songId, occurrence.start) : undefined;
}

/** Song metadata belongs to the accepted whole-song analysis. */
export const songAnalysisInfo = (songId: string | null) => getLyrics(songId).analysis;

/** Bounds of the first sentence occurrence, for clip playback and edit checks. */
export function reviewClip(item: ReviewList[number]) {
  const current = sentenceForReview(item);
  if (!current) return undefined;
  const timeline = getLyrics(item.songId).timeline;
  return { startMs: timeline[current.occurrence.start]!.startMs, endMs: timeline[current.occurrence.end]!.endMs };
}

/** Plain sentence text for labels and results that do not render each line separately. */
export function getSentenceText(songId: string, sentence: SongLyrics['sentences'][number]) {
  const lyrics = getLyrics(songId);
  const occurrence = lyrics.sentenceTimeline.find((item) => item.sentenceId === sentence.id);
  return occurrence ? currentSentence(songId, occurrence.start)!.lines.map(getLineText).join('\n') : '';
}
