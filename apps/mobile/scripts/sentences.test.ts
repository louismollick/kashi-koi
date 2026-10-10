import { decoyText } from '@kashi-koi/shared/analysis';
import { testDecoys } from './fixtures';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { remapReview } from '../src/lyrics/review';
import { timelineTexts, withSentences } from '../src/lyrics/sentences';
import { appStore, getRunSummary, resetAppState, setTransport } from '../src/store/appStore';
import {
  carryLyrics,
  currentSentence,
  getAnswers,
  getLyrics,
  hasTranslations,
  libraryStore,
  readyReviewLines,
  reviewClip,
  sentenceForReview,
} from '../src/store/libraryStore';
import type { ReviewList } from '../src/types/domain';
import { firstSong } from './fixtures';

// Original text: one thought split across two lines, then repeated as a chorus.
const texts = ['白い封筒を', '机の奥にしまった', '駅の時計は止まっていた', 'Interlude', '明日の窓を開けよう'];
const rawLyrics = {
  songId: 'letter',
  lines: texts.map((text, index) => ({
    id: `letter:${text}`,
    segments: [{ text }],
    translation: [
      'A white envelope',
      'I put it at the back of the desk',
      'The station clock had stopped',
      'Interlude',
      "Let us open tomorrow's window",
    ][index],
  })),
  timeline: [0, 1, 2, 3, 0, 1, 4].map((index, occurrence) => ({
    lineId: `letter:${texts[index]}`,
    startMs: 1000 + occurrence * 2000,
    endMs: 3000 + occurrence * 2000,
  })),
};
const song = { ...firstSong, id: rawLyrics.songId, duration: 15 };
const analysis: SongAnalysis = {
  schemaVersion: 2,
  fingerprint: fingerprint(timelineTexts(rawLyrics)),
  model: 'test',
  createdAt: '2026-10-01T00:00:00Z',
  title: 'The letter left unopened',
  summary: 'The speaker puts a letter away and later chooses to face tomorrow.',
  speaker: 'The person who received the letter',
  addressee: 'The sender',
  lines: [
    'The white envelope',
    'I tucked away inside the desk',
    'The station clock stood still',
    'Interlude',
    'That white envelope',
    'I tucked away inside the desk again',
    'Let us open the window to tomorrow',
  ],
  sentences: [
    {
      start: 0,
      end: 1,
      translation: 'I tucked the white envelope away inside the desk',
      decoys: testDecoys('I tucked the white envelope away inside the desk'),
    },
    {
      start: 2,
      end: 2,
      translation: 'The station clock stood still',
      decoys: testDecoys('The station clock stood still'),
    },
    { start: 3, end: 3, translation: 'Interlude', decoys: testDecoys('Interlude') },
    {
      start: 4,
      end: 5,
      translation: 'I tucked the white envelope away inside the desk',
      decoys: testDecoys('I tucked the white envelope away inside the desk'),
    },
    {
      start: 6,
      end: 6,
      translation: 'Let us open the window to tomorrow',
      decoys: testDecoys('Let us open the window to tomorrow'),
    },
  ],
};
const fallback = () => withSentences(rawLyrics);
const analysed = () => withSentences(rawLyrics, analysis);
const chorusId = `letter:${texts[0]}\n${texts[1]}`;
const chorusTranslation = analysis.sentences[0]!.translation;
const mark = (sentenceId = chorusId): ReviewList[number] => ({
  id: 'letter-mark',
  songId: song.id,
  sentenceId,
  kind: 'new',
});

beforeEach(async () => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs: [song], albums: [], artists: [], lyrics: { letter: fallback() } });
  appStore.setState(appStore.getInitialState(), true);
});
afterEach(async () => {
  await resetAppState();
});

function installAnalysis() {
  libraryStore.getState().setAnalysis(analysis);
  appStore.getState().startSong(song.id);
}

function recordTransport() {
  const calls: string[] = [];
  const detach = setTransport({
    load: (song, start) => {
      calls.push(`load:${song.id}:${start ?? 0}`);
    },
    seek: (ms) => {
      calls.push(`seek:${ms}`);
    },
    play: () => {
      calls.push('play');
    },
    pause: () => {
      calls.push('pause');
    },
  });
  return { calls, detach };
}

