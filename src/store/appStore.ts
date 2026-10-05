import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { currentOccurrence } from '@/navidrome/lyrics';
import { create } from 'zustand';
import { getAlbumSongs, getSong, getLyrics, occurrenceLine, hasMeanings, libraryStore } from '@/store/libraryStore';
import { getVisibleSongs, isHiddenSong } from '@/data/libraryVisibility';
import type { ClipReview, ListenMode, QuizMode, QuizToggle, ReviewList, ReviewMix, Run, Song, Rank } from '@/types/domain';

export type Transport = { load(song: Song): void; play(): void; pause(): void; seek(ms: number): void };
const noopTransport: Transport = { load() {}, play() {}, pause() {}, seek() {} };
let transport = noopTransport;
/** Cleanup only detaches the transport it installed. */
export const setTransport = (next: Transport) => { transport = next; return () => { if (transport !== next) return false; transport = noopTransport; return true; }; };

/** Load and play the song after publishing its queue position. */
function playSong(id: string) { const song = getSong(id); if (song) { transport.load(song); transport.play(); } }

const newRun = (): Run => ({ answers: {}, combo: 0, bestCombo: 0, finished: false });

/** Step from the original queue position, including a song hidden during playback. */
function queueStep(ids: string[], currentId: string | null, direction: 1 | -1, hiding: boolean) {
  const current = currentId ? ids.indexOf(currentId) : -1;
  for (let offset = 1; offset <= ids.length; offset++) {
    const song = getSong(ids[(current + direction * offset + ids.length) % ids.length]!);
    if (song && !isHiddenSong(song, hiding)) return song;
  }
  return null;
}

/** Grade the entire song; skipped lines are misses in the Results screen. */
export function getRunSummary(song: Song, run: Run) {
  const hits = getLyrics(song.id).lines.filter(line => run.answers[line.id]?.correct).length;
  const total = getLyrics(song.id).lines.length;
  const missed = getLyrics(song.id).lines.filter(line => !run.answers[line.id]?.correct);
  const fraction = total ? hits / total : 0;
  const rank: Rank = fraction === 1 ? 'S' : fraction >= 0.8 ? 'A' : fraction >= 0.6 ? 'B' : 'C';
  return { hits, total, missed, rank };
}

type AppState = {
  positionMs: number; durationMs: number; playbackError: string | null; songId: string | null; lineIndex: number; quizToggle: QuizToggle; mode: ListenMode | QuizMode;
  ranks: Record<string, Rank>; lastSyncAt: number | null; lastScanAt: number | null; playing: boolean; hideSongsWithoutSyncedLyrics: boolean; playbackQueue: string[] | null; reviewList: ReviewList; run: Run;
  reviewMix: ReviewMix | null; clipReview: ClipReview | null; addedId: string | null; addedExpiresAt: number | null; nextReviewId: number;
  startSong: (songId: string) => void; startAlbum: (albumId: string, shuffle?: boolean) => void; restartRun: () => void; setQuizToggle: (enabled: boolean) => void;
  startReviewMix: () => void; finishReviewMix: () => void; nextSong: () => void; previousSong: () => void;
  toggleHideSongsWithoutSyncedLyrics: () => void;
  jumpToLine: (index: number) => void; answer: (choice: number) => void; advanceLine: () => void;
  updatePlayback: (positionMs: number, durationMs: number, playing: boolean) => void; completeRun: () => void;
  setPlaying: (playing: boolean) => void;
  addLostMark: () => void; undoLostMark: () => void; dismissToast: () => void;
  moveReviewLine: (id: string, lineId: string) => void; removeReviewLine: (id: string) => void;
  startClipReview: () => void; answerClip: (choice: number) => void; nextClip: () => void;
  sendToReview: (lineId: string, enabled: boolean) => void;
};

