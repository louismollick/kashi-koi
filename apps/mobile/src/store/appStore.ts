import { localAudioUri } from '@/downloads/store';
import { normalizeBase } from '@/analysis/client';
import { prefetchBreakdown, resetBreakdowns } from '@/analysis/breakdowns';
import {
  addLostMark,
  moveReview,
  scheduleReview,
  readyReviewSentences,
  recordAnswer,
  remapChangedSongs,
} from '@/lyrics/review';
import { applyAnswer, quizSentences } from '@/lyrics/fog';
import { prioritizeAnalyses, analysisRequests } from '@/analysis/fetcher';
import { prioritizeTranslations } from '@/japanese/translate';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { currentOccurrence } from '@/navidrome/lyrics';
import { create } from 'zustand';
import {
  getAlbumSongs,
  getArtistSongs,
  getSong,
  getLyrics,
  currentSentence,
  sentenceForReview,
  reviewClip,
  hasTranslations,
  libraryStore,
} from '@/store/libraryStore';
import { getAnswers } from '@/lyrics/choices';
import { getLibraryFilters, getVisibleSongs, isHiddenSong } from '@/data/libraryVisibility';
import { changeAwareStorage } from '@/store/persistStorage';
import { persistedSettingKeys, settingsStore } from '@/store/settingsStore';
import type { ClipReview, ReviewList, Run, Song, LineFog, RunEnd, SentenceOccurrence } from '@/types/domain';

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
  if (settingsStore.getState().offlineMode && !localAudioUri(id)) {
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
    if (!state.quizToggle || state.run.answers[sentenceId]) return state;
    if (!line.translation) return state;
    const combo = correct ? state.run.combo + 1 : 0,
      answers = { ...state.run.answers, [sentenceId]: { choice, correct } },
      sentences = quizSentences(getLyrics(state.songId)),
      perfect = correct && sentences.length > 0 && sentences.every((sentence) => answers[sentence.id]?.correct),
      addedId = `miss-${state.nextReviewId}`,
      reviewList = recordAnswer(state.reviewList, state.songId!, sentenceId, correct, addedId),
      added = reviewList.length > state.reviewList.length;
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
      ...(added ? { addedId, addedExpiresAt: Date.now() + 3000, nextReviewId: state.nextReviewId + 1 } : {}),
    };
  });
  const scored = appStore.getState().run !== before.run;
  if (scored && !correct) {
    const sentence = currentSentence(before.songId, before.lineIndex)?.sentence;
    if (sentence) prefetchBreakdown(before.songId, sentence.id);
  }
  return scored;
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
        at: Date.now(),
      },
    });
  if (state.songId && state.repeatSongId === state.songId) playQueueSong(state.songId, state.queueIndex, true);
  else state.nextSong();
}

