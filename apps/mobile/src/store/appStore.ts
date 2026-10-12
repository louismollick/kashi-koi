import { setOfflineModeReader } from '@/data/offlineMode';
import { useMemo } from 'react';
import { downloadStore, localAudioUri } from '@/downloads/store';
import { prefetchBreakdown, resetBreakdowns } from '@/analysis/breakdowns';
import { remapReview } from '@/lyrics/review';
import { applyAnswer, quizSentences } from '@/lyrics/fog';
import {
  prioritizeAnalyses,
  cancelAnalyses,
  fetchLibraryAnalyses,
  analyzeSong,
  analysisServerUrl,
  saveAnalysisToken,
  setAnalysisStore,
} from '@/analysis/fetcher';
import { prioritizeTranslations, pauseTranslations, resumeTranslations } from '@/japanese/translate';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { currentOccurrence } from '@/navidrome/lyrics';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  getAlbumSongs,
  getSong,
  getLyrics,
  currentSentence,
  sentenceForReview,
  reviewClip,
  hasTranslations,
  libraryStore,
  getAnswers,
  readyReviewLines,
} from '@/store/libraryStore';
import { getVisibleSongs, isHiddenSong, type LibraryFilters } from '@/data/libraryVisibility';
import type {
  ClipReview,
  ListenMode,
  QuizMode,
  QuizToggle,
  ReviewList,
  Run,
  Song,
  LineFog,
  RunEnd,
  SentenceOccurrence,
} from '@/types/domain';

export type Transport = {
  load(song: Song, startMs?: number): void;
  play(): void;
  pause(): void;
  seek(ms: number): void;
};
const noopTransport: Transport = { load() {}, play() {}, pause() {}, seek() {} };
let transport = noopTransport,
  loadedSongId: string | null = null;
let clipTimer: ReturnType<typeof setTimeout> | null = null;
let answerTimer: ReturnType<typeof setTimeout> | null = null,
  releasedIndex: number | null = null;

/** Cancel the wait, preserving its occurrence guard unless starting a new pass. */
function clearAnswerWait(reset = false) {
  if (answerTimer !== null) clearTimeout(answerTimer);
  answerTimer = null;
  const wait = appStore.getState().answerWait;
  if (reset) releasedIndex = null;
  else if (wait) releasedIndex = wait.occurrence.end;
  if (wait) appStore.setState({ answerWait: null });
}

/** Release the held sentence after its deadline or answer feedback. */
function releaseAnswerWait() {
  if (appStore.getState().answerWait) appStore.getState().setPlaying(true);
}

/** Share one timer between the answer deadline and the result beat. */
function scheduleAnswerRelease(ms: number) {
  if (answerTimer !== null) clearTimeout(answerTimer);
  answerTimer = setTimeout(releaseAnswerWait, ms);
}
/** Cleanup only detaches the transport it installed. */
export const setTransport = (next: Transport) => {
  transport = next;
  loadedSongId = null;
  return () => {
    if (transport !== next) return false;
    transport = noopTransport;
    return true;
  };
};

/** Cancel feedback when leaving, jumping, or editing a clip. */
function clearClipTimer() {
  if (clipTimer !== null) clearTimeout(clipTimer);
  clipTimer = null;
}

/** Load and play the song after publishing its queue position; the player shows loading until audio is ready. */
function playSong(id: string) {
  clearAnswerWait(true);
  clearClipTimer();
  if (appStore.getState().offlineMode && !localAudioUri(id)) {
    transport.pause();
    appStore.setState({ loading: false, playing: false, playbackError: 'Song is not downloaded' });
    return;
  }
  appStore.setState({ clipPlayback: null, clipReview: null, loading: true });
  prioritizeUpNext();
  const song = getSong(id);
  if (song) {
    loadedSongId = id;
    transport.load(song);
    transport.play();
  }
}

/** Play the first occurrence of the current review sentence. */
function playReviewClip() {
  const state = appStore.getState(),
    clip = state.clipReview;
  const item = state.reviewList.find((item) => item.id === clip?.ids[clip.index]);
  const occurrence = item && reviewClip(item);
  if (item && occurrence) state.playClip(item.songId, occurrence.startMs, occurrence.endMs);
}

let offlineTransition = Promise.resolve();

const dayMs = 24 * 60 * 60 * 1000;

/** Correct answers double the interval; a miss resets the schedule. */
function scheduleReview(line: ReviewList[number], correct: boolean): ReviewList[number] {
  const { id, songId, sentenceId } = line;
  if (!correct) return { id, songId, sentenceId, kind: 'due', misses: line.kind === 'due' ? line.misses + 1 : 1 };
  const step = line.kind === 'later' ? line.step + 1 : 0;
  return { id, songId, sentenceId, kind: 'later', step, dueAt: Date.now() + 2 ** step * dayMs };
}