test('fallback preserves line identities, translations and repeats while skipping English', () => {
  const lyrics = fallback();
  assert.equal(lyrics.fingerprint, analysis.fingerprint);
  assert.equal(lyrics.analysis, undefined);
  assert.deepEqual(
    lyrics.sentences,
    [0, 1, 2, 4].map((index) => ({
      id: rawLyrics.lines[index]!.id,
      lineIds: [rawLyrics.lines[index]!.id],
      translation: rawLyrics.lines[index]!.translation,
    })),
  );
  assert.deepEqual(
    lyrics.sentenceTimeline.map((occurrence) => [occurrence.sentenceId, occurrence.start, occurrence.end]),
    [0, 1, 2, 4, 5, 6].map((index) => [rawLyrics.timeline[index]!.lineId, index, index]),
  );
  assert.deepEqual(timelineTexts(lyrics), [texts[0], texts[1], texts[2], texts[3], texts[0], texts[1], texts[4]]);
  assert.equal(currentSentence(song.id, 3), undefined);
});

test('analysis deduplicates complete repeated sentences and keeps contextual occurrence translations', () => {
  const lyrics = analysed();
  assert.equal(lyrics.sentences.length, 3);
  assert.deepEqual(lyrics.sentences[0], {
    id: chorusId,
    lineIds: [rawLyrics.lines[0]!.id, rawLyrics.lines[1]!.id],
    translation: chorusTranslation,
    decoys: analysis.sentences[0]!.decoys,
  });
  assert.deepEqual(lyrics.sentenceTimeline, [
    { sentenceId: chorusId, start: 0, end: 1 },
    { sentenceId: rawLyrics.lines[2]!.id, start: 2, end: 2 },
    { sentenceId: chorusId, start: 4, end: 5 },
    { sentenceId: rawLyrics.lines[4]!.id, start: 6, end: 6 },
  ]);
  assert.deepEqual(
    lyrics.timeline.map((occurrence) => occurrence.translation),
    analysis.lines,
  );
  assert.equal(lyrics.lines[0]!.translation, rawLyrics.lines[0]!.translation);
  assert.deepEqual(lyrics.analysis, {
    title: analysis.title,
    summary: analysis.summary,
    speaker: analysis.speaker,
    addressee: analysis.addressee,
  });
  libraryStore.getState().setAnalysis(analysis);
  const current = currentSentence(song.id, 5)!;
  assert.equal(current.sentence.id, chorusId);
  assert.deepEqual(
    current.lines.map((line) => line.translation),
    analysis.lines.slice(4, 6),
  );
  assert.deepEqual(current.previous, lyrics.sentenceTimeline[1]);
  assert.deepEqual(
    currentSentence(song.id, 1)!.lines.map((line) => line.translation),
    analysis.lines.slice(0, 2),
  );
});

test('mismatched and invalid analyses fall back and clear stale contextual translations', () => {
  for (const invalid of [
    { ...analysis, fingerprint: fingerprint(['別の歌']) },
    { ...analysis, lines: analysis.lines.slice(1) },
    { ...analysis, sentences: [{ start: 0, end: 2, translation: 'incomplete', decoys: testDecoys('incomplete') }] },
  ]) {
    const lyrics = withSentences(analysed(), invalid);
    assert.deepEqual(lyrics, fallback());
    assert.ok(lyrics.timeline.every((occurrence) => !('translation' in occurrence)));
  }
});

test('cached v1 analyses are ignored even when their fingerprint and ranges still match', () => {
  const old = { ...analysis, schemaVersion: 1 } as unknown as SongAnalysis;
  assert.deepEqual(withSentences(rawLyrics, old), fallback());
});

