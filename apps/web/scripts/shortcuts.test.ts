import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { albums, artists, songLyrics, songs } from '@kashi-koi/core/fixtures';
import { appStore, resetAppState, setTransport } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { type Focus, runShortcut, type Shortcut, shortcutFor } from '../src/hooks/useShortcuts';

const none = { ctrlKey: false, metaKey: false, altKey: false };
const press = (key: string, focus: Focus = 'none', modifiers = none) => shortcutFor(key, modifiers, focus);

test('keys map to their actions, letters in either case', () => {
  const expected: [string, Shortcut][] = [
    [' ', 'play-pause'],
    ['1', 'answer-1'],
    ['2', 'answer-2'],
    ['3', 'answer-3'],
    ['l', 'lost-mark'],
    ['L', 'lost-mark'],
    ['q', 'quiz'],
    ['s', 'speed'],
    ['ArrowLeft', 'previous-line'],
    ['ArrowRight', 'next-line'],
    ['n', 'next-song'],
    ['P', 'previous-song'],
  ];
  for (const [key, shortcut] of expected) assert.equal(press(key), shortcut, key);
  assert.equal(press('4'), null);
  assert.equal(press('x'), null);
  assert.equal(press('Enter'), null);
});

test('modifiers and text fields leave keys alone', () => {
  assert.equal(press('l', 'none', { ...none, metaKey: true }), null);
  assert.equal(press('s', 'none', { ...none, ctrlKey: true }), null);
  assert.equal(press('1', 'none', { ...none, altKey: true }), null);
  for (const key of [' ', '1', 'l', 'q', 'ArrowLeft']) assert.equal(press(key, 'typing'), null, key);
});

test('a focused button keeps Space, and the scrubber keeps the arrows', () => {
  assert.equal(press(' ', 'control'), null);
  assert.equal(press('q', 'control'), 'quiz');
  assert.equal(press('ArrowLeft', 'slider'), null);
  assert.equal(press('ArrowRight', 'slider'), null);
  assert.equal(press(' ', 'slider'), 'play-pause');
});

beforeEach(async () => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  setTransport({ load() {}, play() {}, pause() {}, seek() {} });
  settingsStore.setState({ playbackRate: 1, answerTime: null });
});

test('answer keys pick the matching choice once per sentence', () => {
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  const sentenceId = Object.keys(appStore.getState().run.choices)[0]!;
  const choices = appStore.getState().run.choices[sentenceId]!;
  assert.ok(choices.length >= 3);
  runShortcut('answer-2');
  assert.equal(appStore.getState().run.answers[sentenceId]?.choice, choices[1]?.text);
  runShortcut('answer-3');
  assert.equal(appStore.getState().run.answers[sentenceId]?.choice, choices[1]?.text);
});

test('L adds a lost mark in listen mode only, Q toggles quiz and S cycles speed', () => {
  appStore.getState().startSong('dawn');
  runShortcut('lost-mark');
  assert.equal(appStore.getState().reviewList.length, 1);
  runShortcut('quiz');
  assert.equal(appStore.getState().quizToggle, true);
  appStore.getState().jumpToLine(3);
  runShortcut('lost-mark');
  assert.equal(appStore.getState().reviewList.length, 1);
  runShortcut('quiz');
  assert.equal(appStore.getState().quizToggle, false);
  runShortcut('speed');
  assert.equal(settingsStore.getState().playbackRate, 0.75);
});

test('arrows move between lines and Space toggles playback', () => {
  appStore.getState().startSong('dawn');
  appStore.getState().jumpToLine(2);
  runShortcut('next-line');
  assert.equal(appStore.getState().positionMs, 27000);
  runShortcut('previous-line');
  runShortcut('previous-line');
  assert.equal(appStore.getState().positionMs, 9000);
  assert.equal(appStore.getState().playing, true);
  runShortcut('play-pause');
  assert.equal(appStore.getState().playing, false);
  runShortcut('play-pause');
  assert.equal(appStore.getState().playing, true);
});
