import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyAnswer, lyricsFog } from '../src/lyrics/fog';
import {
  appStore,
  finishSong,
  getUpNext,
  hydrateAppState,
  remoteSkip,
  resetAppState,
  dropRemovedSong,
  resumePlayback,
  setTransport,
} from '../src/store/appStore';
import { settingsStore } from '../src/store/settingsStore';
import { getLyrics, libraryStore } from '../src/store/libraryStore';
import type { LineFog } from '../src/types/domain';
import { albums, artists, firstSong, songs, songLyrics } from './fixtures';

import type { RunEnd } from '../src/types/domain';

/** Run-end summaries carry a wall-clock `at`; compare the rest. */
const withoutTime = (runEnd: RunEnd | null) => {
  if (!runEnd) return runEnd;
  const { at: _at, ...rest } = runEnd;
  return rest;
};

beforeEach(async () => {
  setTransport({ load() {}, play() {}, pause() {}, seek() {} });
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  appStore.getState().startSong('dawn', ['dawn', 'glass']);
  appStore.setState({ loading: false });
});

test('fog answers follow every transition and do not mutate the saved map', () => {
  const cases: { before?: LineFog; correct: boolean; after?: LineFog }[] = [
    { correct: true, after: { state: 'half', run: 'run' } },
    { correct: false },
    { before: { state: 'half', run: 'run' }, correct: true, after: { state: 'half', run: 'run' } },
    { before: { state: 'half', run: 'earlier' }, correct: true, after: { state: 'clear' } },
    { before: { state: 'half', run: 'run' }, correct: false },
    { before: { state: 'clear' }, correct: true, after: { state: 'clear' } },
    { before: { state: 'clear' }, correct: false, after: { state: 'red' } },
    { before: { state: 'red' }, correct: true, after: { state: 'clear' } },
    { before: { state: 'red' }, correct: false, after: { state: 'red' } },
  ];
  for (const { before, correct, after } of cases) {
    const fog: Record<string, LineFog> = before ? { line: before } : {};
    const snapshot = structuredClone(fog);
    const result = applyAnswer(fog, ['line', 'line', 'other'], correct, 'run');
    assert.deepEqual(result.line, after);
    assert.deepEqual(result.other, correct ? { state: 'half', run: 'run' } : undefined);
    assert.deepEqual(fog, snapshot);
  }
});

test('fog uses quiz sentence order, deduplicates repeats and takes the weakest line', () => {
  const lyrics = getLyrics('dawn');
  libraryStore.setState({
    lyrics: {
      ...libraryStore.getState().lyrics,
      dawn: {
        ...lyrics,
        sentences: [
          { id: 'clear', lineIds: ['a'], translation: 'A' },
          { id: 'half', lineIds: ['b', 'c'], translation: 'B' },
          { id: 'red', lineIds: ['d', 'e'], translation: 'C' },
          { id: 'fog', lineIds: ['f', 'g'], translation: 'D' },
          { id: 'untranslated', lineIds: ['h'] },
          { id: 'untimed', lineIds: ['i'], translation: 'I' },
        ],
        sentenceTimeline: ['fog', 'half', 'red', 'clear', 'half', 'untranslated'].map((sentenceId, index) => ({
          sentenceId,
          start: index,
          end: index,
        })),
      },
    },
  });
  const fog: Record<string, LineFog> = {
    a: { state: 'clear' },
    b: { state: 'clear' },
    c: { state: 'half', run: 'old' },
    d: { state: 'half', run: 'old' },
    e: { state: 'red' },
    f: { state: 'red' },
  };
  assert.deepEqual(lyricsFog(getLyrics('dawn'), fog), { tiles: ['fog', 'half', 'red', 'clear'], percent: 38 });
  assert.deepEqual(lyricsFog(getLyrics('missing'), fog), { tiles: [], percent: 0 });
});