let nextRunId = 0;
/** Every song play and clip session gets a distinct pass through the fog. */
const newRunId = () => `${Date.now()}:${++nextRunId}`;
const newRun = (): Run => ({ id: newRunId(), choices: {}, answers: {}, combo: 0, bestCombo: 0, perfect: false });

/** Shuffle a fresh array with Fisher-Yates. */
function shuffled<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other]!, items[index]!];
  }
  return items;
}

/** Upcoming queue entries precede autoplay. */
export function getUpNext(state: Pick<AppState, 'queue' | 'queueIndex' | 'autoplay'>) {
  return { queue: state.queue.slice(state.queueIndex + 1), autoplay: state.autoplay };
}

/** Move background work to the current song and the upcoming playback order. */
function prioritizeUpNext() {
  const state = appStore.getState(),
    upcoming = getUpNext(state),
    ids = [state.songId, ...upcoming.queue, ...upcoming.autoplay].filter((id): id is string => !!id);
  prioritizeTranslations(ids);
  void prioritizeAnalyses(ids);
}

/** Record the first grade for this sentence; null means it was left unanswered. */
function scoreSentence(correct: boolean, choice: string | null): boolean {
  const before = appStore.getState();
  appStore.setState((state) => {
    const line = currentSentence(state.songId, state.lineIndex)?.sentence;
    if (!line) return state;
    const sentenceId = line.id;
    if (state.mode !== 'quiz' || state.run.answers[sentenceId]) return state;
    if (!line.translation) return state;
    const combo = correct ? state.run.combo + 1 : 0,
      answers = { ...state.run.answers, [sentenceId]: { choice, correct } },
      sentences = quizSentences(getLyrics(state.songId)),
      perfect = correct && sentences.length > 0 && sentences.every((sentence) => answers[sentence.id]?.correct),
      existing = state.reviewList.some((item) => item.songId === state.songId && item.sentenceId === sentenceId),
      addedId = `miss-${state.nextReviewId}`;
    const reviewList = state.reviewList.map((item) =>
      item.songId === state.songId && item.sentenceId === sentenceId ? scheduleReview(item, correct) : item,
    );
    if (!correct && !existing)
      reviewList.push({ id: addedId, songId: state.songId!, sentenceId, kind: 'due', misses: 1 });
    return {
      fog: applyAnswer(state.fog, line.lineIds, correct, state.run.id),
      perfectRuns: perfect ? { ...state.perfectRuns, [state.songId!]: true as const } : state.perfectRuns,
      run: {
        ...state.run,
        combo,
        bestCombo: Math.max(combo, state.run.bestCombo),
        answers,
        perfect: state.run.perfect || perfect,
      },
      reviewList,
      ...(!correct && !existing
        ? { addedId, addedExpiresAt: Date.now() + 3000, nextReviewId: state.nextReviewId + 1 }
        : {}),
    };
  });
  const scored = appStore.getState().run !== before.run;
  if (scored && !correct) {
    const sentence = currentSentence(before.songId, before.lineIndex)?.sentence;
    if (sentence) prefetchBreakdown(before.songId, sentence.id);
  }
  return scored;
}

/** Grade only the distinct sentences that can be asked in this song. */
export function getRunSummary(song: Song, run: Run) {
  const sentences = quizSentences(getLyrics(song.id)),
    hits = sentences.filter((sentence) => run.answers[sentence.id]?.correct).length,
    missed = sentences.filter((sentence) => !run.answers[sentence.id]?.correct);
  return { hits, total: sentences.length, missed };
}

/** Publish quiz feedback before advancing to the next song. */
export function finishSong() {
  if (appStore.getState().answerWait) scoreSentence(false, null);
  clearAnswerWait();
  const state = appStore.getState(),
    answers = Object.values(state.run.answers);
  if (state.quizToggle && state.songId && answers.length)
    appStore.setState({
      runEnd: {
        songId: state.songId,
        hits: answers.filter((answer) => answer.correct).length,
        answered: answers.length,
        bestCombo: state.run.bestCombo,
        perfect: state.run.perfect,
      },
    });
  state.nextSong();
}

/** Start another queued play without rebuilding the queue or autoplay. */
function playQueueSong(songId: string, queueIndex: number) {
  const state = appStore.getState(),
    quizToggle = state.quizToggle && hasTranslations(songId);
  appStore.setState({
    songId,
    queueIndex,
    lineIndex: 0,
    positionMs: 0,
    durationMs: getSong(songId)!.duration * 1000,
    playbackError: null,
    run: newRun(),
    playing: true,
    quizToggle,
    mode: quizToggle ? 'quiz' : 'listen',
  });
  playSong(songId);
}

