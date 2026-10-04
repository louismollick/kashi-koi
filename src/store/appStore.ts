import { create } from 'zustand';
import { firstSong, getAlbumSongs, getSong, makeReviewList, songs } from '@/data/fakeData';
import { getVisibleSongs, isHiddenSong } from '@/data/libraryVisibility';
import type { ClipReview, ListenMode, QuizMode, QuizToggle, ReviewList, ReviewMix, Run, Song, Rank } from '@/types/domain';

const newRun = (): Run => ({ answers: {}, combo: 0, bestCombo: 0, finished: false });

/** Step from the original queue position, including a song hidden during playback. */
function queueStep(ids: string[], currentId: string, direction: 1 | -1, hiding: boolean) {
  const current = ids.indexOf(currentId);
  for (let offset = 1; offset <= ids.length; offset++) {
    const song = getSong(ids[(current + direction * offset + ids.length) % ids.length]!);
    if (!isHiddenSong(song, hiding)) return song;
  }
  return null;
}

/** Grade the entire song; skipped lines are misses in the Results screen. */
export function getRunSummary(song: Song, run: Run) {
  const hits = song.lines.filter(line => run.answers[line.id]?.correct).length;
  const total = song.lines.length;
  const missed = song.lines.filter(line => !run.answers[line.id]?.correct);
  const fraction = total ? hits / total : 0;
  const rank: Rank = fraction === 1 ? 'S' : fraction >= 0.8 ? 'A' : fraction >= 0.6 ? 'B' : 'C';
  return { hits, total, missed, rank };
}

type AppState = {
  songId: string; lineIndex: number; quizToggle: QuizToggle; mode: ListenMode | QuizMode;
  playing: boolean; nothingDue: boolean; hideSongsWithoutSyncedLyrics: boolean; playbackQueue: string[] | null; reviewList: ReviewList; run: Run;
  reviewMix: ReviewMix | null; clipReview: ClipReview | null; addedId: string | null; addedExpiresAt: number | null; nextReviewId: number;
  startSong: (songId: string) => void; startAlbum: (albumId: string, shuffle?: boolean) => void; restartRun: () => void; setQuizToggle: (enabled: boolean) => void;
  startReviewMix: () => void; finishReviewMix: () => void; nextSong: () => void; previousSong: () => void;
  toggleHideSongsWithoutSyncedLyrics: () => void;
  jumpToLine: (index: number) => void; answer: (choice: number) => void; advanceLine: () => void; advancePlayback: () => void;
  setPlaying: (playing: boolean) => void; toggleNothingDue: () => void;
  addLostMark: () => void; undoLostMark: () => void; dismissToast: () => void;
  moveReviewLine: (id: string, lineId: string) => void; removeReviewLine: (id: string) => void;
  startClipReview: () => void; answerClip: (choice: number) => void; nextClip: () => void;
  sendToReview: (lineId: string, enabled: boolean) => void;
};