test('a perfect run requires every distinct quiz sentence and remains earned after a later miss', () => {
  appStore.getState().setQuizToggle(true);
  const lyrics = getLyrics('dawn');
  for (const [index, occurrence] of lyrics.sentenceTimeline.entries()) {
    appStore.getState().jumpToLine(occurrence.start);
    const sentence = lyrics.sentences.find((sentence) => sentence.id === occurrence.sentenceId)!;
    appStore.getState().answer(sentence.translation!);
    assert.equal(appStore.getState().run.perfect, index === lyrics.sentenceTimeline.length - 1);
  }
  assert.equal(appStore.getState().perfectRuns.dawn, true);
  assert.equal(lyricsFog(getLyrics('dawn'), appStore.getState().fog).percent, 50);
  const id = appStore.getState().run.id;
  finishSong();
  assert.deepEqual(withoutTime(appStore.getState().runEnd), {
    songId: 'dawn',
    hits: 14,
    answered: 14,
    bestCombo: 14,
    perfect: true,
  });
  assert.notEqual(appStore.getState().run.id, id);
  appStore.getState().dismissRunEnd();
  assert.equal(appStore.getState().runEnd, null);
  appStore.getState().previousSong();
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().run.perfect, false);
  assert.equal(appStore.getState().perfectRuns.dawn, true);
});

test('a miss adds one due sentence with undo while keeping the fog answer', (t) => {
  t.mock.method(Date, 'now', () => 1000);
  appStore.getState().setQuizToggle(true);
  const sentence = getLyrics('dawn').sentences[0]!;
  appStore.setState({ fog: { [sentence.lineIds[0]!]: { state: 'clear' } } });
  appStore.getState().answer('wrong');
  assert.deepEqual(appStore.getState().reviewList, [
    { id: 'miss-1', songId: 'dawn', sentenceId: sentence.id, kind: 'due', misses: 1 },
  ]);
  assert.equal(appStore.getState().addedId, 'miss-1');
  assert.equal(appStore.getState().addedExpiresAt, 4000);
  appStore.getState().undoLostMark();
  assert.deepEqual(appStore.getState().reviewList, []);
  assert.deepEqual(appStore.getState().fog[sentence.lineIds[0]!], { state: 'red' });
  assert.equal(appStore.getState().run.answers[sentence.id]?.correct, false);
  appStore.getState().restartRun();
  appStore.getState().answer('wrong');
  appStore.getState().dismissToast();
  appStore.getState().restartRun();
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().reviewList.length, 1);
  assert.equal(appStore.getState().addedId, null);
  appStore.getState().restartRun();
  appStore.getState().answer(sentence.translation!);
  assert.equal(appStore.getState().reviewList[0]?.kind, 'later');
  assert.deepEqual(appStore.getState().fog[sentence.lineIds[0]!], { state: 'clear' });
});

