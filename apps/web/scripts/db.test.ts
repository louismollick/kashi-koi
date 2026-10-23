import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { albums, artists, songLyrics, songs } from '@kashi-koi/core/fixtures';
import type { Translations } from '@kashi-koi/core/store/libraryStore';
import type { Playlist } from '@kashi-koi/core/types/domain';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { createLibraryDb } from '../src/platform/db';

let databases = 0;
/** A fresh database per test, like a fresh install. */
const freshDb = () => createLibraryDb(`test-${databases++}`);

const unchecked = songs.map((song) => ({ ...song, lyricsStatus: 'unchecked' as const }));
const playlists: Playlist[] = [{ id: 'pl1', name: 'Mix', songIds: [unchecked[0]!.id, unchecked[0]!.id] }];
const fp = fingerprint(['猫']);
const analysis: SongAnalysis = {
  schemaVersion: 3,
  fingerprint: fp,
  model: 'test',
  createdAt: '2026-10-11T00:00:00Z',
  title: 'Cat',
  about: 'A cat.',
  lines: ['Cat'],
  sentences: [{ start: 0, end: 0, translation: 'Cat', quiz: null }],
};
const breakdown: Breakdown = {
  fingerprint: fp,
  start: 0,
  model: 'test',
  createdAt: analysis.createdAt,
  chunks: [
    {
      text: '猫',
      reading: 'ねこ',
      role: 'noun',
      english: ['Cat'],
      steps: [{ japanese: '猫', reading: 'ねこ', english: 'cat' }],
      note: '',
    },
  ],
};

test('an empty database loads as an empty library', async () => {
  const loaded = await freshDb().loadAll();
  assert.deepEqual(loaded, {
    songs: [],
    albums: [],
    artists: [],
    playlists: [],
    translations: {},
    analyses: {},
    lyrics: {},
  });
});

test('replaceLibrary publishes the library in server order and replaces the previous one', async () => {
  const db = freshDb();
  await db.replaceLibrary({ songs: unchecked, albums, artists, playlists });
  let loaded = await db.loadAll();
  // Order is the order written, not id order.
  assert.deepEqual(
    loaded.songs.map((song) => song.id),
    unchecked.map((song) => song.id),
  );
  assert.deepEqual(loaded.albums, albums);
  assert.deepEqual(loaded.artists, artists);
  assert.deepEqual(loaded.playlists, playlists);
  const reversed = [...unchecked].reverse();
  await db.replaceLibrary({ songs: reversed, albums: albums.slice(0, 1), artists: [] });
  loaded = await db.loadAll();
  assert.deepEqual(
    loaded.songs.map((song) => song.id),
    reversed.map((song) => song.id),
  );
  assert.equal(loaded.albums.length, 1);
  assert.deepEqual(loaded.artists, []);
  // Playlists may be missing from the input (fixtures, a first sync that fetched none): they are cleared.
  assert.deepEqual(loaded.playlists, []);
});

test('a duplicate id fails replaceLibrary and leaves the stored library as it was', async () => {
  const db = freshDb();
  await db.replaceLibrary({ songs: unchecked, albums, artists });
  await assert.rejects(db.replaceLibrary({ songs: [unchecked[0]!, unchecked[0]!], albums: [], artists: [] }));
  assert.equal((await db.loadAll()).songs.length, unchecked.length);
});

test('lyrics are stored raw, kept across replaceLibrary and pruned for removed songs', async () => {
  const db = freshDb();
  const [first, second] = unchecked as [(typeof unchecked)[number], (typeof unchecked)[number]];
  await db.replaceLibrary({ songs: [first, second], albums, artists });
  await db.saveLyricsResults([
    { songId: first.id, status: 'synced', lyrics: songLyrics[first.id] },
    { songId: second.id, status: 'synced', lyrics: songLyrics[second.id] },
    // A result for a song that is not in the library is skipped.
    { songId: 'removed', status: 'synced', lyrics: songLyrics[first.id] },
  ]);
  let loaded = await db.loadAll();
  assert.deepEqual(Object.fromEntries(loaded.songs.map((song) => [song.id, song.lyricsStatus])), {
    [first.id]: 'synced',
    [second.id]: 'synced',
  });
  assert.deepEqual(Object.keys(loaded.lyrics).sort(), [first.id, second.id].sort());
  const stored = loaded.lyrics[first.id]!;
  // Raw: no sentences, no fingerprint, no translations or readings.
  assert.equal(stored.sentences, undefined);
  assert.equal(stored.timeline.length, songLyrics[first.id]!.timeline.length);
  assert.ok(stored.lines.every((line) => line.segments.length === 1 && line.translation === undefined));
  assert.deepEqual(
    stored.lines.map((line) => line.segments[0]!.text),
    songLyrics[first.id]!.lines.map((line) => line.segments.map((segment) => segment.text).join('')),
  );
  // Only the lyrics of songs still in the library survive a sync, and they stay as they were.
  await db.replaceLibrary({ songs: [{ ...first, lyricsStatus: 'synced' }], albums, artists });
  loaded = await db.loadAll();
  assert.deepEqual(Object.keys(loaded.lyrics), [first.id]);
  assert.deepEqual(loaded.lyrics[first.id], stored);
  // An error result changes the status but keeps good lyrics; 'none' drops them.
  await db.saveLyricsResults([{ songId: first.id, status: 'error' }]);
  loaded = await db.loadAll();
  assert.equal(loaded.songs[0]!.lyricsStatus, 'error');
  assert.deepEqual(loaded.lyrics[first.id], stored);
  await db.saveLyricsResults([{ songId: first.id, status: 'none' }]);
  loaded = await db.loadAll();
  assert.deepEqual(loaded.lyrics, {});
  assert.equal(loaded.songs[0]!.lyricsStatus, 'none');
});

