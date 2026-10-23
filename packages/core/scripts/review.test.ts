import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  addLostMark,
  dueSentences,
  isDue,
  moveReview,
  pruneReview,
  readyReviewSentences,
  recordAnswer,
  remapChangedSongs,
  scheduleReview,
} from '../src/lyrics/review';
import { resetAppState } from '../src/store/appStore';
import { libraryStore } from '../src/store/libraryStore';
import type { ReviewList } from '../src/types/domain';
import { albums, artists, fixtureLine, songLyrics, songs } from './fixtures';

beforeEach(() => {
  void resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
});

const day = 86400000;
const entry = (id: string, line: string, rest: object = { kind: 'new' }) =>
  ({ id, songId: line.split('-')[0]!, sentenceId: fixtureLine(line), ...rest }) as ReviewList[number];

test('right answers double the gap from one day and a wrong answer makes the sentence due again', () => {
  const now = 1000000;
  let item = entry('a', 'dawn-3');
  for (let step = 0; step < 4; step++) {
    item = scheduleReview(item, true, now);
    assert.deepEqual(item, { ...entry('a', 'dawn-3'), kind: 'later', step, dueAt: now + 2 ** step * day });
    assert.equal(isDue(item, now + 2 ** step * day - 1), false);
    assert.equal(isDue(item, now + 2 ** step * day), true);
  }
  item = scheduleReview(item, false, now);
  assert.deepEqual(item, { ...entry('a', 'dawn-3'), kind: 'due', misses: 1 });
  assert.deepEqual(scheduleReview(item, false, now), { ...entry('a', 'dawn-3'), kind: 'due', misses: 2 });
  assert.deepEqual(scheduleReview(item, true, now), {
    ...entry('a', 'dawn-3'),
    kind: 'later',
    step: 0,
    dueAt: now + day,
  });
});

test('expired later lines join due today and ready review, with new lines separate', () => {
  const now = 1000;
  const list = [
    entry('new', 'dawn-0'),
    entry('due', 'dawn-1', { kind: 'due', misses: 1 }),
    entry('expired', 'dawn-2', { kind: 'later', step: 2, dueAt: now }),
    entry('future', 'dawn-3', { kind: 'later', step: 0, dueAt: now + 1 }),
  ];
  assert.deepEqual(
    list.map((line) => isDue(line, now)),
    [true, true, true, false],
  );
  assert.deepEqual(
    dueSentences(list, now).map((line) => line.id),
    ['due', 'expired'],
  );
  assert.deepEqual(
    readyReviewSentences(list, now).map((line) => line.id),
    ['new', 'due', 'expired'],
  );
});

test('a lost mark adds a New sentence once per sentence', () => {
  const list = addLostMark([], 'lost-1', 'dawn', fixtureLine('dawn-0'));
  assert.deepEqual(list, [entry('lost-1', 'dawn-0')]);
  assert.equal(addLostMark(list, 'lost-2', 'dawn', fixtureLine('dawn-0')), list);
});

test('a miss adds a due sentence once, and answers reschedule only that sentence', () => {
  const other = entry('other', 'dawn-1');
  const missed = recordAnswer([other], 'dawn', fixtureLine('dawn-0'), false, 'miss-1');
  assert.deepEqual(missed, [other, entry('miss-1', 'dawn-0', { kind: 'due', misses: 1 })]);
  const again = recordAnswer(missed, 'dawn', fixtureLine('dawn-0'), false, 'miss-2');
  assert.deepEqual(again[1], entry('miss-1', 'dawn-0', { kind: 'due', misses: 2 }));
  assert.equal(again.length, 2);
  assert.equal(again[0], other);
  assert.equal(recordAnswer([other], 'dawn', fixtureLine('dawn-0'), true, 'miss-3').length, 1);
});

test('moving a sentence makes it a New sentence and rejects missing, unchanged and taken targets', () => {
  const list = [entry('a', 'dawn-0', { kind: 'due', misses: 2 }), entry('b', 'dawn-1')];
  assert.deepEqual(moveReview(list, 'a', fixtureLine('dawn-4')), [entry('a', 'dawn-4'), list[1]]);
  assert.equal(moveReview(list, 'a', fixtureLine('dawn-0')), list);
  assert.equal(moveReview(list, 'a', fixtureLine('dawn-1')), list);
  assert.equal(moveReview(list, 'a', 'dawn:no such sentence'), list);
  assert.equal(moveReview(list, 'missing', fixtureLine('dawn-4')), list);
});

test('pruning drops songs that left the library and keeps the list when none did', () => {
  const list = [entry('a', 'dawn-0'), entry('b', 'glass-0')];
  assert.equal(pruneReview(list, new Set(['dawn', 'glass'])), list);
  assert.deepEqual(pruneReview(list, new Set(['glass'])), [list[1]]);
});

test('remapping visits only songs whose lyrics changed', () => {
  const list = [entry('a', 'dawn-0'), entry('b', 'glass-0')];
  assert.equal(remapChangedSongs(list, songLyrics, songLyrics), list);
  const { dawn: _dawn, ...withoutDawn } = songLyrics;
  assert.deepEqual(remapChangedSongs(list, songLyrics, withoutDawn), [list[1]]);
});