for (const release of ['timeout', 'play', 'zero'] as const)
  test(`${release} scores an unanswered sentence once and resets combo`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const calls: string[] = [];
    const detach = setTransport({
      load() {},
      play: () => calls.push('play'),
      pause: () => calls.push('pause'),
      seek() {},
    });
    try {
      appStore.getState().setQuizToggle(true);
      const lyrics = getLyrics('dawn'),
        first = lyrics.sentences[0]!,
        sentence = lyrics.sentences[1]!,
        occurrence = lyrics.sentenceTimeline[1]!,
        endMs = lyrics.timeline[occurrence.end]!.endMs;
      appStore.getState().answer(first.translation!);
      appStore.getState().jumpToLine(occurrence.start);
      settingsStore.setState({ answerTime: release === 'zero' ? 0 : release === 'timeout' ? 3 : null });
      appStore.setState({
        fog: Object.fromEntries(sentence.lineIds.map((id) => [id, { state: 'clear' as const }])),
      });
      appStore.getState().updatePlayback(endMs - 1, 238000, true);
      assert.equal(appStore.getState().run.answers[sentence.id], undefined);
      appStore.getState().updatePlayback(endMs, 238000, true);
      if (release === 'timeout') {
        t.mock.timers.tick(2999);
        assert.equal(appStore.getState().run.combo, 1);
        t.mock.timers.tick(1);
      } else if (release === 'play') appStore.getState().setPlaying(true);
      const state = appStore.getState();
      assert.equal(state.answerWait, null);
      assert.equal(state.playing, true);
      assert.deepEqual(state.run.answers[sentence.id], { choice: null, correct: false });
      assert.equal(state.run.combo, 0);
      assert.equal(state.run.bestCombo, 1);
      for (const id of sentence.lineIds) assert.deepEqual(state.fog[id], { state: 'red' });
      assert.deepEqual(state.reviewList, [
        { id: 'miss-1', songId: 'dawn', sentenceId: sentence.id, kind: 'due', misses: 1 },
      ]);
      assert.equal(state.addedId, 'miss-1');
      assert.equal(state.addedExpiresAt, Date.now() + 3000);
      assert.deepEqual(calls, release === 'zero' ? [] : ['pause', 'play']);
      appStore.getState().updatePlayback(endMs + 50, 238000, true);
      appStore.getState().jumpToLine(occurrence.start);
      appStore.getState().answer(sentence.translation!);
      appStore.getState().updatePlayback(endMs, 238000, true);
      t.mock.timers.tick(5000);
      assert.equal(appStore.getState().run.answers, state.run.answers);
      assert.equal(appStore.getState().reviewList, state.reviewList);
      assert.equal(appStore.getState().fog, state.fog);
    } finally {
      detach();
    }
  });

test('an unanswered miss reschedules an existing review sentence without another undo toast', () => {
  appStore.getState().setQuizToggle(true);
  const sentence = getLyrics('dawn').sentences[0]!;
  settingsStore.setState({ answerTime: 0 });
  appStore.setState({
    reviewList: [{ id: 'existing', songId: 'dawn', sentenceId: sentence.id, kind: 'later', step: 2, dueAt: 100000 }],
  });
  appStore.getState().updatePlayback(9000, 238000, true);
  assert.deepEqual(appStore.getState().reviewList, [
    { id: 'existing', songId: 'dawn', sentenceId: sentence.id, kind: 'due', misses: 1 },
  ]);
  assert.equal(appStore.getState().addedId, null);
  assert.equal(appStore.getState().nextReviewId, 1);
});

for (const skip of ['seek', 'jump', 'waiting seek', 'song change', 'before quiz'] as const)
  test(`${skip} leaves skipped sentences unanswered`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const lyrics = getLyrics('dawn');
    settingsStore.setState({ answerTime: skip === 'waiting seek' || skip === 'song change' ? 3 : 0 });
    if (skip !== 'before quiz') appStore.getState().setQuizToggle(true);
    if (skip === 'waiting seek' || skip === 'song change') appStore.getState().updatePlayback(9000, 238000, true);
    if (skip === 'song change') appStore.getState().nextSong();
    else if (skip === 'jump') appStore.getState().jumpToLine(3);
    else if (skip === 'before quiz') {
      appStore.getState().updatePlayback(27000, 238000, true);
      appStore.getState().setQuizToggle(true);
    } else appStore.getState().seek(27000);
    appStore.getState().updatePlayback(skip === 'song change' ? 0 : 27001, 238000, true);
    t.mock.timers.tick(5000);
    for (const sentence of lyrics.sentences.slice(0, 3))
      assert.equal(appStore.getState().run.answers[sentence.id], undefined);
    assert.deepEqual(appStore.getState().reviewList, []);
    assert.deepEqual(appStore.getState().fog, {});
  });

