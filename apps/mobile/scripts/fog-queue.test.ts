import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyAnswer, lyricsFog } from '../src/lyrics/fog';
import { appStore, finishSong, getUpNext, hydrateAppState, resetAppState, setTransport } from '../src/store/appStore';
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
      appStore.setState({
        answerTime: release === 'zero' ? 0 : release === 'timeout' ? 3 : null,
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
  appStore.setState({
    answerTime: 0,
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
    appStore.setState({ answerTime: skip === 'waiting seek' || skip === 'song change' ? 3 : 0 });
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
  appStore.setState({ answerTime: 3 });
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
  appStore.setState({ answerTime: 0 });
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
    appStore.setState({ answerTime: release === 'zero' ? 0 : release === 'timeout' ? 3 : null });
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
  appStore.getState().playNext('rain');
  assert.deepEqual(appStore.getState().queue, ['dawn', 'rain', 'glass']);
  assert.deepEqual(appStore.getState().autoplay, ['dream', 'summer']);
  const before = appStore.getState();
  appStore.getState().playNext('dawn');
  assert.equal(appStore.getState(), before);
  appStore.getState().addToQueue('dream');
  assert.deepEqual(appStore.getState().queue, ['dawn', 'rain', 'glass', 'dream']);
  assert.deepEqual(appStore.getState().autoplay, ['summer']);
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

test('fog and perfect runs persist, queue and run feedback do not, and old keys are ignored', async () => {
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
  for (const key of ['ranks', 'queue', 'queueIndex', 'autoplay', 'runEnd', 'run'])
    assert.equal(key in saved.state, false);
  saved.state.ranks = { dawn: 'S' };
  saved.state.playbackQueue = ['obsolete'];
  values.set('learning-state', JSON.stringify(saved));
  await appStore.persist.rehydrate();
  assert.equal('ranks' in appStore.getState(), false);
  assert.equal('playbackQueue' in appStore.getState(), false);
  assert.deepEqual(appStore.getState().fog, { line: { state: 'half', run: 'old' } });
});
