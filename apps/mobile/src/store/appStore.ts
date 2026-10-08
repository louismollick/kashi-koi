import { isJapanese } from '@/japanese/text';
import { prioritizeTranslations } from '@/japanese/translate';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { currentOccurrence } from '@/navidrome/lyrics';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  getAlbumSongs,
  getSong,
  getLyrics,
  occurrenceLine,
  hasTranslations,
  libraryStore,
  getAnswers,
  getLineText,
  japaneseLines,
  readyReviewLines,
} from '@/store/libraryStore';
import { getVisibleSongs, isHiddenSong, type LibraryFilters } from '@/data/libraryVisibility';
import type { ClipReview, ListenMode, QuizMode, QuizToggle, ReviewList, Run, Song, Rank } from '@/types/domain';

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
  else if (wait) releasedIndex = wait.lineIndex;
  if (wait) appStore.setState({ answerWait: null });
}

/** Release the held line after its deadline or answer feedback. */
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
  appStore.setState({ clipPlayback: null, clipReview: null, loading: true });
  prioritizeTranslations([id, ...(appStore.getState().playbackQueue ?? [])]);
  const song = getSong(id);
  if (song) {
    loadedSongId = id;
    transport.load(song);
    transport.play();
  }
}

/** Play the first occurrence of the current review line. */
function playReviewClip() {
  const state = appStore.getState(),
    clip = state.clipReview;
  const item = state.reviewList.find((item) => item.id === clip?.ids[clip.index]);
  const occurrence = item && getLyrics(item.songId).timeline.find((occurrence) => occurrence.lineId === item.lineId);
  if (item && occurrence) state.playClip(item.songId, occurrence.startMs, occurrence.endMs);
}

const dayMs = 24 * 60 * 60 * 1000;

/** Correct answers double the interval; a miss resets the schedule. */
function scheduleReview(line: ReviewList[number], correct: boolean): ReviewList[number] {
  const { id, songId, lineId } = line;
  if (!correct) return { id, songId, lineId, kind: 'due', misses: line.kind === 'due' ? line.misses + 1 : 1 };
  const step = line.kind === 'later' ? line.step + 1 : 0;
  return { id, songId, lineId, kind: 'later', step, dueAt: Date.now() + 2 ** step * dayMs };
}

const newRun = (): Run => ({ choices: {}, answers: {}, combo: 0, bestCombo: 0, finished: false });

/** Step from the original queue position, including a song hidden during playback. */
function queueStep(ids: string[], currentId: string | null, direction: 1 | -1, filters: LibraryFilters) {
  const current = currentId ? ids.indexOf(currentId) : -1;
  for (let offset = 1; offset <= ids.length; offset++) {
    const song = getSong(ids[(current + direction * offset + ids.length) % ids.length]!);
    if (song && !isHiddenSong(song, filters)) return song;
  }
  return null;
}

/** Grade the entire song; skipped lines are misses in the Results screen. */
export function getRunSummary(song: Song, run: Run) {
  const hits = japaneseLines(song.id).filter((line) => run.answers[line.id]?.correct).length;
  const total = japaneseLines(song.id).length;
  const missed = japaneseLines(song.id).filter((line) => !run.answers[line.id]?.correct);
  const fraction = total ? hits / total : 0;
  const rank: Rank = fraction === 1 ? 'S' : fraction >= 0.8 ? 'A' : fraction >= 0.6 ? 'B' : 'C';
  return { hits, total, missed, rank };
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
  ranks: Record<string, Rank>;
  lastSyncAt: number | null;
  lastScanAt: number | null;
  playing: boolean;
  hideSongsWithoutSyncedLyrics: boolean;
  hideSongsWithoutJapanese: boolean;
  playbackQueue: string[] | null;
  reviewList: ReviewList;
  run: Run;
  answerTime: number | null;
  answerWait: { lineIndex: number; until: number | null } | null;
  cycleAnswerTime: () => void;
  clipPlayback: { songId: string; startMs: number; endMs: number; positionMs: number; ended: boolean } | null;
  clipReview: ClipReview | null;
  addedId: string | null;
  addedExpiresAt: number | null;
  nextReviewId: number;
  startSong: (songId: string) => void;
  startAlbum: (albumId: string, shuffle?: boolean) => void;
  restartRun: () => void;
  setQuizToggle: (enabled: boolean) => void;
  nextSong: () => void;
  previousSong: () => void;
  skipBack: () => void;
  showTranslations: boolean;
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
  advanceLine: () => void;
  updatePlayback: (positionMs: number, durationMs: number, playing: boolean) => void;
  completeRun: () => void;
  setPlaying: (playing: boolean) => void;
  playClip: (songId: string, startMs: number, endMs: number) => void;
  stopClipReview: () => void;
  addLostMark: () => void;
  undoLostMark: () => void;
  dismissToast: () => void;
  moveReviewLine: (id: string, lineId: string) => void;
  removeReviewLine: (id: string) => void;
  startClipReview: () => void;
  answerClip: (choice: string) => void;
  nextClip: () => void;
  jumpToClip: (index: number) => void;
  sendToReview: (lineId: string, enabled: boolean) => void;
};