test('jumping past the last held sentence advances without scoring it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lyrics = getLyrics('dawn'),
    occurrence = lyrics.sentenceTimeline.at(-1)!;
  appStore.getState().setQuizToggle(true);
  appStore.getState().jumpToLine(occurrence.start);
  settingsStore.setState({ answerTime: 3 });
  appStore.getState().updatePlayback(lyrics.timeline[occurrence.end]!.endMs, 238000, true);
  assert.ok(appStore.getState().answerWait);
  appStore.getState().advanceLine();
  t.mock.timers.tick(5000);
  assert.equal(appStore.getState().songId, 'glass');
  assert.equal(appStore.getState().queueIndex, 1);
  assert.equal(appStore.getState().runEnd, null);
  assert.deepEqual(appStore.getState().reviewList, []);
  assert.deepEqual(appStore.getState().fog, {});
});

test('turning quiz on after a sentence ended in listen mode does not score it', () => {
  const lyrics = getLyrics('dawn');
  libraryStore.setState({
    lyrics: {
      ...libraryStore.getState().lyrics,
      dawn: { ...lyrics, timeline: lyrics.timeline.map((line, index) => (index ? line : { ...line, endMs: 8000 })) },
    },
  });
  settingsStore.setState({ answerTime: 0 });
  appStore.getState().updatePlayback(8500, 238000, true);
  appStore.getState().setQuizToggle(true);
  appStore.getState().updatePlayback(8600, 238000, true);
  assert.deepEqual(appStore.getState().run.answers, {});
  assert.deepEqual(appStore.getState().reviewList, []);
  assert.deepEqual(appStore.getState().fog, {});
});

for (const release of ['timeout', 'play', 'finish', 'zero'] as const)
  test(`last-sentence ${release} counts the miss in runEnd and advances once`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const lyrics = getLyrics('dawn'),
      occurrence = lyrics.sentenceTimeline.at(-1)!,
      sentence = lyrics.sentences.find((sentence) => sentence.id === occurrence.sentenceId)!;
    appStore.getState().setQuizToggle(true);
    appStore.getState().jumpToLine(occurrence.start);
    settingsStore.setState({ answerTime: release === 'zero' ? 0 : release === 'timeout' ? 3 : null });
    appStore.getState().updatePlayback(lyrics.timeline[occurrence.end]!.endMs, 238000, false);
    if (release === 'timeout') t.mock.timers.tick(3000);
    else if (release === 'play') appStore.getState().setPlaying(true);
    else finishSong();
    assert.deepEqual(withoutTime(appStore.getState().runEnd), {
      songId: 'dawn',
      hits: 0,
      answered: 1,
      bestCombo: 0,
      perfect: false,
    });
    assert.equal(appStore.getState().reviewList[0]?.sentenceId, sentence.id);
    assert.equal(appStore.getState().songId, 'glass');
    assert.equal(appStore.getState().queueIndex, 1);
    t.mock.timers.tick(5000);
    assert.equal(appStore.getState().songId, 'glass');
    assert.equal(appStore.getState().queueIndex, 1);
  });

test('quiz toggles retain the run and listen answers leave fog unchanged', () => {
  appStore.getState().setQuizToggle(true);
  const sentence = getLyrics('dawn').sentences[0]!;
  appStore.getState().answer(sentence.translation!);
  const { run, fog } = appStore.getState();
  appStore.getState().setQuizToggle(false);
  appStore.getState().jumpToLine(1);
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().run, run);
  assert.equal(appStore.getState().fog, fog);
  appStore.getState().setQuizToggle(true);
  assert.equal(appStore.getState().run.id, run.id);
  assert.equal(appStore.getState().run.answers, run.answers);
  assert.equal(appStore.getState().run.combo, run.combo);
  appStore.getState().restartRun();
  assert.notEqual(appStore.getState().run.id, run.id);
});