test('old cached lyrics acquire a fingerprint and fallback sentences while preserving timing and furigana', () => {
  const legacy = {
    ...rawLyrics,
    lines: rawLyrics.lines.map((line, index) =>
      index === 0 ? { ...line, segments: [{ text: '白', reading: 'しろ' }, { text: 'い封筒を' }] } : line,
    ),
  };
  const migrated = withSentences(legacy);
  assert.equal(migrated.fingerprint, analysis.fingerprint);
  assert.deepEqual(migrated.timeline, rawLyrics.timeline);
  assert.equal(migrated.lines[0], legacy.lines[0]);
  assert.equal(migrated.sentences[0]!.id, rawLyrics.lines[0]!.id);
  assert.deepEqual(withSentences(migrated), migrated);
  assert.equal(withSentences({ ...legacy, fingerprint: 'outdated' }).fingerprint, analysis.fingerprint);
});

test('cached analyses apply after old lyrics migration and survive carrying the library', () => {
  libraryStore.getState().setLibrary({
    songs: [song],
    albums: [],
    artists: [],
    lyrics: { letter: withSentences(rawLyrics) },
    analyses: { [analysis.fingerprint]: analysis },
  });
  assert.equal(getLyrics(song.id).sentences[0]!.id, chorusId);
  assert.equal(hasTranslations(song.id), true);
  const previous = libraryStore.getState();
  const carried = carryLyrics({ songs: [song], albums: [], artists: [] }, previous);
  libraryStore.getState().setLibrary(carried);
  assert.deepEqual(getLyrics(song.id), analysed());
  assert.equal(carried.analyses, previous.analyses);
});

test('choices and answers use sentence translations, score repeats once and schedule review once', () => {
  installAnalysis();
  appStore.getState().setQuizToggle(true);
  appStore.setState({ reviewList: [mark()] });
  appStore.getState().jumpToLine(0);
  const choices = getAnswers(song, 1, () => 0.99);
  assert.deepEqual(
    new Set(choices.map((choice) => choice.text)),
    new Set([chorusTranslation, ...testDecoys(chorusTranslation).map((decoy) => decoyText(chorusTranslation, decoy))]),
  );
  assert.ok(!choices.map((choice) => choice.text).includes(rawLyrics.lines[0]!.translation!));
  const firstChoices = appStore.getState().run.choices[chorusId];
  appStore.getState().answer(chorusTranslation);
  const scheduled = appStore.getState().reviewList[0];
  appStore.getState().jumpToLine(1);
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().run.combo, 1);
  appStore.getState().jumpToLine(2);
  appStore.getState().answer(analysis.sentences[1]!.translation);
  assert.equal(appStore.getState().run.combo, 2);
  appStore.getState().jumpToLine(4);
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().run.choices[chorusId], firstChoices);
  assert.equal(appStore.getState().run.combo, 2);
  assert.equal(appStore.getState().reviewList[0], scheduled);
  assert.equal(scheduled?.kind, 'later');
  appStore.getState().jumpToLine(6);
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().run.combo, 0);
  assert.equal(appStore.getState().run.bestCombo, 2);
  assert.equal(Object.keys(appStore.getState().run.answers).length, 3);
  const summary = getRunSummary(song, appStore.getState().run);
  assert.equal(summary.total, 3);
  assert.equal(summary.hits, 2);
  assert.deepEqual(
    summary.missed.map((sentence) => sentence.id),
    [rawLyrics.lines[4]!.id],
  );
});

test('lost marks and result selections on any line of a repeated sentence share one review entry', () => {
  installAnalysis();
  appStore.getState().jumpToLine(1);
  appStore.getState().addLostMark();
  const first = appStore.getState().reviewList[0]!;
  assert.equal(first.sentenceId, chorusId);
  appStore.getState().jumpToLine(5);
  appStore.getState().addLostMark();
  appStore.getState().sendToReview(chorusId, true);
  assert.deepEqual(appStore.getState().reviewList, [first]);
  appStore.getState().sendToReview(rawLyrics.lines[4]!.id, true);
  assert.equal(appStore.getState().reviewList.length, 2);
  appStore.getState().sendToReview(rawLyrics.lines[4]!.id, false);
  assert.deepEqual(appStore.getState().reviewList, [first]);
});

