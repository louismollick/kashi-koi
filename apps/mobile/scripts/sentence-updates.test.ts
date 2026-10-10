import { testDecoys } from './fixtures';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import { remapReview } from '../src/lyrics/review';
import { toSongLyrics } from '../src/navidrome/lyrics';
import { appStore, resetAppState, setTransport } from '../src/store/appStore';
import { getAnswers, getLyrics, libraryStore } from '../src/store/libraryStore';
import { songs } from './fixtures';

const song = { ...songs[0]!, id: 'paper' };
const raw = () =>
  toSongLyrics(
    song.id,
    {
      synced: true,
      line: [
        { start: 0, value: '紙の舟を' },
        { start: 1000, value: '川に浮かべた' },
        { start: 2000, value: '朝を待った' },
      ],
    },
    3000,
  );
const analysis = (): SongAnalysis => ({
  schemaVersion: 2,
  fingerprint: raw().fingerprint,
  model: 'test',
  createdAt: '2026-10-08T00:00:00Z',
  title: 'A paper boat',
  summary: 'A walker sends a paper boat downstream.',
  speaker: 'A walker',
  addressee: 'Unclear',
  lines: ['A paper boat', 'I set it on the river', 'I waited for dawn'],
  sentences: [
    {
      start: 0,
      end: 1,
      translation: 'I set a paper boat on the river',
      decoys: testDecoys('I set a paper boat on the river'),
    },
    { start: 2, end: 2, translation: 'I waited for dawn', decoys: testDecoys('I waited for dawn') },
  ],
});
beforeEach(async () => {
  await resetAppState();
  const lyrics = raw();
  libraryStore.getState().setLibrary({
    songs: [song],
    albums: [],
    artists: [],
    lyrics: { [song.id]: lyrics },
    translations: Object.fromEntries(
      lyrics.lines.map((line, index) => [
        line.segments[0]!.text,
        { translation: `Fallback ${index}`, segments: line.segments },
      ]),
    ),
  });
  appStore.setState({ songId: song.id, lineIndex: 0, durationMs: 3000, playing: true });
  appStore.getState().setQuizToggle(true);
});
afterEach(async () => {
  await resetAppState();
});

test('identical rescans preserve answers and a current answer wait', () => {
  appStore.getState().answer('Fallback 0');
  appStore.getState().jumpToLine(1);
  appStore.getState().updatePlayback(2000, 3000, true);
  const before = appStore.getState();
  libraryStore.getState().setLyricsResult(song.id, 'synced', raw());
  assert.equal(appStore.getState().run, before.run);
  assert.equal(appStore.getState().answerWait, before.answerWait);
});

test('analysis arriving during an answer wait resumes playback with new sentence scoring', () => {
  let plays = 0;
  const dispose = setTransport({
    load() {},
    play() {
      plays++;
    },
    pause() {},
    seek() {},
  });
  try {
    appStore.getState().updatePlayback(1000, 3000, true);
    assert.ok(appStore.getState().answerWait);
    libraryStore.getState().setAnalysis(analysis());
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.equal(plays, 1);
    appStore.getState().updatePlayback(2000, 3000, true);
    assert.equal(appStore.getState().answerWait?.occurrence.end, 1);
  } finally {
    dispose();
  }
});

test('Apple translation updates preserve analyzed sentence answers', () => {
  libraryStore.getState().setAnalysis(analysis());
  appStore.getState().answer('I set a paper boat on the river');
  const run = appStore.getState().run;
  libraryStore.getState().applyTranslationsToSong(song.id, {
    紙の舟を: { translation: 'A changed fallback', segments: [{ text: '紙', reading: 'かみ' }, { text: 'の舟を' }] },
  });
  assert.equal(appStore.getState().run, run);
  assert.equal(getLyrics(song.id).sentences[0]!.translation, 'I set a paper boat on the river');
});

test('boot without an analysis reconstructs old multi-line review membership from its sentence ID', () => {
  const sentenceId = `${song.id}:紙の舟を\n川に浮かべた`;
  const list = remapReview(
    [{ id: 'old', songId: song.id, sentenceId, kind: 'due', misses: 2 }],
    song.id,
    undefined,
    raw(),
  );
  assert.deepEqual(list, [{ id: 'old', songId: song.id, sentenceId: `${song.id}:紙の舟を`, kind: 'due', misses: 2 }]);
});

test('replacing a library with a newer cached analysis re-derives its sentences and metadata', () => {
  libraryStore.getState().setAnalysis(analysis());
  const state = libraryStore.getState(),
    updated = {
      ...analysis(),
      title: 'A new reading',
      sentences: [
        {
          start: 0,
          end: 2,
          translation: 'I floated a paper boat and waited for dawn',
          decoys: testDecoys('I floated a paper boat and waited for dawn'),
        },
      ],
    };
  libraryStore.getState().setLibrary({ ...state, analyses: { [updated.fingerprint]: updated } });
  assert.equal(getLyrics(song.id).analysis?.title, 'A new reading');
  assert.equal(getLyrics(song.id).sentences.length, 1);
});