type AppState = {
  positionMs: number;
  durationMs: number;
  loading: boolean;
  playbackError: string | null;
  songId: string | null;
  lineIndex: number;
  quizToggle: QuizToggle;
  mode: ListenMode | QuizMode;
  fog: Record<string, LineFog>;
  perfectRuns: Record<string, true>;
  runEnd: RunEnd | null;
  dismissRunEnd: () => void;
  lastSyncAt: number | null;
  lastScanAt: number | null;
  playing: boolean;
  offlineMode: boolean;
  setOfflineMode: (enabled: boolean) => void;
  hideSongsWithoutSyncedLyrics: boolean;
  hideSongsWithoutJapanese: boolean;
  queue: string[];
  queueIndex: number;
  autoplay: string[];
  reviewList: ReviewList;
  run: Run;
  answerTime: number | null;
  answerWait: { occurrence: SentenceOccurrence; until: number | null } | null;
  analysisServerUrl: string;
  analysisToken: string;
  analysisRequests: Record<
    string,
    { status: 'requesting' | 'queued' | 'running' | 'failed'; error?: string; force: boolean }
  >;
  setAnalysisServerUrl: (url: string) => void;
  setAnalysisToken: (token: string) => Promise<void>;
  analyzeSong: (songId: string, options?: { force?: boolean }) => Promise<void>;
  cycleAnswerTime: () => void;
  clipPlayback: { songId: string; startMs: number; endMs: number; positionMs: number; ended: boolean } | null;
  clipReview: ClipReview | null;
  addedId: string | null;
  addedExpiresAt: number | null;
  nextReviewId: number;
  startSong: (songId: string, list?: string[]) => void;
  playNext: (songId: string) => void;
  addToQueue: (songId: string) => void;
  playUpNext: (position: number) => void;
  startAlbum: (albumId: string, shuffle?: boolean) => void;
  restartRun: () => void;
  setQuizToggle: (enabled: boolean) => void;
  nextSong: () => void;
  previousSong: () => void;
  skipBack: () => void;
  showTranslations: boolean;
  /** Per-song translation display in listen mode. Quiz and review always use analyzed sentences when available. */
  lineByLineSongIds: string[];
  setListenAnalysisEnabled: (songId: string, enabled: boolean) => void;
  translationPrompted: boolean;
  toggleTranslations: () => void;
  ensureChoices: () => void;
  ensureClipChoices: () => void;
  toggleHideSongsWithoutSyncedLyrics: () => void;
  toggleHideSongsWithoutJapanese: () => void;
  replayLine: () => void;
  seek: (positionMs: number) => void;
  jumpToLine: (index: number) => void;
  answer: (choice: string) => void;
  continueAfterAnswer: () => void;
  advanceLine: () => void;
  updatePlayback: (positionMs: number, durationMs: number, playing: boolean) => void;
  setPlaying: (playing: boolean) => void;
  playClip: (songId: string, startMs: number, endMs: number) => void;
  stopClipReview: () => void;
  addLostMark: () => void;
  undoLostMark: () => void;
  dismissToast: () => void;
  moveReviewSentence: (id: string, sentenceId: string) => void;
  moveReviewLine: (id: string, sentenceId: string) => void;
  removeReviewSentence: (id: string) => void;
  removeReviewLine: (id: string) => void;
  startClipReview: () => void;
  answerClip: (choice: string) => void;
  nextClip: () => void;
  jumpToClip: (index: number) => void;
};

/** Share the same filter mapping between queue actions and component selectors. */
const libraryFilters = (state: AppState): LibraryFilters => ({
  downloadedOnly: state.offlineMode,
  hideUnsynced: state.hideSongsWithoutSyncedLyrics,
  hideNonJapanese: state.hideSongsWithoutJapanese,
});