/** Start another queued play without rebuilding the queue or autoplay. Only the automatic replay keeps Repeat song. */
function playQueueSong(songId: string, queueIndex: number, repeat = false) {
  const state = appStore.getState(),
    quizToggle = state.quizToggle && hasTranslations(songId);
  appStore.setState({
    songId,
    queueIndex,
    ...(repeat ? {} : { repeatSongId: null }),
    lineIndex: 0,
    positionMs: 0,
    durationMs: getSong(songId)!.duration * 1000,
    playbackError: null,
    run: newRun(),
    playing: true,
    quizToggle,
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
  quizToggle: boolean;
  fog: Record<string, LineFog>;
  perfectRuns: Record<string, true>;
  runEnd: RunEnd | null;
  dismissRunEnd: () => void;
  playing: boolean;
  queue: string[];
  queueIndex: number;
  autoplay: string[];
  reviewList: ReviewList;
  run: Run;
  answerWait: { occurrence: SentenceOccurrence; until: number | null } | null;
  clipPlayback: { songId: string; startMs: number; endMs: number; positionMs: number; ended: boolean } | null;
  clipReview: ClipReview | null;
  addedId: string | null;
  addedExpiresAt: number | null;
  nextReviewId: number;
  startSong: (songId: string, list?: string[]) => void;
  playNext: (songIds: string[]) => void;
  addToQueue: (songIds: string[]) => void;
  playUpNext: (position: number) => void;
  removeUpNext: (position: number, songId: string) => void;
  moveUpNext: (from: number, to: number, songId: string) => void;
  clearUpNext: () => void;
  startAlbum: (albumId: string, shuffle?: boolean) => void;
  startArtist: (artistId: string, shuffle?: boolean) => void;
  /** The song that replays when it ends instead of advancing; skipping or starting any song turns it off. */
  repeatSongId: string | null;
  setRepeatSong: (songId: string, enabled: boolean) => void;
  restartRun: () => void;
  setQuizToggle: (enabled: boolean) => void;
  nextSong: () => void;
  previousSong: () => void;
  skipBack: () => void;
  ensureChoices: () => void;
  ensureClipChoices: () => void;
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
  removeReviewSentence: (id: string) => void;
  startClipReview: () => void;
  answerClip: (choice: string) => void;
  nextClip: () => void;
  jumpToClip: (index: number) => void;
};

/** Shuffle optionally, then play visible songs as the queue. */
function startList(songs: Song[], shuffle: boolean) {
  const ids = getVisibleSongs(songs, getLibraryFilters()).map((song) => song.id);
  if (!ids.length) return;
  if (shuffle) shuffled(ids);
  appStore.getState().startSong(ids[0]!, ids);
}

/** Queue actions with nothing playing start the songs as a new queue. */
function startIdle(songIds: string[]) {
  const ids = [...new Set(songIds)].filter((id) => getSong(id));
  if (ids.length) appStore.getState().startSong(ids[0]!, ids);
}

/**
 * Put songs right after the current one or at the end of the queue. Songs already upcoming move instead of repeating,
 * and leave autoplay. Play next skips the current song; Add to queue may queue it again.
 */
function insertUpcoming(state: AppState, songIds: string[], at: 'next' | 'end') {
  const ids = [...new Set(songIds)].filter((id) => getSong(id) && (at === 'end' || id !== state.songId));
  if (!ids.length) return state;
  const moving = new Set(ids),
    played = state.queue.slice(0, state.queueIndex + 1),
    upcoming = state.queue.slice(state.queueIndex + 1).filter((id) => !moving.has(id));
  return {
    queue: at === 'next' ? [...played, ...ids, ...upcoming] : [...played, ...upcoming, ...ids],
    autoplay: state.autoplay.filter((id) => !moving.has(id)),
  };
}

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
      playing: false,
      fog: {},
      perfectRuns: {},
      runEnd: null,
      dismissRunEnd: () => set({ runEnd: null }),
      answerWait: null,
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
        const queue = [...(list ?? [songId])],
          queued = new Set(queue);
        set({
          queue,
          autoplay: shuffled(
            getVisibleSongs(libraryStore.getState().songs, getLibraryFilters())
              .map((song) => song.id)
              .filter((id) => !queued.has(id)),
          ),
        });
        playQueueSong(songId, queue.indexOf(songId));
      },
      startAlbum: (albumId, shuffle = false) => startList(getAlbumSongs(albumId), shuffle),
      startArtist: (artistId, shuffle = false) => startList(getArtistSongs(artistId), shuffle),
      // With nothing playing, both start the songs instead.
      playNext: (songIds) => {
        if (!get().songId) return startIdle(songIds);
        set((state) => insertUpcoming(state, songIds, 'next'));
        prioritizeUpNext();
      },
      addToQueue: (songIds) => {
        if (!get().songId) return startIdle(songIds);
        set((state) => insertUpcoming(state, songIds, 'end'));
        prioritizeUpNext();
      },
      // Positions index `[...upcoming queue, ...autoplay]`, like playUpNext. The id guards against a stale position.
      removeUpNext: (position, songId) =>
        set((state) => {
          const start = state.queueIndex + 1,
            queued = state.queue.length - start;
          if ([...state.queue.slice(start), ...state.autoplay][position] !== songId) return state;
          if (position < queued) return { queue: state.queue.filter((_, index) => index !== start + position) };
          return { autoplay: state.autoplay.filter((_, index) => index !== position - queued) };
        }),
      // Reorders the upcoming queue only; autoplay keeps its shuffle. The id guards against a stale position.
      moveUpNext: (from, to, songId) =>
        set((state) => {
          const upcoming = state.queue.slice(state.queueIndex + 1);
          const valid = (position: number) => Number.isInteger(position) && position >= 0 && position < upcoming.length;
          if (from === to || upcoming[from] !== songId || !valid(to)) return state;
          const [id] = upcoming.splice(from, 1);
          upcoming.splice(to, 0, id!);
          return { queue: [...state.queue.slice(0, state.queueIndex + 1), ...upcoming] };
        }),
      clearUpNext: () => set((state) => ({ queue: state.queue.slice(0, state.queueIndex + 1) })),
      repeatSongId: null,
      setRepeatSong: (songId, enabled) =>
        set((state) => ({
          repeatSongId: enabled ? songId : state.repeatSongId === songId ? null : state.repeatSongId,
        })),
      playUpNext: (position) => {
        if (!Number.isInteger(position) || position < 0) return;
        const state = get(),
          upcoming = getUpNext(state),
          songId = [...upcoming.queue, ...upcoming.autoplay][position];
        const song = songId && getSong(songId);
        if (!song || isHiddenSong(song, getLibraryFilters())) return;
        if (position < upcoming.queue.length) playQueueSong(song.id, state.queueIndex + 1 + position);
        else {
          const index = position - upcoming.queue.length;
          set({ queue: [...state.queue, song.id], autoplay: state.autoplay.slice(index + 1) });
          playQueueSong(song.id, state.queue.length);
        }
      },
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
        set({ quizToggle: enabled });
        if (waiting) get().setPlaying(true);
      },
      nextSong: () => {
        const state = get(),
          filters = getLibraryFilters();
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
            queued = new Set(state.queue),
            unqueued = visible.filter((id) => !queued.has(id));
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
          if (song && !isHiddenSong(song, getLibraryFilters())) {
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
        if (settingsStore.getState().offlineMode && !localAudioUri(songId)) {
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
          state.quizToggle &&
          occurrence &&
          line &&
          state.run.choices[line.id]?.length &&
          !state.run.answers[line.id] &&
          releasedIndex !== occurrence.end &&
          state.positionMs < timeline[occurrence.end]!.endMs &&
          positionMs >= timeline[occurrence.end]!.endMs
        ) {
          const { answerTime } = settingsStore.getState();
          if (answerTime === 0) scoreSentence(false, null);
          else {
            const until = answerTime === null ? null : Date.now() + answerTime * 1000;
            set({
              positionMs,
              durationMs,
              lineIndex: occurrence.end,
              playing: false,
              answerWait: { occurrence, until },
            });
            transport.pause();
            if (answerTime !== null) scheduleAnswerRelease(answerTime * 1000);
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
          const id = `lost-${state.nextReviewId}`,
            reviewList = addLostMark(state.reviewList, id, state.songId!, sentenceId);
          if (reviewList === state.reviewList) return state;
          return {
            reviewList,
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
          const reviewList = moveReview(state.reviewList, id, sentenceId);
          if (reviewList === state.reviewList) return state;
          const clip = state.clipReview;
          if (clip?.ids[clip.index] === id) clearClipTimer();
          return {
            reviewList,
            clipReview: clip
              ? { ...clip, answers: Object.fromEntries(Object.entries(clip.answers).filter(([key]) => key !== id)) }
              : clip,
          };
        }),
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
            ids: readyReviewSentences(state.reviewList).map((line) => line.id),
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
      // Drop obsolete mix state and the settings this blob held before they moved to settingsStore.
      // Legacy later lines have no schedule, so they're due now; a fixed value keeps repeat hydrations stable.
      merge: (persisted, current) => {
        const {
          reviewMix: _reviewMix,
          ranks: _ranks,
          playbackQueue: _playbackQueue,
          ...rest
        } = (persisted ?? {}) as Partial<AppState> & { reviewMix?: unknown; ranks?: unknown; playbackQueue?: unknown };
        const saved: Partial<AppState> = Object.fromEntries(
          Object.entries(rest).filter(([key]) => !persistedSettingKeys.includes(key)),
        );
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
        reviewList: state.reviewList,
        fog: state.fog,
        perfectRuns: state.perfectRuns,
        quizToggle: state.quizToggle,
        nextReviewId: state.nextReviewId,
      }),
    },
  ),
);