test('clip sessions apply fog with distinct run ids and clear half on a later session', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sentence = getLyrics('dawn').sentences[0]!;
  const item = { id: 'clip', songId: 'dawn', sentenceId: sentence.id, kind: 'due' as const, misses: 1 };
  appStore.setState({ reviewList: [item] });
  appStore.getState().startClipReview();
  const id = appStore.getState().clipReview!.id;
  appStore.getState().answerClip(sentence.translation!);
  assert.deepEqual(appStore.getState().fog[sentence.lineIds[0]!], { state: 'half', run: `clip:${id}` });
  appStore.getState().stopClipReview();
  appStore.setState({ reviewList: [item] });
  appStore.getState().startClipReview();
  assert.notEqual(appStore.getState().clipReview!.id, id);
  appStore.getState().answerClip(sentence.translation!);
  assert.deepEqual(appStore.getState().fog[sentence.lineIds[0]!], { state: 'clear' });
  assert.deepEqual(appStore.getState().perfectRuns, {});
  appStore.getState().stopClipReview();
});

test('starting from a list retains its order and shuffles only visible unqueued songs', () => {
  const list = ['rain', 'dawn', 'glass'];
  appStore.getState().startSong('dawn', list);
  assert.deepEqual(appStore.getState().queue, list);
  assert.notEqual(appStore.getState().queue, list);
  assert.equal(appStore.getState().queueIndex, 1);
  assert.deepEqual(new Set(appStore.getState().autoplay), new Set(['dream', 'bluebird', 'summer']));
  assert.deepEqual(getUpNext(appStore.getState()).queue, ['glass']);
});

test('Play next inserts after the current index, Add to queue appends, and both remove autoplay entries', () => {
  appStore.setState({ autoplay: ['rain', 'dream', 'summer'] });
  appStore.getState().playNext(['rain']);
  assert.deepEqual(appStore.getState().queue, ['dawn', 'rain', 'glass']);
  assert.deepEqual(appStore.getState().autoplay, ['dream', 'summer']);
  const before = appStore.getState();
  appStore.getState().playNext(['dawn']);
  assert.equal(appStore.getState(), before);
  appStore.getState().addToQueue(['dream']);
  assert.deepEqual(appStore.getState().queue, ['dawn', 'rain', 'glass', 'dream']);
  assert.deepEqual(appStore.getState().autoplay, ['summer']);
});

test('Play next and Add to queue take lists and move songs already upcoming instead of repeating them', () => {
  appStore.setState({ queue: ['dawn', 'glass', 'rain'], queueIndex: 0, autoplay: ['dream', 'summer'] });
  appStore.getState().playNext(['rain', 'dream', 'rain', 'missing']);
  assert.deepEqual(appStore.getState().queue, ['dawn', 'rain', 'dream', 'glass']);
  assert.deepEqual(appStore.getState().autoplay, ['summer']);
  appStore.getState().addToQueue(['rain', 'dawn']);
  assert.deepEqual(appStore.getState().queue, ['dawn', 'dream', 'glass', 'rain', 'dawn']);
});

test('queue actions with nothing playing start the songs', async () => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  appStore.getState().addToQueue(['missing', 'rain', 'glass']);
  assert.equal(appStore.getState().songId, 'rain');
  assert.deepEqual(appStore.getState().queue, ['rain', 'glass']);
});

test('Up next edits remove, move and clear upcoming songs without touching history or the current song', () => {
  appStore.setState({ queue: ['dawn', 'glass', 'rain', 'dream'], queueIndex: 1, autoplay: ['bluebird', 'summer'] });
  appStore.getState().moveUpNext(0, 1, 'rain');
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass', 'dream', 'rain']);
  appStore.getState().moveUpNext(1, 0, 'rain');
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass', 'rain', 'dream']);
  const before = appStore.getState();
  for (const [from, to, id] of [
    [0, 1, 'dream'],
    [0, 2, 'rain'],
    [-1, 0, 'glass'],
    [0, 0.5, 'rain'],
  ] as const)
    appStore.getState().moveUpNext(from, to, id);
  assert.equal(appStore.getState(), before);
  appStore.getState().removeUpNext(3, 'summer');
  assert.deepEqual(appStore.getState().autoplay, ['bluebird']);
  appStore.getState().removeUpNext(0, 'rain');
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass', 'dream']);
  const unchanged = appStore.getState();
  appStore.getState().removeUpNext(0, 'rain');
  appStore.getState().removeUpNext(9, 'dream');
  appStore.getState().removeUpNext(-1, 'glass');
  assert.equal(appStore.getState(), unchanged);
  appStore.getState().clearUpNext();
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass']);
  assert.equal(appStore.getState().queueIndex, 1);
  assert.deepEqual(appStore.getState().autoplay, ['bluebird']);
});