/** Learning state and queue actions, independent of native playback. */
export const appStore = create<AppState>()(
  persist(
    (set, get) => ({
      positionMs: 0,
      durationMs: 0,
      loading: false,
      playbackError: null,
      songId: null,
      lineIndex: 0,
      quizToggle: false,
      mode: 'listen',
      playing: false,
      fog: {},
      perfectRuns: {},
      runEnd: null,
      dismissRunEnd: () => set({ runEnd: null }),
      lastSyncAt: null,
      lastScanAt: null,
      answerTime: null,
      answerWait: null,
      analysisServerUrl: '',
      analysisToken: '',
      analysisRequests: {},
      setAnalysisServerUrl: (url) => {
        resetBreakdowns();
        set({ analysisServerUrl: url.trim().replace(/\/+$/, '') });
        void prioritizeAnalyses(
          [
            get().songId,
            ...getUpNext(get()).queue,
            ...get().autoplay,
            ...libraryStore.getState().songs.map((song) => song.id),
          ].filter((id): id is string => !!id),
        );
      },
      setAnalysisToken: async (token) => {
        const value = token.trim();
        if (await saveAnalysisToken(value)) set({ analysisToken: value });
      },
      analyzeSong,
      showTranslations: true,
      lineByLineSongIds: [],
      setListenAnalysisEnabled: (songId, enabled) => {
        set((state) => ({
          lineByLineSongIds: enabled
            ? state.lineByLineSongIds.filter((id) => id !== songId)
            : [...new Set([...state.lineByLineSongIds, songId])],
        }));
        if (!enabled) prioritizeTranslations([songId]);
      },
      translationPrompted: false,
      offlineMode: false,
      setOfflineMode: (offlineMode) => {
        set({ offlineMode });
        offlineTransition = offlineTransition
          .catch(() => {})
          .then(async () => {
            if (get().offlineMode) {
              const { cancelSync } = await import('@/navidrome/sync');
              await Promise.all([cancelSync(), cancelAnalyses(), pauseTranslations()]);
            } else {
              void resumeTranslations();
              void fetchLibraryAnalyses();
            }
          });
      },
      hideSongsWithoutSyncedLyrics: true,
      hideSongsWithoutJapanese: true,
      queue: [],
      queueIndex: -1,
      autoplay: [],
      reviewList: [],
      run: newRun(),
      clipReview: null,
      clipPlayback: null,
      addedId: null,
      addedExpiresAt: null,
      nextReviewId: 1,
      startSong: (songId, list) => {
        if (
          !getSong(songId) ||
          (get().loading &&
            get().songId === songId &&
            !get().clipPlayback &&
            (!list || (list.length === get().queue.length && list.every((id, index) => id === get().queue[index]))))
        )
          return;
        const queue = [...(list ?? [songId])];
        set({
          queue,
          autoplay: shuffled(
            getVisibleSongs(libraryStore.getState().songs, libraryFilters(get()))
              .map((song) => song.id)
              .filter((id) => !queue.includes(id)),
          ),
        });
        playQueueSong(songId, queue.indexOf(songId));
      },
      startAlbum: (albumId, shuffle = false) => {
        const ids = getVisibleSongs(getAlbumSongs(albumId), libraryFilters(get())).map((song) => song.id);
        if (!ids.length) return;
        if (shuffle) shuffled(ids);
        get().startSong(ids[0]!, ids);
      },
      playNext: (songId) => {
        if (songId === get().songId || !getSong(songId)) return;
        set((state) => ({
          queue: [...state.queue.slice(0, state.queueIndex + 1), songId, ...state.queue.slice(state.queueIndex + 1)],
          autoplay: state.autoplay.filter((id) => id !== songId),
        }));
        prioritizeUpNext();
      },
      addToQueue: (songId) => {
        if (!getSong(songId)) return;
        set((state) => ({ queue: [...state.queue, songId], autoplay: state.autoplay.filter((id) => id !== songId) }));
        prioritizeUpNext();
      },
      playUpNext: (position) => {
        if (!Number.isInteger(position) || position < 0) return;
        const state = get(),
          upcoming = getUpNext(state),
          songId = [...upcoming.queue, ...upcoming.autoplay][position];
        const song = songId && getSong(songId);
        if (!song || isHiddenSong(song, libraryFilters(state))) return;
        if (position < upcoming.queue.length) playQueueSong(song.id, state.queueIndex + 1 + position);
        else {
          const index = position - upcoming.queue.length;
          set({ queue: [...state.queue, song.id], autoplay: state.autoplay.slice(index + 1) });
          playQueueSong(song.id, state.queue.length);
        }
      },
      // Cycle the fixed answer-time presets for future stops.
      cycleAnswerTime: () => {
        const presets = [null, 10, 5, 3, 0];
        set({ answerTime: presets[(presets.indexOf(get().answerTime) + 1) % presets.length]! });
      },
      toggleTranslations: () => set((state) => ({ showTranslations: !state.showTranslations })),
      ensureChoices: () =>
        set((state) => {
          const line = currentSentence(state.songId, state.lineIndex)?.sentence,
            song = getSong(state.songId);
          if (!song || !line?.translation || state.run.choices[line.id]) return state;
          return {
            run: { ...state.run, choices: { ...state.run.choices, [line.id]: getAnswers(song, state.lineIndex) } },
          };
        }),
      ensureClipChoices: () =>
        set((state) => {
          const clip = state.clipReview,
            item = state.reviewList.find((item) => item.id === clip?.ids[clip.index]);
          const song = item && getSong(item.songId);
          if (!clip || !item || !song || clip.choices[item.sentenceId]) return state;
          const index =
            getLyrics(song.id).sentenceTimeline.find((occurrence) => occurrence.sentenceId === item.sentenceId)
              ?.start ?? -1;
          return { clipReview: { ...clip, choices: { ...clip.choices, [item.sentenceId]: getAnswers(song, index) } } };
        }),
      toggleHideSongsWithoutSyncedLyrics: () =>
        set((state) => ({ hideSongsWithoutSyncedLyrics: !state.hideSongsWithoutSyncedLyrics })),
      toggleHideSongsWithoutJapanese: () =>
        set((state) => ({ hideSongsWithoutJapanese: !state.hideSongsWithoutJapanese })),
      restartRun: () => {
        clearAnswerWait(true);
        set({ lineIndex: 0, positionMs: 0, run: newRun() });
        if (!get().clipPlayback) transport.seek(0);
        get().setPlaying(true);
      },
      setQuizToggle: (enabled) => {
        if (enabled && !hasTranslations(get().songId)) return;
        const waiting = !!get().answerWait;
        clearAnswerWait();
        set({ quizToggle: enabled, mode: enabled ? 'quiz' : 'listen' });
        if (waiting) get().setPlaying(true);
      },
      nextSong: () => {
        const state = get(),
          filters = libraryFilters(state);
        for (let index = state.queueIndex + 1; index < state.queue.length; index++) {
          const song = getSong(state.queue[index]!);
          if (song && !isHiddenSong(song, filters)) {
            playQueueSong(song.id, index);
            return;
          }
        }
        const playable = (id: string) => {
          const song = getSong(id);
          return !!song && !isHiddenSong(song, filters);
        };
        let autoplay = state.autoplay.filter(playable);
        if (!autoplay.length) {
          const visible = getVisibleSongs(libraryStore.getState().songs, filters).map((song) => song.id),
            unqueued = visible.filter((id) => !state.queue.includes(id));
          // Once the library has played, a fresh shuffle starts another cycle.
          autoplay = shuffled(unqueued.length ? unqueued : visible);
        }
        const [songId, ...remaining] = autoplay;
        if (songId) {
          set({ queue: [...state.queue, songId], autoplay: remaining });
          playQueueSong(songId, state.queue.length);
          return;
        }
        set({ autoplay: [] });
        get().setPlaying(false);
      },
      previousSong: () => {
        const state = get();
        for (let index = state.queueIndex - 1; index >= 0; index--) {
          const song = getSong(state.queue[index]!);
          if (song && !isHiddenSong(song, libraryFilters(state))) {
            playQueueSong(song.id, index);
            return;
          }
        }
        state.restartRun();
      },
      // Previous restarts the song after 3 s, like a music player; a second press goes to the previous song.
      skipBack: () => {
        if (get().positionMs > 3000) get().restartRun();
        else get().previousSong();
      },
      jumpToLine: (index) => {
        const timeline = getLyrics(get().songId).timeline;
        if (timeline.length) get().seek(index < 0 ? 0 : timeline[Math.min(index, timeline.length - 1)]!.startMs);
      },
      // Seeking starts a new pass and releases any held answer.
      seek: (position) => {
        const state = get(),
          positionMs = Math.max(0, Math.min(position, state.durationMs));
        const lineIndex = currentOccurrence(getLyrics(state.songId).timeline, positionMs);
        const clip = state.clipPlayback,
          song = getSong(state.songId);
        const waiting = !!state.answerWait;
        clearAnswerWait(true);
        set({ lineIndex, positionMs, clipPlayback: null });
        if (clip && song && loadedSongId !== song.id) {
          loadedSongId = song.id;
          transport.load(song, positionMs);
        } else transport.seek(positionMs);
        if (waiting) get().setPlaying(true);
      },
      // Replay clears the deadline and occurrence guard, so the line can stop again.
      replayLine: () => {
        const index =
          get().answerWait?.occurrence.start ??
          currentSentence(get().songId, get().lineIndex)?.occurrence.start ??
          get().lineIndex;
        clearAnswerWait(true);
        get().jumpToLine(index);
        get().setPlaying(true);
      },
      playClip: (songId, startMs, endMs) => {
        if (get().offlineMode && !localAudioUri(songId)) {
          transport.pause();
          set({ loading: false, playing: false, playbackError: 'Song is not downloaded' });
          return;
        }
        const song = getSong(songId);
        if (!song || startMs < 0 || endMs <= startMs) return;
        clearAnswerWait();
        transport.pause();
        set({
          clipPlayback: { songId, startMs, endMs, positionMs: startMs, ended: false },
          playing: true,
          playbackError: null,
        });
        if (loadedSongId !== songId) {
          loadedSongId = songId;
          transport.load(song, startMs);
        } else transport.seek(startMs);
        transport.play();
      },
      stopClipReview: () => {
        clearClipTimer();
        get().setPlaying(false);
        set({ clipReview: null });
      },
      updatePlayback: (positionMs, durationMs, playing) => {
        const clip = get().clipPlayback;
        if (clip) {
          // Transport suppresses seek statuses; native pauses and early EOF belong to the clip.
          const ended = clip.ended || positionMs >= Math.min(clip.endMs, durationMs || clip.endMs);
          const wasPlaying = get().playing;
          set({
            clipPlayback: { ...clip, positionMs: Math.min(positionMs, clip.endMs), ended },
            playing: !ended && playing,
          });
          if (ended && wasPlaying) transport.pause();
          return;
        }
        const state = get();
        if (state.answerWait) {
          set({ positionMs, durationMs, playing: false });
          return;
        }
        const timeline = getLyrics(state.songId).timeline,
          current = currentSentence(state.songId, state.lineIndex),
          occurrence = current?.occurrence,
          line = current?.sentence;
        if (
          state.mode === 'quiz' &&
          occurrence &&
          line &&
          state.run.choices[line.id]?.length &&
          !state.run.answers[line.id] &&
          releasedIndex !== occurrence.end &&
          state.positionMs < timeline[occurrence.end]!.endMs &&
          positionMs >= timeline[occurrence.end]!.endMs
        ) {
          if (state.answerTime === 0) scoreSentence(false, null);
          else {
            const until = state.answerTime === null ? null : Date.now() + state.answerTime * 1000;
            set({
              positionMs,
              durationMs,
              lineIndex: occurrence.end,
              playing: false,
              answerWait: { occurrence, until },
            });
            transport.pause();
            if (state.answerTime !== null) scheduleAnswerRelease(state.answerTime * 1000);
            return;
          }
        }
        const lineIndex = currentOccurrence(timeline, positionMs);
        set((state) => ({ positionMs, durationMs, playing, ...(lineIndex !== state.lineIndex ? { lineIndex } : {}) }));
      },
      answer: (choice) => {
        const sentence = currentSentence(get().songId, get().lineIndex)?.sentence;
        if (scoreSentence(choice === sentence?.translation, choice)) {
          const state = get(),
            sentence = currentSentence(state.songId, state.lineIndex)?.sentence;
          const correct = sentence && state.run.answers[sentence.id]?.correct;
          if (state.answerWait) {
            if (answerTimer !== null) clearTimeout(answerTimer);
            answerTimer = null;
            set({ answerWait: { ...state.answerWait, until: null } });
            if (correct) scheduleAnswerRelease(800);
          }
        }
      },
      continueAfterAnswer: releaseAnswerWait,
      advanceLine: () => {
        const state = get(),
          length = getLyrics(state.songId).timeline.length;
        if (!length) return;
        if (state.lineIndex + 1 >= length) {
          // Advancing is a jump, so discard the held answer before ending the song.
          clearAnswerWait(true);
          finishSong();
        } else state.jumpToLine(state.lineIndex + 1);
      },
      setPlaying: (playing) => {
        const wait = get().answerWait;
        if (playing && wait && wait.occurrence.end === getLyrics(get().songId).timeline.length - 1) {
          finishSong();
          return;
        }
        if (playing && wait) scoreSentence(false, null);
        clearAnswerWait();
        const state = get();
        if (playing && state.clipPlayback && state.clipReview) {
          const clip = state.clipPlayback,
            item = state.reviewList.find((item) => item.id === state.clipReview?.ids[state.clipReview.index]),
            occurrence = item && reviewClip(item);
          if (!item || !occurrence) return;
          if (
            clip.ended ||
            clip.songId !== item.songId ||
            clip.startMs !== occurrence.startMs ||
            clip.endMs !== occurrence.endMs
          ) {
            get().playClip(item.songId, occurrence.startMs, occurrence.endMs);
            return;
          }
          set({ playing: true });
          transport.play();
          return;
        }
        if (playing && state.clipPlayback) {
          const song = getSong(state.songId);
          if (!song) return;
          transport.pause();
          set({ clipPlayback: null, playing: true });
          if (loadedSongId !== song.id) {
            loadedSongId = song.id;
            transport.load(song, state.positionMs);
          } else transport.seek(state.positionMs);
        } else set({ playing });
        if (playing) transport.play();
        else transport.pause();
      },
      addLostMark: () => {
        const state = get(),
          sentence = currentSentence(state.songId, state.lineIndex)?.sentence;
        if (sentence) prefetchBreakdown(state.songId, sentence.id);
        set((state) => {
          const line = currentSentence(state.songId, state.lineIndex)?.sentence;
          if (!line) return state;
          const sentenceId = line.id;
          if (state.reviewList.some((line) => line.sentenceId === sentenceId)) return state;
          const id = `lost-${state.nextReviewId}`;
          return {
            reviewList: [...state.reviewList, { id, songId: state.songId!, sentenceId, kind: 'new' as const }],
            addedId: id,
            addedExpiresAt: Date.now() + 3000,
            nextReviewId: state.nextReviewId + 1,
          };
        });
      },
      undoLostMark: () =>
        set((state) => ({
          reviewList:
            state.addedExpiresAt !== null && Date.now() < state.addedExpiresAt
              ? state.reviewList.filter((line) => line.id !== state.addedId)
              : state.reviewList,
          addedId: null,
          addedExpiresAt: null,
        })),
      dismissToast: () => set({ addedId: null, addedExpiresAt: null }),
      moveReviewSentence: (id, sentenceId) =>
        set((state) => {
          const item = state.reviewList.find((line) => line.id === id);
          if (
            !item ||
            item.sentenceId === sentenceId ||
            !getLyrics(item.songId).sentences.some((sentence) => sentence.id === sentenceId) ||
            state.reviewList.some((line) => line.id !== id && line.sentenceId === sentenceId)
          )
            return state;
          const clip = state.clipReview;
          if (clip?.ids[clip.index] === id) clearClipTimer();
          return {
            reviewList: state.reviewList.map((line) =>
              line.id === id ? { id: line.id, songId: line.songId, sentenceId, kind: 'new' as const } : line,
            ),
            clipReview: clip
              ? { ...clip, answers: Object.fromEntries(Object.entries(clip.answers).filter(([key]) => key !== id)) }
              : clip,
          };
        }),
      moveReviewLine: (id, sentenceId) => get().moveReviewSentence(id, sentenceId),
      removeReviewLine: (id) => get().removeReviewSentence(id),
      removeReviewSentence: (id) =>
        set((state) => {
          const clip = state.clipReview;
          if (clip?.ids[clip.index] === id) clearClipTimer();
          const ids = clip?.ids.filter((lineId) => lineId !== id);
          const current = clip && ids ? ids.indexOf(clip.ids[clip.index]!) : -1;
          return {
            reviewList: state.reviewList.filter((line) => line.id !== id),
            clipReview:
              clip && ids
                ? ids.length
                  ? { ...clip, ids, index: current < 0 ? Math.min(clip.index, ids.length - 1) : current }
                  : null
                : clip,
          };
        }),
      startClipReview: () => {
        clearClipTimer();
        get().setPlaying(false);
        set((state) => ({
          clipReview: {
            id: newRunId(),
            ids: readyReviewLines(state.reviewList).map((line) => line.id),
            index: 0,
            answers: {},
            combo: 0,
            choices: {},
          },
        }));
        playReviewClip();
      },
      answerClip: (choice) => {
        const before = get().clipReview;
        set((state) => {
          const clip = state.clipReview,
            id = clip?.ids[clip.index];
          if (!clip || !id || clip.answers[id]) return state;
          const item = state.reviewList.find((item) => item.id === id),
            line = item && sentenceForReview(item)?.sentence;
          if (!line?.translation) return state;
          const correct = choice === line.translation;
          return {
            clipReview: {
              ...clip,
              answers: { ...clip.answers, [id]: { choice, correct } },
              combo: correct ? clip.combo + 1 : 0,
            },
            fog: applyAnswer(state.fog, line.lineIds, correct, `clip:${clip.id}`),
            reviewList: state.reviewList.map((line) => (line.id !== id ? line : scheduleReview(line, correct))),
          };
        });
        if (get().clipReview !== before) {
          get().setPlaying(false);
          clearClipTimer();
          const state = get(),
            clip = state.clipReview,
            id = clip?.ids[clip.index];
          const item = state.reviewList.find((item) => item.id === id);
          if (id && clip?.answers[id]?.correct) {
            clipTimer = setTimeout(() => {
              clipTimer = null;
              get().nextClip();
            }, 800);
          } else if (item) prefetchBreakdown(item.songId, item.sentenceId);
        }
      },
      jumpToClip: (index) => {
        const clip = get().clipReview;
        if (!clip || index < 0 || index >= clip.ids.length) return;
        clearClipTimer();
        get().setPlaying(false);
        set({ clipReview: { ...clip, index } });
        playReviewClip();
      },
      nextClip: () => {
        const clip = get().clipReview;
        if (!clip) return;
        if (clip.index + 1 < clip.ids.length) get().jumpToClip(clip.index + 1);
        else {
          clearClipTimer();
          get().setPlaying(false);
          set({ clipReview: null });
        }
      },
    }),
    {
      name: 'learning-state',
      skipHydration: true,
      storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })),
      // Drop obsolete mix state. Legacy later lines have no schedule, so they're due now; a fixed value keeps repeat hydrations stable.
      merge: (persisted, current) => {
        const {
          reviewMix: _reviewMix,
          ranks: _ranks,
          playbackQueue: _playbackQueue,
          ...saved
        } = (persisted ?? {}) as Partial<AppState> & { reviewMix?: unknown; ranks?: unknown; playbackQueue?: unknown };
        const reviewList = (saved.reviewList ?? current.reviewList).map((entry) => {
          const { lineId, ...line } = entry as ReviewList[number] & { lineId?: string };
          const migrated = { ...line, sentenceId: line.sentenceId ?? lineId ?? '' };
          return migrated.kind === 'later' && (typeof migrated.step !== 'number' || typeof migrated.dueAt !== 'number')
            ? { ...migrated, step: 0, dueAt: 0 }
            : migrated;
        });
        return {
          ...current,
          ...saved,
          reviewList,
          run: current.run,
          clipReview: current.clipReview,
          runEnd: current.runEnd,
          queue: current.queue,
          queueIndex: current.queueIndex,
          autoplay: current.autoplay,
        };
      },
      partialize: (state) => ({
        offlineMode: state.offlineMode,
        analysisServerUrl: state.analysisServerUrl,
        answerTime: state.answerTime,
        reviewList: state.reviewList,
        fog: state.fog,
        perfectRuns: state.perfectRuns,
        quizToggle: state.quizToggle,
        showTranslations: state.showTranslations,
        lineByLineSongIds: state.lineByLineSongIds,
        translationPrompted: state.translationPrompted,
        hideSongsWithoutSyncedLyrics: state.hideSongsWithoutSyncedLyrics,
        hideSongsWithoutJapanese: state.hideSongsWithoutJapanese,
        lastSyncAt: state.lastSyncAt,
        lastScanAt: state.lastScanAt,
        nextReviewId: state.nextReviewId,
      }),
    },
  ),
);