/** Native storage is injected at boot so store imports stay safe in plain Node. Hydrate after `hydrateSettings`, which seeds from this blob first. */
export async function hydrateAppState(storage: StateStorage) {
  appStore.persist.setOptions({ storage: changeAwareStorage(storage) });
  await appStore.persist.rehydrate();
}

/** Log out: back to a fresh install, in memory and in storage. */
export function resetAppState() {
  resetBreakdowns();
  clearAnswerWait(true);
  clearClipTimer();
  transport.pause();
  appStore.setState(appStore.getInitialState(), true);
  settingsStore.setState(settingsStore.getInitialState(), true);
  analysisRequests.setState({}, true);
  return Promise.all([appStore.persist.clearStorage(), settingsStore.persist.clearStorage()]);
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

/** Fetch the whole library's analyses, with the current song and queue first. */
export function fetchLibraryAnalyses() {
  const state = appStore.getState();
  return prioritizeAnalyses(
    [
      state.songId,
      ...getUpNext(state).queue,
      ...state.autoplay,
      ...libraryStore.getState().songs.map((song) => song.id),
    ].filter((id): id is string => !!id),
  );
}

/** Point the app at another analysis server: drop its cached breakdowns, then refetch analyses from it. */
export function setAnalysisServerUrl(url: string) {
  resetBreakdowns();
  settingsStore.setState({ analysisServerUrl: normalizeBase(url) });
  void fetchLibraryAnalyses();
}

// Every lyric change uses the old sentence membership to remap review schedules.
libraryStore.subscribe((state, previous) => {
  if (state.lyrics === previous.lyrics) return;
  const reviewList = remapChangedSongs(appStore.getState().reviewList, previous.lyrics, state.lyrics);
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
  } else if (reviewList !== current.reviewList) appStore.setState({ reviewList });
  // Retimed lyrics can move the current line onto an uncached sentence without touching the review list.
  else if (current.quizToggle && !current.clipPlayback) current.ensureChoices();
  const before = previous.lyrics[current.songId ?? ''],
    after = state.lyrics[current.songId ?? ''];
  if (after !== before && JSON.stringify(after?.sentences) !== JSON.stringify(before?.sentences)) {
    const waiting = !!current.answerWait;
    clearAnswerWait(true);
    appStore.setState({ run: newRun() });
    if (waiting) appStore.getState().setPlaying(true);
  }
});