/** Learning state and queue actions, independent of native playback. */
export const appStore = create<AppState>()(persist((set, get) => ({
  positionMs: 0, durationMs: 0, playbackError: null, songId: null, lineIndex: 0, quizToggle: false, mode: 'listen', playing: false, ranks: {}, lastSyncAt: null, lastScanAt: null,
  hideSongsWithoutSyncedLyrics: true, playbackQueue: null, reviewList: [], run: newRun(),
  reviewMix: null, clipReview: null, addedId: null, addedExpiresAt: null, nextReviewId: 1,
  startSong: songId => {
    if (!getSong(songId)) return;
    const state = get(), quizToggle = hasMeanings(songId) && (state.reviewMix?.previousQuizToggle ?? state.quizToggle);
    set({ songId, lineIndex: 0, positionMs: 0, durationMs: getSong(songId)!.duration * 1000, playbackError: null, run: newRun(), playing: true, reviewMix: null, playbackQueue: null, quizToggle, mode: quizToggle ? 'quiz' : 'listen' });
    playSong(songId);
  },
  startAlbum: (albumId, shuffle = false) => {
    const tracks = getVisibleSongs(getAlbumSongs(albumId), get().hideSongsWithoutSyncedLyrics);
    if (!tracks.length) return;
    // Shuffle the whole album queue, not just its starting song.
    if (shuffle) for (let index = tracks.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [tracks[index], tracks[other]] = [tracks[other]!, tracks[index]!];
    }
    get().startSong(tracks[0]!.id);
    set({ playbackQueue: tracks.map(song => song.id) });
  },
  toggleHideSongsWithoutSyncedLyrics: () => set(state => ({ hideSongsWithoutSyncedLyrics: !state.hideSongsWithoutSyncedLyrics })),
  restartRun: () => { set({ lineIndex: 0, positionMs: 0, run: newRun(), playing: true }); transport.seek(0); transport.play(); },
  setQuizToggle: enabled => { if (enabled && !hasMeanings(get().songId)) return; set({ quizToggle: enabled, mode: enabled ? 'quiz' : 'listen', run: newRun() }); },
  startReviewMix: () => {
    const state = get();
    const songIds = getVisibleSongs(libraryStore.getState().songs, state.hideSongsWithoutSyncedLyrics).filter(song => state.reviewList.some(line => line.songId === song.id && line.kind !== 'later') && hasMeanings(song.id)).map(song => song.id);
    if (!songIds.length) return;
    set({ reviewMix: { songIds, index: 0, previousQuizToggle: state.reviewMix?.previousQuizToggle ?? state.quizToggle }, songId: songIds[0]!,
      quizToggle: true, mode: 'quiz', lineIndex: 0, run: newRun(), playing: true, playbackQueue: null });
    playSong(songIds[0]!);
  },
  finishReviewMix: () => {
    const mix = get().reviewMix;
    if (mix) set({ quizToggle: mix.previousQuizToggle, mode: mix.previousQuizToggle ? 'quiz' : 'listen', reviewMix: null });
  },
  nextSong: () => {
    const { reviewMix, songId, playbackQueue, hideSongsWithoutSyncedLyrics } = get();
    if (reviewMix) {
      const next = reviewMix.songIds.findIndex((id, index) => index > reviewMix.index && !!getSong(id) && !isHiddenSong(getSong(id)!, hideSongsWithoutSyncedLyrics));
      if (next !== -1) {
        set({ songId: reviewMix.songIds[next]!, lineIndex: 0, run: newRun(), reviewMix: { ...reviewMix, index: next }, playing: true, positionMs: 0, playbackError: null });
        playSong(get().songId!);
        return;
      }
      get().finishReviewMix();
    }
    const next = queueStep(playbackQueue ?? libraryStore.getState().songs.map(song => song.id), songId, 1, hideSongsWithoutSyncedLyrics);
    if (!next) { get().setPlaying(false); return; }
    set({ songId: next.id, lineIndex: 0, positionMs: 0, playbackError: null, run: newRun(), playing: true, quizToggle: get().quizToggle && hasMeanings(next.id), mode: get().quizToggle && hasMeanings(next.id) ? 'quiz' : 'listen' });
    playSong(next.id);
  },
  previousSong: () => {
    const { reviewMix, songId, playbackQueue, hideSongsWithoutSyncedLyrics } = get();
    if (reviewMix) {
      for (let index = reviewMix.index - 1; index >= 0; index--) {
        const id = reviewMix.songIds[index]!;
        if (!getSong(id) || isHiddenSong(getSong(id)!, hideSongsWithoutSyncedLyrics)) continue;
        set({ songId: id, lineIndex: 0, run: newRun(), reviewMix: { ...reviewMix, index }, playing: true, positionMs: 0, playbackError: null });
        playSong(get().songId!);
        return;
      }
      return;
    }
    const previous = queueStep(playbackQueue ?? libraryStore.getState().songs.map(song => song.id), songId, -1, hideSongsWithoutSyncedLyrics);
    if (previous) { set({ quizToggle: get().quizToggle && hasMeanings(previous.id), mode: get().quizToggle && hasMeanings(previous.id) ? 'quiz' : 'listen', songId: previous.id, lineIndex: 0, positionMs: 0, playbackError: null, run: newRun(), playing: true }); playSong(previous.id); }
  },
  jumpToLine: index => {
    const timeline = getLyrics(get().songId).timeline;
    if (!timeline.length) return;
    const positionMs = index < 0 ? 0 : Math.max(0, timeline[Math.min(index, timeline.length - 1)]!.startMs), lineIndex = currentOccurrence(timeline, positionMs);
    set({ lineIndex, positionMs }); transport.seek(positionMs);
  },
  updatePlayback: (positionMs, durationMs, playing) => {
    const lineIndex = currentOccurrence(getLyrics(get().songId).timeline, positionMs);
    set(state => ({ positionMs, durationMs, playing, ...(lineIndex !== state.lineIndex ? { lineIndex } : {}) }));
  },
  completeRun: () => {
    const song = getSong(get().songId);
    if (!song) return;
    const rank = getRunSummary(song, get().run).rank, order: Rank[] = ['C', 'B', 'A', 'S'], previous = get().ranks[song.id];
    set({ run: { ...get().run, finished: true }, playing: false, ranks: !previous || order.indexOf(rank) > order.indexOf(previous) ? { ...get().ranks, [song.id]: rank } : get().ranks });
    transport.pause();
  },
  answer: choice => set(state => {
    const line = occurrenceLine(state.songId, state.lineIndex);
    if (!line) return state;
    const lineId = line.id;
    if (state.run.answers[lineId] || state.run.finished) return state;
    if (!line.meaning) return state;
    const correct = choice === 1;
    const combo = correct ? state.run.combo + 1 : 0;
    return {
      run: { ...state.run, combo, bestCombo: Math.max(combo, state.run.bestCombo), answers: { ...state.run.answers, [lineId]: { choice, correct } } },
      reviewList: correct ? state.reviewList.map(line => line.lineId === lineId ? { ...line, kind: 'later' as const } : line) : state.reviewList,
    };
  }),
  advanceLine: () => {
    const state = get(), length = getLyrics(state.songId).timeline.length;
    if (!length) return;
    if (state.lineIndex + 1 >= length) { if (state.quizToggle) state.completeRun(); else state.nextSong(); }
    else state.jumpToLine(state.lineIndex + 1);
  },
  setPlaying: playing => { set({ playing }); if (playing) transport.play(); else transport.pause(); },
  addLostMark: () => set(state => {
    const line = occurrenceLine(state.songId, state.lineIndex);
    if (!line) return state;
    const lineId = line.id;
    if (state.reviewList.some(line => line.lineId === lineId)) return state;
    const id = `lost-${state.nextReviewId}`;
    return { reviewList: [...state.reviewList, { id, songId: state.songId!, lineId, kind: 'new' as const }], addedId: id, addedExpiresAt: Date.now() + 3000, nextReviewId: state.nextReviewId + 1 };
  }),
  undoLostMark: () => set(state => ({
    reviewList: state.addedExpiresAt !== null && Date.now() < state.addedExpiresAt
      ? state.reviewList.filter(line => line.id !== state.addedId) : state.reviewList,
    addedId: null, addedExpiresAt: null,
  })),
  dismissToast: () => set({ addedId: null, addedExpiresAt: null }),
  moveReviewLine: (id, lineId) => set(state => {
    const item = state.reviewList.find(line => line.id === id);
    if (!item || item.lineId === lineId || !getLyrics(item.songId).lines.some(line => line.id === lineId)
      || state.reviewList.some(line => line.id !== id && line.lineId === lineId)) return state;
    const clip = state.clipReview;
    return { reviewList: state.reviewList.map(line => line.id === id
      ? { id: line.id, songId: line.songId, lineId, kind: 'new' as const } : line),
      clipReview: clip && clip.ids[clip.index] === id ? { ...clip, answered: null } : clip };
  }),
  removeReviewLine: id => set(state => {
    const clip = state.clipReview;
    const ids = clip?.ids.filter(lineId => lineId !== id);
    return { reviewList: state.reviewList.filter(line => line.id !== id),
      clipReview: clip && ids ? ids.length ? { ...clip, ids, index: Math.min(clip.index, ids.length - 1), answered: null } : null : clip };
  }),
  startClipReview: () => set(state => ({ clipReview: { ids: state.reviewList.filter(line => line.kind !== 'later' && hasMeanings(line.songId)).map(line => line.id), index: 0, answered: null } })),
  answerClip: choice => set(state => {
    const clip = state.clipReview;
    if (!clip || clip.answered !== null) return state;
    const id = clip.ids[clip.index];
    const correct = choice === 1;
    return { clipReview: { ...clip, answered: correct }, reviewList: state.reviewList.map(line => line.id !== id ? line : correct ? { ...line, kind: 'later' as const } : { ...line, kind: 'due' as const, misses: line.kind === 'due' ? line.misses + 1 : 1 }) };
  }),
  nextClip: () => set(state => {
    const clip = state.clipReview;
    if (!clip) return state;
    return { clipReview: clip.index + 1 < clip.ids.length ? { ...clip, index: clip.index + 1, answered: null } : null };
  }),
  sendToReview: (lineId, enabled) => set(state => {
    const exists = state.reviewList.some(line => line.lineId === lineId);
    if (enabled && !exists && state.songId) return { reviewList: [...state.reviewList, { id: `result-${state.nextReviewId}`, lineId, songId: state.songId!, kind: 'due' as const, misses: 1 }], nextReviewId: state.nextReviewId + 1 };
    if (!enabled) return { reviewList: state.reviewList.filter(line => !(line.lineId === lineId && line.id.startsWith('result-'))) };
    return state;
  }),
}), {
  name: 'learning-state', skipHydration: true,
  storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })),
  partialize: state => ({ reviewList: state.reviewList, ranks: state.ranks, quizToggle: state.quizToggle, hideSongsWithoutSyncedLyrics: state.hideSongsWithoutSyncedLyrics, lastSyncAt: state.lastSyncAt, lastScanAt: state.lastScanAt, nextReviewId: state.nextReviewId }),
}));

/** Native storage is injected at boot so store imports stay safe in plain Node. */
export async function hydrateAppState(storage: StateStorage) {
  let previous: string | null = null;
  appStore.persist.setOptions({ storage: createJSONStorage(() => ({
    getItem: key => storage.getItem(key),
    setItem: (key, value) => { if (value === previous) return; previous = value; return storage.setItem(key, value); },
    removeItem: key => { previous = null; return storage.removeItem(key); },
  })) });
  await appStore.persist.rehydrate();
}

export function resetAppState() {
  transport.pause();
  appStore.setState(appStore.getInitialState(), true);
  return appStore.persist.clearStorage();
}