setAnalysisStore(appStore);
setOfflineModeReader(() => appStore.getState().offlineMode);

/** In offline mode, download changes invalidate memoized browsing; online they don't affect visibility. */
export const getLibraryFilters = () => libraryFilters(appStore.getState());
export function useLibraryFilters() {
  const filters = appStore(useShallow(libraryFilters));
  const entries = downloadStore((state) => (filters.downloadedOnly ? state.entries : null));
  return useMemo(() => ({ ...filters, downloadEntries: entries }), [filters, entries]);
}

/** Native storage is injected at boot so store imports stay safe in plain Node. */
export async function hydrateAppState(storage: StateStorage) {
  let previous: string | null = null;
  appStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (value === previous) return;
        previous = value;
        return storage.setItem(key, value);
      },
      removeItem: (key) => {
        previous = null;
        return storage.removeItem(key);
      },
    })),
  });
  await appStore.persist.rehydrate();
}

export function resetAppState() {
  resetBreakdowns();
  clearAnswerWait(true);
  clearClipTimer();
  transport.pause();
  appStore.setState(appStore.getInitialState(), true);
  return appStore.persist.clearStorage();
}

/** Cache choices as the current sentence changes, including repeated occurrences and edited clips. */
appStore.subscribe((state, previous) => {
  if (state.quizToggle && !state.clipPlayback) state.ensureChoices();
  if (state.clipReview) state.ensureClipChoices();
  if (
    state.clipPlayback &&
    state.playing &&
    (state.reviewList !== previous.reviewList || state.clipReview !== previous.clipReview) &&
    (state.clipReview || previous.clipReview)
  ) {
    const clip = state.clipReview,
      item = state.reviewList.find((item) => item.id === clip?.ids[clip.index]);
    const occurrence = item && reviewClip(item);
    if (
      !item ||
      item.songId !== state.clipPlayback.songId ||
      occurrence?.startMs !== state.clipPlayback.startMs ||
      occurrence.endMs !== state.clipPlayback.endMs
    )
      state.setPlaying(false);
  }
});

