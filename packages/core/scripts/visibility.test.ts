import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { getLibraryFilters, getVisibleSongs, hasJapaneseLyrics } from '../src/data/libraryVisibility';
import { isJapanese } from '../src/japanese/text';
import { withSentences } from '../src/lyrics/sentences';
import { getLineText, libraryStore } from '../src/store/libraryStore';
import { settingsStore } from '../src/store/settingsStore';
import type { Line, LyricsStatus } from '../src/types/domain';
import { songs } from './fixtures';

const lyricsOf = (id: string, lines: Line[]) =>
  withSentences({
    songId: id,
    lines,
    timeline: lines.map((line, index) => ({ lineId: line.id, startMs: index * 1000, endMs: (index + 1) * 1000 })),
  });
const line = (id: string, ...texts: string[]): Line => ({ id, segments: texts.map((text) => ({ text })) });

// Cases cover the edges of isJapanese and getLineText: segments that only join into Japanese, repeat marks and long
// vowel marks alone, unused lines outside the timeline, empty lyrics and each lyrics status.
const cases: { name: string; status: LyricsStatus; lines: Line[]; timeline?: number }[] = [
  { name: 'kana', status: 'synced', lines: [line('a', 'こんにちは')] },
  { name: 'kanji after English', status: 'synced', lines: [line('a', 'Intro'), line('b', '日本')] },
  { name: 'katakana', status: 'synced', lines: [line('a', 'コーヒー')] },
  { name: 'English only', status: 'synced', lines: [line('a', 'Hello'), line('b', 'World')] },
  { name: 'repeat marks alone', status: 'synced', lines: [line('a', '々'), line('b', 'ーー'), line('c', '〆')] },
  { name: 'segments joining to Japanese', status: 'synced', lines: [line('a', 'He', 'llo'), line('b', '日', '本')] },
  { name: 'punctuation only', status: 'synced', lines: [line('a', '...'), line('b', '！？')] },
  { name: 'line outside the timeline', status: 'synced', lines: [line('a', 'Hello'), line('b', '歌')], timeline: 1 },
  { name: 'no lines', status: 'synced', lines: [] },
  { name: 'unchecked', status: 'unchecked', lines: [line('a', '歌')] },
  { name: 'no lyrics', status: 'none', lines: [line('a', '歌')] },
  { name: 'error', status: 'error', lines: [line('a', '歌')] },
];

/** The scan-everything rule `hasJapaneseLyrics` replaced. */
const reference = (id: string) => {
  const state = libraryStore.getState();
  return (
    state.bySong[id]?.lyricsStatus === 'synced' &&
    !!state.lyrics[id]?.lines.some((item) => isJapanese(getLineText(item)))
  );
};

const setCases = () =>
  libraryStore.getState().setLibrary({
    songs: cases.map((item, index) => ({ ...songs[0]!, id: `s${index}`, lyricsStatus: item.status })),
    albums: [],
    artists: [],
    lyrics: Object.fromEntries(
      cases.map((item, index) => [
        `s${index}`,
        withSentences({
          songId: `s${index}`,
          lines: item.lines,
          timeline: item.lines
            .slice(0, item.timeline ?? item.lines.length)
            .map((entry, i) => ({ lineId: entry.id, startMs: i * 1000, endMs: (i + 1) * 1000 })),
        }),
      ]),
    ),
  });

beforeEach(() => {
  settingsStore.setState(settingsStore.getInitialState(), true);
  setCases();
});

test('hasJapaneseLyrics matches a full scan of the lines on every edge case', () => {
  cases.forEach((item, index) => {
    const id = `s${index}`;
    assert.equal(hasJapaneseLyrics(id), reference(id), item.name);
  });
  assert.deepEqual(
    cases.flatMap((item, index) => (hasJapaneseLyrics(`s${index}`) ? [item.name] : [])),
    ['kana', 'kanji after English', 'katakana', 'segments joining to Japanese', 'line outside the timeline'],
  );
  assert.equal(hasJapaneseLyrics('missing'), false);
});

test('hasJapaneseLyrics follows lyrics results and survives translations', () => {
  const index = cases.findIndex((item) => item.name === 'English only'),
    id = `s${index}`;
  assert.equal(hasJapaneseLyrics(id), false);
  libraryStore.getState().setLyricsResult(id, 'synced', lyricsOf(id, [line('a', 'Hello'), line('b', '歌')]));
  assert.equal(hasJapaneseLyrics(id), true);
  // Readings and translations replace segments with the same text, so the flag cannot change.
  libraryStore
    .getState()
    .applyTranslationsToSong(id, { 歌: { translation: 'song', segments: [{ text: '歌', reading: 'うた' }] } });
  assert.equal(libraryStore.getState().lyrics[id]!.lines[1]!.translation, 'song');
  assert.equal(hasJapaneseLyrics(id), true);
  libraryStore.getState().setLyricsResult(id, 'synced', lyricsOf(id, [line('a', 'Hello')]));
  assert.equal(hasJapaneseLyrics(id), false);
  libraryStore.getState().setLyricsResult(id, 'none');
  assert.equal(hasJapaneseLyrics(id), false);
});

test('hide filters keep the same songs as a full scan', () => {
  settingsStore.setState({ hideSongsWithoutSyncedLyrics: true, hideSongsWithoutJapanese: true });
  const visible = getVisibleSongs(libraryStore.getState().songs, getLibraryFilters()).map((song) => song.id);
  assert.deepEqual(
    visible,
    cases.flatMap((_, index) => (reference(`s${index}`) ? [`s${index}`] : [])),
  );
});

test('translation updates leave the songs the visibility consumers subscribe to untouched', () => {
  const before = libraryStore.getState(),
    id = 's0';
  libraryStore
    .getState()
    .applyTranslationsToSong(id, { こんにちは: { translation: 'hello', segments: [{ text: 'こんにちは' }] } });
  const after = libraryStore.getState();
  assert.notEqual(after.lyrics, before.lyrics);
  assert.equal(after.songs, before.songs);
  assert.equal(after.bySong, before.bySong);
  // A scan result is what can change visibility, and it replaces the songs.
  libraryStore.getState().setLyricsResult(id, 'none');
  assert.notEqual(libraryStore.getState().songs, before.songs);
});