test('playing an artist queues visible songs from its albums, newest album first', () => {
  appStore.getState().startArtist('minami');
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass', 'dream']);
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.getState().startArtist('minami', true);
  assert.deepEqual(new Set(appStore.getState().queue), new Set(['dawn', 'glass', 'dream']));
  assert.equal(appStore.getState().songId, appStore.getState().queue[0]);
  const before = appStore.getState();
  appStore.getState().startArtist('nobody');
  assert.equal(appStore.getState(), before);
});

test('a repeated song replays with a new run when it ends and turns off when another song plays', () => {
  appStore.getState().setRepeatSong('dawn', true);
  const run = appStore.getState().run;
  finishSong();
  assert.equal(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().queueIndex, 0);
  assert.notEqual(appStore.getState().run, run);
  assert.equal(appStore.getState().repeatSongId, 'dawn');
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'glass');
  assert.equal(appStore.getState().repeatSongId, null);
  appStore.getState().setRepeatSong('glass', true);
  appStore.getState().setRepeatSong('dawn', false);
  assert.equal(appStore.getState().repeatSongId, 'glass');
  appStore.getState().setRepeatSong('glass', false);
  finishSong();
  assert.notEqual(appStore.getState().songId, 'glass');
  // Skipping to another queued play of the same song still turns it off.
  appStore.setState({ queue: ['dawn', 'dawn'], queueIndex: 0, songId: 'dawn' });
  appStore.getState().setRepeatSong('dawn', true);
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().repeatSongId, null);
});

test('next enters autoplay, appends its song and previous returns through queue history', () => {
  appStore.setState({ autoplay: ['rain', 'dream'] });
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'glass');
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'rain');
  assert.equal(appStore.getState().queueIndex, 2);
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass', 'rain']);
  assert.deepEqual(appStore.getState().autoplay, ['dream']);
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'glass');
});

test('Play up next indexes upcoming entries and drops skipped autoplay entries', () => {
  appStore.setState({ queue: ['dawn', 'glass', 'rain'], autoplay: ['dream', 'bluebird', 'summer'] });
  appStore.getState().playUpNext(1);
  assert.equal(appStore.getState().songId, 'rain');
  assert.equal(appStore.getState().queueIndex, 2);
  appStore.getState().playUpNext(1);
  assert.equal(appStore.getState().songId, 'bluebird');
  assert.equal(appStore.getState().queueIndex, 3);
  assert.deepEqual(appStore.getState().queue, ['dawn', 'glass', 'rain', 'bluebird']);
  assert.deepEqual(appStore.getState().autoplay, ['summer']);
  const state = appStore.getState();
  for (const position of [-1, 99, 0.5]) appStore.getState().playUpNext(position);
  assert.equal(appStore.getState(), state);
});

test('next regenerates exhausted or hidden autoplay and stops with no playable songs', () => {
  appStore.setState({ queue: ['dawn'], autoplay: [songs[6]!.id] });
  appStore.getState().nextSong();
  assert.notEqual(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().playing, true);
  libraryStore.getState().setLibrary({ songs: [firstSong], albums, artists, lyrics: { dawn: songLyrics.dawn! } });
  appStore.setState({ queue: ['dawn'], queueIndex: 0, autoplay: [], songId: 'dawn' });
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().queueIndex, 1);
  libraryStore.getState().setLibrary({ songs: [], albums: [], artists: [], lyrics: {} });
  appStore.getState().nextSong();
  assert.equal(appStore.getState().playing, false);
});