/** Admin requests are available only with both a URL and a SecureStore token. */
export const canAnalyze = () => !!analysisServerUrl() && !!appStore.getState().analysisToken;

// Every lyric change uses the old sentence membership to remap review schedules.
libraryStore.subscribe((state, previous) => {
  if (state.lyrics === previous.lyrics) return;
  let reviewList = appStore.getState().reviewList;
  for (const id of new Set([...Object.keys(previous.lyrics), ...Object.keys(state.lyrics)])) {
    if (state.lyrics[id] !== previous.lyrics[id])
      reviewList = remapReview(reviewList, id, previous.lyrics[id], state.lyrics[id]);
  }
  const current = appStore.getState();
  const clip = current.clipReview;
  if (clip) {
    const entries = reviewList.filter((item) => clip.ids.includes(item.id)),
      ids = clip.ids.filter((id) => entries.some((item) => item.id === id)),
      index = ids.indexOf(clip.ids[clip.index]!);
    const changed = entries.filter((item) => {
      const before = previous.lyrics[item.songId]?.sentences.find((sentence) => sentence.id === item.sentenceId),
        after = state.lyrics[item.songId]?.sentences.find((sentence) => sentence.id === item.sentenceId);
      return before?.translation !== after?.translation || JSON.stringify(before?.quiz) !== JSON.stringify(after?.quiz);
    });
    if (index < 0 || changed.some((item) => item.id === clip.ids[clip.index])) clearClipTimer();
    appStore.setState({
      reviewList,
      clipReview: ids.length
        ? {
            ...clip,
            ids,
            combo: changed.length ? 0 : clip.combo,
            index: index < 0 ? Math.min(clip.index, ids.length - 1) : index,
            answers: Object.fromEntries(
              Object.entries(clip.answers).filter(
                ([id]) => ids.includes(id) && !changed.some((item) => item.id === id),
              ),
            ),
            choices: Object.fromEntries(
              Object.entries(clip.choices).filter(
                ([id]) =>
                  entries.some((item) => item.sentenceId === id) && !changed.some((item) => item.sentenceId === id),
              ),
            ),
          }
        : null,
    });
  } else appStore.setState({ reviewList });
  const before = previous.lyrics[current.songId ?? ''],
    after = state.lyrics[current.songId ?? ''];
  if (after !== before && JSON.stringify(after?.sentences) !== JSON.stringify(before?.sentences)) {
    const waiting = !!current.answerWait;
    clearAnswerWait(true);
    appStore.setState({ run: newRun() });
    if (waiting) appStore.getState().setPlaying(true);
  }
});