test('quiz waits at the exact last line end of a multi-line sentence and replays its first line', () => {
  const { calls, detach } = recordTransport();
  try {
    installAnalysis();
    appStore.getState().setQuizToggle(true);
    appStore.getState().jumpToLine(0);
    calls.length = 0;
    appStore.getState().updatePlayback(3000, 15000, true);
    assert.equal(appStore.getState().lineIndex, 1);
    assert.equal(appStore.getState().answerWait, null);
    appStore.getState().updatePlayback(4999, 15000, true);
    assert.equal(appStore.getState().answerWait, null);
    assert.deepEqual(calls, []);
    appStore.getState().updatePlayback(5000, 15000, true);
    assert.deepEqual(appStore.getState().answerWait, {
      occurrence: { sentenceId: chorusId, start: 0, end: 1 },
      until: null,
    });
    assert.equal(appStore.getState().lineIndex, 1);
    assert.deepEqual(calls, ['pause']);
    appStore.getState().replayLine();
    assert.equal(appStore.getState().positionMs, 1000);
    assert.equal(appStore.getState().answerWait, null);
    assert.deepEqual(calls.slice(-2), ['seek:1000', 'play']);
  } finally {
    detach();
  }
});

test('answered repeated sentences keep playing past their end', () => {
  const { calls, detach } = recordTransport();
  try {
    installAnalysis();
    appStore.getState().setQuizToggle(true);
    appStore.getState().jumpToLine(0);
    appStore.getState().answer(chorusTranslation);
    appStore.getState().jumpToLine(4);
    calls.length = 0;
    appStore.getState().updatePlayback(11000, 15000, true);
    appStore.getState().updatePlayback(13000, 15000, true);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls, []);
  } finally {
    detach();
  }
});

test('clip review plays the whole first sentence occurrence and answers its sentence translation', () => {
  const { calls, detach } = recordTransport();
  try {
    installAnalysis();
    appStore.setState({ reviewList: [mark()] });
    assert.deepEqual(reviewClip(mark()), { startMs: 1000, endMs: 5000 });
    assert.deepEqual(
      sentenceForReview(mark())!.lines.map((line) => line.translation),
      analysis.lines.slice(0, 2),
    );
    assert.deepEqual(
      readyReviewLines(appStore.getState().reviewList).map((item) => item.id),
      ['letter-mark'],
    );
    calls.length = 0;
    appStore.getState().startClipReview();
    assert.ok(calls.includes('load:letter:1000') || calls.includes('seek:1000'));
    assert.equal(appStore.getState().clipPlayback?.endMs, 5000);
    appStore.getState().updatePlayback(3000, 15000, true);
    assert.equal(appStore.getState().playing, true);
    appStore.getState().updatePlayback(5000, 15000, true);
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().clipPlayback?.ended, true);
    appStore.getState().answerClip(chorusTranslation);
    assert.equal(appStore.getState().clipReview?.answers['letter-mark']?.correct, true);
    assert.equal(appStore.getState().reviewList[0]?.kind, 'later');
  } finally {
    detach();
  }
});

test('review remapping merges line marks into the most due sentence and preserves unrelated songs', () => {
  const first = rawLyrics.lines[0]!.id,
    second = rawLyrics.lines[1]!.id;
  const other: ReviewList[number] = { id: 'other', songId: 'other', sentenceId: 'other:line', kind: 'new' };
  const future: ReviewList[number] = {
    id: 'future',
    songId: song.id,
    sentenceId: first,
    kind: 'later',
    step: 4,
    dueAt: 10000,
  };
  const earlier: ReviewList[number] = {
    id: 'earlier',
    songId: song.id,
    sentenceId: second,
    kind: 'later',
    step: 1,
    dueAt: 5000,
  };
  const newMark: ReviewList[number] = { id: 'new', songId: song.id, sentenceId: first, kind: 'new' };
  const due: ReviewList[number] = { id: 'due', songId: song.id, sentenceId: second, kind: 'due', misses: 3 };
  for (const list of [
    [future, earlier],
    [earlier, future],
  ]) {
    assert.deepEqual(remapReview(list, song.id, fallback(), analysed()), [{ ...earlier, sentenceId: chorusId }]);
  }
  for (const list of [
    [future, newMark, due, other],
    [due, newMark, future, other],
  ]) {
    assert.deepEqual(remapReview(list, song.id, fallback(), analysed()), [{ ...due, sentenceId: chorusId }, other]);
  }
  assert.deepEqual(remapReview([future, newMark], song.id, fallback(), analysed()), [
    { ...newMark, sentenceId: chorusId },
  ]);
});