test('empty quiz and listen songs advance without a run-end toast', () => {
  appStore.getState().setQuizToggle(true);
  finishSong();
  assert.equal(appStore.getState().runEnd, null);
  appStore.getState().setQuizToggle(false);
  finishSong();
  assert.equal(appStore.getState().runEnd, null);
});

test('fog and perfect runs persist, run feedback does not, and old keys are ignored', async () => {
  const values = new Map<string, string>();
  await hydrateAppState({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  });
  appStore.setState({ fog: { line: { state: 'half', run: 'old' } }, perfectRuns: { dawn: true } });
  const saved = JSON.parse(values.get('learning-state')!) as { state: Record<string, unknown>; version: number };
  assert.deepEqual(saved.state.fog, { line: { state: 'half', run: 'old' } });
  assert.deepEqual(saved.state.perfectRuns, { dawn: true });
  for (const key of ['ranks', 'runEnd', 'run', 'positionMs']) assert.equal(key in saved.state, false);
  saved.state.ranks = { dawn: 'S' };
  saved.state.playbackQueue = ['obsolete'];
  values.set('learning-state', JSON.stringify(saved));
  await appStore.persist.rehydrate();
  assert.equal('ranks' in appStore.getState(), false);
  assert.equal('playbackQueue' in appStore.getState(), false);
  assert.deepEqual(appStore.getState().fog, { line: { state: 'half', run: 'old' } });
});

test('the queue survives a relaunch, paused at the saved position, and a song that left the library drops it', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  await hydrateAppState(storage);
  resumePlayback();
  appStore.getState().startSong('glass', ['dawn', 'glass', 'rain']);
  appStore.getState().setRepeatSong('glass', true);
  appStore.getState().updatePlayback(42000, 238000, true);
  appStore.getState().setPlaying(false);
  const { autoplay } = appStore.getState(),
    saved = new Map(values);
  const relaunch = async () => {
    appStore.setState(appStore.getInitialState(), true);
    values.clear();
    for (const [key, value] of saved) values.set(key, value);
    await hydrateAppState(storage);
    // Boot work may touch the store before the library finishes loading.
    appStore.setState({ run: { ...appStore.getState().run } });
  };
  await relaunch();
  resumePlayback();
  const state = appStore.getState();
  assert.equal(state.songId, 'glass');
  assert.deepEqual(state.queue, ['dawn', 'glass', 'rain']);
  assert.equal(state.queueIndex, 1);
  assert.deepEqual(state.autoplay, autoplay);
  assert.equal(state.repeatSongId, 'glass');
  assert.equal(state.positionMs, 42000);
  assert.equal(state.durationMs, libraryStore.getState().bySong.glass!.duration * 1000);
  assert.equal(state.playing, false);
  // A sync that removed the saved song clears the saved queue.
  await relaunch();
  libraryStore.getState().setLibrary({
    songs: songs.filter((song) => song.id !== 'glass'),
    albums,
    artists,
    lyrics: songLyrics,
  });
  resumePlayback();
  assert.equal(appStore.getState().songId, null);
  assert.deepEqual(appStore.getState().queue, []);
  await resetAppState();
  assert.equal(values.has('playback-position'), false);
});

test('Previous keeps the last 100 played songs', () => {
  const ids = Array.from({ length: 150 }, (_, index) => songs[index % 3]!.id);
  appStore.setState({ queue: ids, queueIndex: 0 });
  appStore.getState().playUpNext(129);
  assert.equal(appStore.getState().queueIndex, 100);
  assert.deepEqual(appStore.getState().queue, ids.slice(30));
  assert.equal(appStore.getState().songId, ids[130]);
});