function startReview() {
  appStore.setState({
    reviewList: getLyrics(song.id).sentences.map((sentence, index) => ({
      id: `review-${index}`,
      songId: song.id,
      sentenceId: sentence.id,
      kind: 'due' as const,
      misses: 1,
    })),
  });
  appStore.getState().startClipReview();
}

test('sentence merge removes vanished clip entries and cancels their pending feedback', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  startReview();
  appStore.getState().jumpToClip(1);
  appStore.getState().answerClip('Fallback 1');
  const oldSentence = raw().sentences[1]!.id;
  assert.ok(appStore.getState().clipReview?.answers['review-1']);
  libraryStore.getState().setAnalysis(analysis());
  const clip = appStore.getState().clipReview!;
  assert.deepEqual(clip.ids, ['review-0', 'review-2']);
  assert.equal(clip.ids[clip.index], 'review-2');
  assert.deepEqual(clip.answers, {});
  assert.equal(clip.choices[oldSentence], undefined);
  t.mock.timers.tick(800);
  assert.equal(appStore.getState().clipReview?.ids[appStore.getState().clipReview!.index], 'review-2');
  appStore.getState().setPlaying(true);
  assert.equal(appStore.getState().clipPlayback?.startMs, 2000);
  assert.equal(appStore.getState().clipPlayback?.endMs, 3000);
});

test('sentence merge keeps clip review on its surviving current entry', () => {
  startReview();
  appStore.getState().jumpToClip(2);
  libraryStore.getState().setAnalysis(analysis());
  const clip = appStore.getState().clipReview!;
  assert.deepEqual(clip.ids, ['review-0', 'review-2']);
  assert.equal(clip.index, 1);
  assert.equal(clip.ids[clip.index], 'review-2');
});

test('removing all lyric sentences ends clip review and cancels feedback', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  startReview();
  appStore.getState().answerClip('Fallback 0');
  libraryStore.getState().setLyricsResult(song.id, 'none');
  assert.deepEqual(appStore.getState().reviewList, []);
  assert.equal(appStore.getState().clipReview, null);
  assert.equal(appStore.getState().playing, false);
  t.mock.timers.tick(800);
  assert.equal(appStore.getState().clipReview, null);
});

test('empty analyzed decoys fall back to unmarked same-song translations', () => {
  const empty = { ...analysis(), sentences: analysis().sentences.map((sentence) => ({ ...sentence, decoys: [] })) };
  libraryStore.getState().setAnalysis(empty);
  const choices = getAnswers(song, 0, () => 0);
  assert.deepEqual(
    new Set(choices.map((choice) => choice.text)),
    new Set(empty.sentences.map((sentence) => sentence.translation)),
  );
  assert.equal(choices.filter((choice) => choice.correct).length, 1);
  assert.ok(choices.every((choice) => choice.parts.length === 1 && !choice.parts[0]!.marked));
});

test('analysis replacement with the same sentence IDs refreshes clip choices and clears affected answers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const changeTranslation of [true, false]) {
    const original = analysis();
    libraryStore.getState().setAnalysis(original);
    startReview();
    appStore.getState().jumpToClip(1);
    appStore.getState().answerClip(original.sentences[1]!.translation);
    appStore.getState().jumpToClip(0);
    appStore.getState().answerClip(original.sentences[0]!.translation);
    const before = appStore.getState().clipReview!;
    const translation = changeTranslation ? 'I floated a paper boat downstream' : original.sentences[0]!.translation;
    libraryStore.getState().setAnalysis({
      ...original,
      sentences: [
        { ...original.sentences[0]!, translation, decoys: changeTranslation ? testDecoys(translation) : [] },
        original.sentences[1]!,
      ],
    });
    const after = appStore.getState().clipReview!;
    assert.deepEqual(after.ids, before.ids);
    assert.equal(after.answers['review-0'], undefined);
    assert.deepEqual(after.answers['review-1'], before.answers['review-1']);
    assert.notDeepEqual(
      after.choices[getLyrics(song.id).sentences[0]!.id],
      before.choices[getLyrics(song.id).sentences[0]!.id],
    );
    assert.deepEqual(
      after.choices[getLyrics(song.id).sentences[1]!.id],
      before.choices[getLyrics(song.id).sentences[1]!.id],
    );
    assert.equal(
      after.choices[getLyrics(song.id).sentences[0]!.id]!.find((choice) => choice.correct)?.text,
      translation,
    );
    assert.equal(after.combo, 0);
    t.mock.timers.tick(800);
    assert.equal(appStore.getState().clipReview?.index, 0);
    appStore.getState().answerClip(translation);
    assert.equal(appStore.getState().clipReview?.answers['review-0']?.correct, true);
  }
});