/** Transient app fixtures and interactions. Reloading restores the original list. */
export const appStore = create<AppState>((set, get) => ({
  songId: firstSong.id, lineIndex: 3, quizToggle: false, mode: 'listen', playing: true,
  nothingDue: false, hideSongsWithoutSyncedLyrics: true, playbackQueue: null, reviewList: makeReviewList(), run: newRun(),
  reviewMix: null, clipReview: null, addedId: null, addedExpiresAt: null, nextReviewId: 1,
  startSong: songId => set(state => {
    const quizToggle = state.reviewMix?.previousQuizToggle ?? state.quizToggle;
    return { songId, lineIndex: 0, run: newRun(), playing: true, reviewMix: null, playbackQueue: null, quizToggle, mode: quizToggle ? 'quiz' : 'listen' };
  }),
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
  restartRun: () => set({ lineIndex: 0, run: newRun(), playing: true }),
  setQuizToggle: enabled => set({ quizToggle: enabled, mode: enabled ? 'quiz' : 'listen', run: newRun() }),
  startReviewMix: () => {
    const state = get();
    const songIds = getVisibleSongs(songs, state.hideSongsWithoutSyncedLyrics).filter(song => state.reviewList.some(line => line.songId === song.id && line.kind !== 'later')).map(song => song.id);
    if (!songIds.length || state.nothingDue) return;
    set({ reviewMix: { songIds, index: 0, previousQuizToggle: state.reviewMix?.previousQuizToggle ?? state.quizToggle }, songId: songIds[0]!,
      quizToggle: true, mode: 'quiz', lineIndex: 0, run: newRun(), playing: true, playbackQueue: null });
  },
  finishReviewMix: () => {
    const mix = get().reviewMix;
    if (mix) set({ quizToggle: mix.previousQuizToggle, mode: mix.previousQuizToggle ? 'quiz' : 'listen', reviewMix: null });
  },
  nextSong: () => {
    const { reviewMix, songId, playbackQueue, hideSongsWithoutSyncedLyrics } = get();
    if (reviewMix) {
      const next = reviewMix.songIds.findIndex((id, index) => index > reviewMix.index && !isHiddenSong(getSong(id), hideSongsWithoutSyncedLyrics));
      if (next !== -1) {
        set({ songId: reviewMix.songIds[next]!, lineIndex: 0, run: newRun(), reviewMix: { ...reviewMix, index: next }, playing: true });
        return;
      }
      get().finishReviewMix();
    }
    const next = queueStep(playbackQueue ?? songs.map(song => song.id), songId, 1, hideSongsWithoutSyncedLyrics);
    if (!next) return;
    set({ songId: next.id, lineIndex: 0, run: newRun(), playing: true });
  },
  previousSong: () => {
    const { reviewMix, songId, playbackQueue, hideSongsWithoutSyncedLyrics } = get();
    if (reviewMix) {
      for (let index = reviewMix.index - 1; index >= 0; index--) {
        const id = reviewMix.songIds[index]!;
        if (isHiddenSong(getSong(id), hideSongsWithoutSyncedLyrics)) continue;
        set({ songId: id, lineIndex: 0, run: newRun(), reviewMix: { ...reviewMix, index }, playing: true });
        return;
      }
      return;
    }
    const previous = queueStep(playbackQueue ?? songs.map(song => song.id), songId, -1, hideSongsWithoutSyncedLyrics);
    if (previous) set({ songId: previous.id, lineIndex: 0, run: newRun(), playing: true });
  },
  jumpToLine: index => set(state => ({ lineIndex: Math.max(0, Math.min(index, getSong(state.songId).lines.length - 1)) })),
  answer: choice => set(state => {
    const line = getSong(state.songId).lines[state.lineIndex];
    if (!line) return state;
    const lineId = line.id;
    if (state.run.answers[lineId] || state.run.finished) return state;
    const correct = choice === 1;
    const combo = correct ? state.run.combo + 1 : 0;
    return {
      run: { ...state.run, combo, bestCombo: Math.max(combo, state.run.bestCombo), answers: { ...state.run.answers, [lineId]: { choice, correct } } },
      reviewList: correct ? state.reviewList.map(line => line.lineId === lineId ? { ...line, kind: 'later' as const } : line) : state.reviewList,
    };
  }),
  advanceLine: () => set(state => {
    const length = getSong(state.songId).lines.length;
    if (!length) return state;
    return state.lineIndex + 1 >= length
      ? { run: { ...state.run, finished: true }, playing: false }
      : { lineIndex: state.lineIndex + 1 };
  }),
  // Fake listen playback follows synced lines; empty lyrics wait for a manual skip.
  advancePlayback: () => {
    const state = get();
    if (!state.playing) return;
    const length = getSong(state.songId).lines.length;
    if (length && !state.quizToggle) {
      if (state.lineIndex < length - 1) state.advanceLine();
      else state.nextSong();
    }
  },
  setPlaying: playing => set({ playing }),
  toggleNothingDue: () => set(state => ({ nothingDue: !state.nothingDue })),
  addLostMark: () => set(state => {
    const line = getSong(state.songId).lines[state.lineIndex];
    if (!line) return state;
    const lineId = line.id;
    if (state.reviewList.some(line => line.lineId === lineId)) return state;
    const id = `lost-${state.nextReviewId}`;
    return { reviewList: [...state.reviewList, { id, songId: state.songId, lineId, kind: 'new' as const }], addedId: id, addedExpiresAt: Date.now() + 3000, nextReviewId: state.nextReviewId + 1 };
  }),
  undoLostMark: () => set(state => ({
    reviewList: state.addedExpiresAt !== null && Date.now() < state.addedExpiresAt
      ? state.reviewList.filter(line => line.id !== state.addedId) : state.reviewList,
    addedId: null, addedExpiresAt: null,
  })),
  dismissToast: () => set({ addedId: null, addedExpiresAt: null }),
  moveReviewLine: (id, lineId) => set(state => {
    const item = state.reviewList.find(line => line.id === id);
    if (!item || item.lineId === lineId || !getSong(item.songId).lines.some(line => line.id === lineId)
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
  startClipReview: () => set(state => ({ clipReview: { ids: state.nothingDue ? [] : state.reviewList.filter(line => line.kind !== 'later').map(line => line.id), index: 0, answered: null } })),
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
    if (enabled && !exists) return { reviewList: [...state.reviewList, { id: `result-${state.nextReviewId}`, lineId, songId: state.songId, kind: 'due' as const, misses: 1 }], nextReviewId: state.nextReviewId + 1 };
    if (!enabled) return { reviewList: state.reviewList.filter(line => !(line.lineId === lineId && line.id.startsWith('result-'))) };
    return state;
  }),
}));