/** Share the same filter mapping between queue actions and component selectors. */
const libraryFilters = (state: AppState): LibraryFilters => ({
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
      ranks: {},
      lastSyncAt: null,
      lastScanAt: null,
      answerTime: null,
      answerWait: null,
      showTranslations: false,
      translationPrompted: false,
      hideSongsWithoutSyncedLyrics: true,
      hideSongsWithoutJapanese: true,
      playbackQueue: null,
      reviewList: [],
      run: newRun(),
      clipReview: null,
      clipPlayback: null,
      addedId: null,
      addedExpiresAt: null,
      nextReviewId: 1,
      startSong: (songId) => {
        if (!getSong(songId) || (get().loading && get().songId === songId && !get().clipPlayback)) return;
        const state = get(),
          quizToggle = hasTranslations(songId) && state.quizToggle;
        set({
          songId,
          lineIndex: 0,
          positionMs: 0,
          durationMs: getSong(songId)!.duration * 1000,
          playbackError: null,
          run: newRun(),
          playing: true,
          playbackQueue: null,
          quizToggle,
          mode: quizToggle ? 'quiz' : 'listen',
        });
        playSong(songId);
      },
      startAlbum: (albumId, shuffle = false) => {
        const tracks = getVisibleSongs(getAlbumSongs(albumId), libraryFilters(get()));
        if (!tracks.length) return;
        // Shuffle the whole album queue, not just its starting song.
        if (shuffle)
          for (let index = tracks.length - 1; index > 0; index--) {
            const other = Math.floor(Math.random() * (index + 1));
            [tracks[index], tracks[other]] = [tracks[other]!, tracks[index]!];
          }
        get().startSong(tracks[0]!.id);
        set({ playbackQueue: tracks.map((song) => song.id) });
        prioritizeTranslations(tracks.map((song) => song.id));
      },
      // Cycle the fixed answer-time presets for future stops.
      cycleAnswerTime: () => {
        const presets = [null, 10, 5, 3, 0];
        set({ answerTime: presets[(presets.indexOf(get().answerTime) + 1) % presets.length]! });
      },
      toggleTranslations: () => set((state) => ({ showTranslations: !state.showTranslations })),
      ensureChoices: () =>
        set((state) => {
          const line = occurrenceLine(state.songId, state.lineIndex),
            song = getSong(state.songId);
          if (!song || !line?.translation || !isJapanese(getLineText(line)) || state.run.choices[line.id]) return state;
          return {
            run: { ...state.run, choices: { ...state.run.choices, [line.id]: getAnswers(song, state.lineIndex) } },
          };
        }),
      ensureClipChoices: () =>
        set((state) => {
          const clip = state.clipReview,
            item = state.reviewList.find((item) => item.id === clip?.ids[clip.index]);
          const song = item && getSong(item.songId);
          if (!clip || !item || !song || clip.choices[item.lineId]) return state;
          const index = getLyrics(song.id).timeline.findIndex((occurrence) => occurrence.lineId === item.lineId);
          return { clipReview: { ...clip, choices: { ...clip.choices, [item.lineId]: getAnswers(song, index) } } };
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
        set({ quizToggle: enabled, mode: enabled ? 'quiz' : 'listen', run: newRun() });
        if (waiting) get().setPlaying(true);
      },
      nextSong: () => {
        const { songId, playbackQueue } = get();
        const next = queueStep(
          playbackQueue ?? libraryStore.getState().songs.map((song) => song.id),
          songId,
          1,
          libraryFilters(get()),
        );
        if (!next) {
          get().setPlaying(false);
          return;
        }
        set({
          songId: next.id,
          lineIndex: 0,
          positionMs: 0,
          playbackError: null,
          run: newRun(),
          playing: true,
          quizToggle: get().quizToggle && hasTranslations(next.id),
          mode: get().quizToggle && hasTranslations(next.id) ? 'quiz' : 'listen',
        });
        playSong(next.id);
      },
      previousSong: () => {
        const { songId, playbackQueue } = get();
        const previous = queueStep(
          playbackQueue ?? libraryStore.getState().songs.map((song) => song.id),
          songId,
          -1,
          libraryFilters(get()),
        );
        if (previous) {
          set({
            quizToggle: get().quizToggle && hasTranslations(previous.id),
            mode: get().quizToggle && hasTranslations(previous.id) ? 'quiz' : 'listen',
            songId: previous.id,
            lineIndex: 0,
            positionMs: 0,
            playbackError: null,
            run: newRun(),
            playing: true,
          });
          playSong(previous.id);
        }
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
        const index = get().answerWait?.lineIndex ?? get().lineIndex;
        clearAnswerWait(true);
        get().jumpToLine(index);
        get().setPlaying(true);
      },
      playClip: (songId, startMs, endMs) => {
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
          occurrence = timeline[state.lineIndex],
          line = occurrenceLine(state.songId, state.lineIndex);
        if (
          state.mode === 'quiz' &&
          state.answerTime !== 0 &&
          !state.run.finished &&
          occurrence &&
          line &&
          isJapanese(getLineText(line)) &&
          state.run.choices[line.id]?.length &&
          !state.run.answers[line.id] &&
          releasedIndex !== state.lineIndex &&
          positionMs >= occurrence.endMs - 100
        ) {
          const until = state.answerTime === null ? null : Date.now() + state.answerTime * 1000;
          set({ positionMs, durationMs, playing: false, answerWait: { lineIndex: state.lineIndex, until } });
          transport.pause();
          if (state.answerTime !== null) scheduleAnswerRelease(state.answerTime * 1000);
          return;
        }
        const lineIndex = currentOccurrence(timeline, positionMs);
        set((state) => ({ positionMs, durationMs, playing, ...(lineIndex !== state.lineIndex ? { lineIndex } : {}) }));
      },
      completeRun: () => {
        clearAnswerWait();
        const song = getSong(get().songId);
        if (!song) return;
        const rank = getRunSummary(song, get().run).rank,
          order: Rank[] = ['C', 'B', 'A', 'S'],
          previous = get().ranks[song.id];
        set({
          run: { ...get().run, finished: true },
          playing: false,
          ranks:
            !previous || order.indexOf(rank) > order.indexOf(previous)
              ? { ...get().ranks, [song.id]: rank }
              : get().ranks,
        });
        transport.pause();
      },
      answer: (choice) => {
        const before = get().run;
        set((state) => {
          const line = occurrenceLine(state.songId, state.lineIndex);
          if (!line || !isJapanese(getLineText(line))) return state;
          const lineId = line.id;
          if (state.run.answers[lineId] || state.run.finished) return state;
          if (!line.translation) return state;
          const correct = choice === line.translation;
          const combo = correct ? state.run.combo + 1 : 0;
          return {
            run: {
              ...state.run,
              combo,
              bestCombo: Math.max(combo, state.run.bestCombo),
              answers: { ...state.run.answers, [lineId]: { choice, correct } },
            },
            reviewList: state.reviewList.map((item) =>
              item.songId === state.songId && item.lineId === lineId ? scheduleReview(item, correct) : item,
            ),
          };
        });
        if (get().answerWait && get().run !== before) {
          set({ answerWait: { ...get().answerWait!, until: null } });
          scheduleAnswerRelease(800);
        }
      },
      advanceLine: () => {
        const state = get(),
          length = getLyrics(state.songId).timeline.length;
        if (!length) return;
        if (state.lineIndex + 1 >= length) {
          if (state.quizToggle) state.completeRun();
          else state.nextSong();
        } else state.jumpToLine(state.lineIndex + 1);
      },
      setPlaying: (playing) => {
        const wait = get().answerWait;
        if (playing && wait && wait.lineIndex === getLyrics(get().songId).timeline.length - 1) {
          get().completeRun();
          return;
        }
        clearAnswerWait();
        const state = get();
        if (playing && state.clipPlayback && state.clipReview) {
          const clip = state.clipPlayback;
          if (clip.ended) {
            get().playClip(clip.songId, clip.startMs, clip.endMs);
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
      addLostMark: () =>
        set((state) => {
          const line = occurrenceLine(state.songId, state.lineIndex);
          if (!line || !isJapanese(getLineText(line))) return state;
          const lineId = line.id;
          if (state.reviewList.some((line) => line.lineId === lineId)) return state;
          const id = `lost-${state.nextReviewId}`;
          return {
            reviewList: [...state.reviewList, { id, songId: state.songId!, lineId, kind: 'new' as const }],
            addedId: id,
            addedExpiresAt: Date.now() + 3000,
            nextReviewId: state.nextReviewId + 1,
          };
        }),
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
      moveReviewLine: (id, lineId) =>
        set((state) => {
          const item = state.reviewList.find((line) => line.id === id);
          if (
            !item ||
            item.lineId === lineId ||
            !getLyrics(item.songId).lines.some((line) => line.id === lineId && isJapanese(getLineText(line))) ||
            state.reviewList.some((line) => line.id !== id && line.lineId === lineId)
          )
            return state;
          const clip = state.clipReview;
          if (clip?.ids[clip.index] === id) clearClipTimer();
          return {
            reviewList: state.reviewList.map((line) =>
              line.id === id ? { id: line.id, songId: line.songId, lineId, kind: 'new' as const } : line,
            ),
            clipReview: clip
              ? { ...clip, answers: Object.fromEntries(Object.entries(clip.answers).filter(([key]) => key !== id)) }
              : clip,
          };
        }),
      removeReviewLine: (id) =>
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
            line = item && getLyrics(item.songId).lines.find((line) => line.id === item.lineId);
          if (!line?.translation || !isJapanese(getLineText(line))) return state;
          const correct = choice === line.translation;
          return {
            clipReview: {
              ...clip,
              answers: { ...clip.answers, [id]: { choice, correct } },
              combo: correct ? clip.combo + 1 : 0,
            },
            reviewList: state.reviewList.map((line) => (line.id !== id ? line : scheduleReview(line, correct))),
          };
        });
        if (get().clipReview !== before) {
          get().setPlaying(false);
          clearClipTimer();
          clipTimer = setTimeout(() => {
            clipTimer = null;
            get().nextClip();
          }, 800);
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
      sendToReview: (lineId, enabled) =>
        set((state) => {
          if (!getLyrics(state.songId).lines.some((line) => line.id === lineId && isJapanese(getLineText(line))))
            return state;
          const exists = state.reviewList.some((line) => line.lineId === lineId);
          if (enabled && !exists && state.songId)
            return {
              reviewList: [
                ...state.reviewList,
                { id: `result-${state.nextReviewId}`, lineId, songId: state.songId!, kind: 'due' as const, misses: 1 },
              ],
              nextReviewId: state.nextReviewId + 1,
            };
          if (!enabled)
            return {
              reviewList: state.reviewList.filter((line) => !(line.lineId === lineId && line.id.startsWith('result-'))),
            };
          return state;
        }),
    }),
    {
      name: 'learning-state',
      skipHydration: true,
      storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })),
      // Drop obsolete mix state. Legacy later lines have no schedule, so they're due now; a fixed value keeps repeat hydrations stable.
      merge: (persisted, current) => {
        const { reviewMix: _reviewMix, ...saved } = (persisted ?? {}) as Partial<AppState> & { reviewMix?: unknown };
        const reviewList = (saved.reviewList ?? current.reviewList).map((line) =>
          line.kind === 'later' && (typeof line.step !== 'number' || typeof line.dueAt !== 'number')
            ? { ...line, step: 0, dueAt: 0 }
            : line,
        );
        return { ...current, ...saved, reviewList };
      },
      partialize: (state) => ({
        answerTime: state.answerTime,
        reviewList: state.reviewList,
        ranks: state.ranks,
        quizToggle: state.quizToggle,
        showTranslations: state.showTranslations,
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

/** Subscribe only to library visibility settings. */
export function useLibraryFilters() {
  return appStore(useShallow(libraryFilters));
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
  clearAnswerWait(true);
  clearClipTimer();
  transport.pause();
  appStore.setState(appStore.getInitialState(), true);
  return appStore.persist.clearStorage();
}

/** Cache choices as the current line changes, including repeated occurrences and edited clips. */
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
    const occurrence = item && getLyrics(item.songId).timeline.find((occurrence) => occurrence.lineId === item.lineId);
    if (
      !item ||
      item.songId !== state.clipPlayback.songId ||
      occurrence?.startMs !== state.clipPlayback.startMs ||
      occurrence.endMs !== state.clipPlayback.endMs
    )
      state.setPlaying(false);
  }
});