test('lock-screen next and previous drive songs, or review clips while reviewing', () => {
  remoteSkip('next');
  assert.equal(appStore.getState().songId, 'glass');
  remoteSkip('previous');
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.setState({ positionMs: 10000 });
  remoteSkip('previous');
  assert.equal(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().positionMs, 0);
  const clipAfter = (direction: 'next' | 'previous', index: number) => {
    appStore.setState({ clipReview: { id: 'clips', ids: ['a', 'b', 'c'], index, answers: {}, choices: {}, combo: 0 } });
    remoteSkip(direction);
    return appStore.getState().clipReview?.index;
  };
  assert.equal(clipAfter('next', 0), 1);
  assert.equal(clipAfter('previous', 2), 1);
  assert.equal(clipAfter('previous', 0), 0);
  assert.equal(clipAfter('next', 2), undefined);
  assert.equal(appStore.getState().songId, 'dawn');
});

test('playing a playlist queues its visible songs in playlist order, repeats included', () => {
  libraryStore.getState().setLibrary({
    songs,
    albums,
    artists,
    lyrics: songLyrics,
    playlists: [{ id: 'mix', name: 'Mix', songIds: ['rain', 'missing', songs[6]!.id, 'dawn', 'rain'] }],
  });
  appStore.getState().startPlaylist('mix');
  assert.deepEqual(appStore.getState().queue, ['rain', 'dawn', 'rain']);
  assert.equal(appStore.getState().songId, 'rain');
  const before = appStore.getState();
  appStore.getState().startPlaylist('nope');
  assert.equal(appStore.getState(), before);
  // Tapping the second occurrence plays from there, so Next follows it.
  appStore.getState().startSong('rain', ['rain', 'dawn', 'rain', 'glass'], 2);
  assert.equal(appStore.getState().queueIndex, 2);
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'glass');
  appStore.getState().startSong('rain', ['rain', 'dawn', 'rain', 'glass'], 1);
  assert.equal(appStore.getState().queueIndex, 0);
});

test('a malformed or mismatched saved queue hydrates as empty playback', async () => {
  const values = new Map<string, string>();
  await hydrateAppState({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  });
  const empty = { songId: null, queue: [], queueIndex: -1, autoplay: [], repeatSongId: null };
  const restore = async (state: Record<string, unknown>) => {
    values.set('learning-state', JSON.stringify({ state, version: 0 }));
    await appStore.persist.rehydrate();
    const { songId, queue, queueIndex, autoplay, repeatSongId } = appStore.getState();
    return { songId, queue, queueIndex, autoplay, repeatSongId };
  };
  const valid = { songId: 'glass', queue: ['dawn', 'glass'], queueIndex: 1, autoplay: ['rain'], repeatSongId: 'glass' };
  assert.deepEqual(await restore(valid), valid);
  assert.deepEqual(await restore({ ...valid, queue: null }), empty);
  assert.deepEqual(await restore({ ...valid, autoplay: [1] }), empty);
  assert.deepEqual(await restore({ ...valid, queueIndex: 0 }), empty);
  assert.deepEqual(await restore({ ...valid, queueIndex: '1' }), empty);
  assert.deepEqual(await restore({ ...valid, repeatSongId: 'dawn' }), { ...valid, repeatSongId: null });
});

test('a sync that removes the playing song stops it and empties the queue', () => {
  const paused: boolean[] = [];
  setTransport({ load() {}, play() {}, seek() {}, pause: () => paused.push(true) });
  appStore.getState().startSong('glass', ['dawn', 'glass', 'rain']);
  dropRemovedSong();
  assert.equal(appStore.getState().songId, 'glass');
  libraryStore.getState().setLibrary({
    songs: songs.filter((song) => song.id !== 'glass'),
    albums,
    artists,
    lyrics: songLyrics,
  });
  const before = paused.length;
  dropRemovedSong();
  const state = appStore.getState();
  assert.equal(state.songId, null);
  assert.deepEqual(state.queue, []);
  assert.equal(state.playing, false);
  assert.equal(paused.length, before + 1);
});
