import { withSentences, type LyricsInput } from '@/lyrics/sentences';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
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
  analyses?: Record<string, SongAnalysis>;
};
export type Progress = { kind: 'sync' | 'scan'; completed: number; total: number };
const empty: Library = { songs: [], albums: [], artists: [], lyrics: {} };
const emptyLyrics = (songId: string): SongLyrics => withSentences({ songId, lines: [], timeline: [] });

/** The in-memory library is seeded from SQLite at boot, or fixtures in Node tests. */
export const libraryStore = create<
  Library & {
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
    setLibrary: (library: Library) => void;
    setLyricsResult: (songId: string, status: LyricsStatus, lyrics?: LyricsInput) => void;
    markPlayed: (songId: string, at?: number) => void;
  }
>((set, get) => ({
  ...empty,
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
  setLyricsResult: (songId, status, lyrics) => {
    const song = get().bySong[songId];
    if (!song || (status === 'error' && song.lyricsStatus === 'synced' && get().lyrics[songId])) return;
    const updated = { ...song, lyricsStatus: status };
    const nextLyrics = { ...get().lyrics };
    if (status === 'none') delete nextLyrics[songId];
    else if (lyrics) nextLyrics[songId] = applySongTranslations(lyrics, get().translations, get().analyses, true);
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
  const sentences = getLyrics(id).sentences;
  return !!sentences.length && sentences.every((sentence) => !!sentence.translation);
};
/** New and missed sentences are ready now; scheduled sentences return at their due time. */
export const isDue = (line: ReviewList[number], now = Date.now()) => line.kind !== 'later' || line.dueAt <= now;
/** Due today excludes the separate new-from-listening group. */
export const dueLines = (list: ReviewList, now = Date.now()) =>
  list.filter((line) => line.kind !== 'new' && isDue(line, now));
/** Review actions require a surviving sentence in a fully translated song. */
export const readyReviewLines = (list: ReviewList, now = Date.now()) =>
  list.filter(
    (item) =>
      isDue(item, now) &&
      hasTranslations(item.songId) &&
      getLyrics(item.songId).sentences.some((sentence) => sentence.id === item.sentenceId),
  );
export const occurrenceLine = (id: string | null, index: number) => {
  const lyrics = getLyrics(id);
  return lyrics.lines.find((line) => line.id === lyrics.timeline[index]?.lineId);
};

/** Pick distinct same-song translations, then shuffle once when a sentence becomes current. */
export function getAnswers(song: Song, index: number, random = Math.random) {
  const line = currentSentence(song.id, index)?.sentence;
  if (!line?.translation) return [];
  const others = [
    ...new Set(
      getLyrics(song.id)
        .sentences.map((item) => item.translation)
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
function applyTranslations(
  lyrics: Library['lyrics'],
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

/** Metadata and notes use timeline occurrence indexes, not distinct line indexes. */
export const songAnalysisInfo = (songId: string | null) => getLyrics(songId).analysis;
export const isAnalyzed = (songId: string | null) => !!songAnalysisInfo(songId);
export const dueSentences = dueLines;
export const readyReviewSentences = readyReviewLines;

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