test('savePlayed updates one song in place and ignores unknown songs', async () => {
  const db = freshDb();
  await db.replaceLibrary({ songs: unchecked, albums, artists });
  await db.savePlayed(unchecked[1]!.id, 12345);
  await db.savePlayed('missing', 1);
  const loaded = await db.loadAll();
  assert.deepEqual(
    loaded.songs.map((song) => song.played),
    unchecked.map((song, index) => (index === 1 ? 12345 : song.played)),
  );
  assert.deepEqual(
    loaded.songs.map((song) => song.id),
    unchecked.map((song) => song.id),
  );
});

test('translations are keyed by Japanese text, replaced on rewrite', async () => {
  const db = freshDb();
  const first: Translations = {
    猫: { translation: 'Cat', segments: [{ text: '猫', reading: 'ねこ' }] },
    犬: { translation: 'Dog', segments: [{ text: '犬', reading: 'いぬ' }] },
  };
  await db.saveTranslations(first);
  await db.saveTranslations({ 猫: { translation: 'Kitty', segments: [{ text: '猫' }] } });
  assert.deepEqual((await db.loadAll()).translations, {
    ...first,
    猫: { translation: 'Kitty', segments: [{ text: '猫' }] },
  });
});

test('analyses and breakdowns: a different analysis drops its breakdowns, an identical one keeps them', async () => {
  const db = freshDb();
  await assert.rejects(db.saveAnalysis({ ...analysis, lines: [] }), /Invalid song analysis/);
  await db.saveAnalysis(analysis);
  await db.saveBreakdown(breakdown);
  assert.deepEqual((await db.loadAll()).analyses, { [fp]: analysis });
  assert.deepEqual(await db.readBreakdown(fp, 0), breakdown);
  assert.equal(await db.readBreakdown(fp, 1), undefined);
  assert.equal(await db.readBreakdown('other', 0), undefined);
  await db.saveAnalysis(analysis);
  assert.deepEqual(await db.readBreakdown(fp, 0), breakdown);
  const replacement = { ...analysis, title: 'Another cat' };
  await db.saveAnalysis(replacement);
  assert.equal(await db.readBreakdown(fp, 0), undefined);
  assert.equal((await db.loadAll()).analyses?.[fp]?.title, 'Another cat');
  // Saving a breakdown replaces the one with the same fingerprint and start.
  await db.saveBreakdown(breakdown);
  await db.saveBreakdown({ ...breakdown, model: 'newer' });
  assert.equal((await db.readBreakdown(fp, 0))?.model, 'newer');
  await db.saveBreakdown({ ...breakdown, start: 2 });
  await db.deleteBreakdowns(fp);
  assert.equal(await db.readBreakdown(fp, 0), undefined);
  assert.equal(await db.readBreakdown(fp, 2), undefined);
  // The analysis itself stays.
  assert.ok((await db.loadAll()).analyses?.[fp]);
});

test('a cached breakdown that no longer validates reads as absent', async () => {
  const db = freshDb();
  await db.saveBreakdown({ ...breakdown, chunks: 'broken' } as unknown as Breakdown);
  assert.equal(await db.readBreakdown(fp, 0), undefined);
});

test('clearLibrary wipes every table', async () => {
  const db = freshDb();
  await db.replaceLibrary({ songs: unchecked, albums, artists, playlists });
  await db.saveLyricsResults([{ songId: unchecked[0]!.id, status: 'synced', lyrics: songLyrics[unchecked[0]!.id] }]);
  await db.saveTranslations({ 猫: { translation: 'Cat', segments: [{ text: '猫' }] } });
  await db.saveAnalysis(analysis);
  await db.saveBreakdown(breakdown);
  await db.clearLibrary();
  assert.deepEqual(await db.loadAll(), {
    songs: [],
    albums: [],
    artists: [],
    playlists: [],
    translations: {},
    analyses: {},
    lyrics: {},
  });
  assert.equal(await db.readBreakdown(fp, 0), undefined);
});

test('writes run in call order', async () => {
  const db = freshDb();
  const id = unchecked[0]!.id;
  await Promise.all([
    db.replaceLibrary({ songs: unchecked, albums, artists }),
    db.savePlayed(id, 1),
    db.savePlayed(id, 2),
  ]);
  assert.equal((await db.loadAll()).songs[0]!.played, 2);
});