test('reanalysis merges changed boundaries and drops marks when no Japanese sentence survives', () => {
  const combined = withSentences(rawLyrics, {
    ...analysis,
    sentences: [
      {
        start: 0,
        end: 2,
        translation: 'I put away the envelope while the station clock stood still',
        decoys: testDecoys('I put away the envelope while the station clock stood still'),
      },
      ...analysis.sentences.slice(2),
    ],
  });
  const mostDue: ReviewList[number] = {
    id: 'due',
    songId: song.id,
    sentenceId: rawLyrics.lines[2]!.id,
    kind: 'due',
    misses: 2,
  };
  const oldMark: ReviewList[number] = { ...mark(), kind: 'later', step: 2, dueAt: 1000 };
  const combinedId = `letter:${texts.slice(0, 3).join('\n')}`;
  // The opening chorus sentence still exists at its repeat, so its mark stays put.
  assert.deepEqual(remapReview([oldMark, mostDue], song.id, analysed(), combined), [
    oldMark,
    { ...mostDue, sentenceId: combinedId },
  ]);
  const withoutJapanese = withSentences({
    songId: song.id,
    lines: [rawLyrics.lines[3]!],
    timeline: [rawLyrics.timeline[3]!],
  });
  assert.deepEqual(remapReview([mark()], song.id, analysed(), withoutJapanese), []);
  assert.deepEqual(remapReview([mark()], song.id, analysed(), undefined), []);
});

test('store analysis arrival and reanalysis remap schedules before a rescan retains surviving lines', () => {
  const first = rawLyrics.lines[0]!.id,
    second = rawLyrics.lines[1]!.id;
  const due: ReviewList[number] = { id: 'due', songId: song.id, sentenceId: second, kind: 'due', misses: 4 };
  appStore.setState({
    reviewList: [{ id: 'future', songId: song.id, sentenceId: first, kind: 'later', step: 3, dueAt: 10000 }, due],
  });
  libraryStore.getState().setAnalysis(analysis);
  assert.deepEqual(appStore.getState().reviewList, [{ ...due, sentenceId: chorusId }]);
  libraryStore.getState().setAnalysis({
    ...analysis,
    sentences: [
      {
        start: 0,
        end: 2,
        translation: 'The letter stayed in the desk while the clock stayed still',
        decoys: testDecoys('The letter stayed in the desk while the clock stayed still'),
      },
      ...analysis.sentences.slice(2),
    ],
  });
  // The chorus sentence survives at its repeat, so the entry keeps its identity.
  assert.equal(appStore.getState().reviewList[0]!.sentenceId, chorusId);
  libraryStore.getState().setLyricsResult(
    song.id,
    'synced',
    withSentences({
      songId: song.id,
      lines: [rawLyrics.lines[1]!],
      timeline: [{ ...rawLyrics.timeline[1]!, startMs: 7000, endMs: 10000 }],
    }),
  );
  assert.deepEqual(appStore.getState().reviewList, [due]);
  assert.deepEqual(reviewClip(due), { startMs: 7000, endMs: 10000 });
  libraryStore.getState().setLyricsResult(song.id, 'none');
  assert.deepEqual(appStore.getState().reviewList, []);
});

test('analysis arriving during a quiz wait cancels its timer and discards obsolete line answers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, detach } = recordTransport();
  try {
    appStore.getState().startSong(song.id);
    appStore.getState().setQuizToggle(true);
    appStore.setState({ answerTime: 3 });
    appStore.getState().jumpToLine(0);
    appStore.getState().answer(rawLyrics.lines[0]!.translation!);
    appStore.getState().jumpToLine(1);
    appStore.getState().updatePlayback(5000, 15000, true);
    assert.ok(appStore.getState().answerWait);
    libraryStore.getState().setAnalysis(analysis);
    assert.equal(appStore.getState().answerWait, null);
    assert.deepEqual(appStore.getState().run.answers, {});
    const after = [...calls];
    t.mock.timers.tick(3000);
    assert.deepEqual(calls, after);
  } finally {
    detach();
  }
});
