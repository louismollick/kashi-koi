import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { scan, scanLyrics, syncLibrary, cancelSync } from '../src/navidrome/sync';
import { sessionStore } from '../src/navidrome/session';
import { appStore } from '../src/store/appStore';
import { libraryStore } from '../src/store/libraryStore';
import { songs, albums, artists, songLyrics } from './fixtures';
import type { Session } from '../src/navidrome/subsonic';

const session: Session = { url: 'https://music.test', username: 'user', token: 'token', salt: 'salt' };
beforeEach(() => {
  libraryStore.getState().setLibrary({ songs: [songs[0]!], albums, artists, lyrics: songLyrics });
  libraryStore.setState({ error: null, progress: null });
  appStore.setState(appStore.getInitialState(), true);
});

test('failed rescans preserve synced lyrics and review entries but count errors', async () => {
  const original = globalThis.fetch, song = songs[0]!, cached = songLyrics[song.id]!;
  const mark = { id: 'mark', songId: song.id, lineId: cached.lines[0]!.id, kind: 'new' as const };
  appStore.setState({ reviewList: [mark] });
  try {
    for (const response of ['request', 'parse']) {
      globalThis.fetch = async () => {
        if (response === 'request') throw new Error('offline');
        return Response.json({ 'subsonic-response': { status: 'ok', lyricsList: { structuredLyrics: [{ synced: true, line: [{ value: 'bad' }] }] } } });
      };
      await scan(session, true, () => true, async () => assert.fail('good cached lyrics must not be overwritten'));
      assert.equal(libraryStore.getState().bySong[song.id]!.lyricsStatus, 'synced');
      assert.equal(libraryStore.getState().lyrics[song.id], cached);
      assert.deepEqual(appStore.getState().reviewList, [mark]);
      assert.match(libraryStore.getState().error!, /1 songs could not be checked/);
    }
    libraryStore.getState().setLyricsResult(song.id, 'error');
    assert.equal(libraryStore.getState().lyrics[song.id], cached);
    assert.equal(libraryStore.getState().bySong[song.id]!.lyricsStatus, 'synced');
  } finally { globalThis.fetch = original; }
});

test('songs without good cached lyrics record retryable errors', async () => {
  const original = globalThis.fetch, song = { ...songs[0]!, lyricsStatus: 'unchecked' as const };
  libraryStore.getState().setLibrary({ songs: [song], albums, artists, lyrics: {} });
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const saved: string[] = [];
    await scan(session, true, () => true, async (id, status) => { saved.push(`${id}:${status}`); });
    assert.deepEqual(saved, [`${song.id}:error`]);
    assert.equal(libraryStore.getState().bySong[song.id]!.lyricsStatus, 'error');
  } finally { globalThis.fetch = original; }
});

test('successful refresh prunes removed review lines, preserves retimed lines, and none clears lyrics', async () => {
  const original = globalThis.fetch, song = songs[0]!, cached = songLyrics[song.id]!;
  const retained = cached.lines[0]!, removed = cached.lines[1]!;
  appStore.setState({ reviewList: [
    { id: 'keep', songId: song.id, lineId: retained.id, kind: 'new' },
    { id: 'remove', songId: song.id, lineId: removed.id, kind: 'due', misses: 1 },
    { id: 'other', songId: 'other', lineId: 'other:line', kind: 'later', step: 0, dueAt: Date.now() + 86400000 },
  ] });
  try {
    globalThis.fetch = async () => Response.json({ 'subsonic-response': { status: 'ok', lyricsList: { structuredLyrics: [{ synced: true, line: [{ start: 3000, value: retained.segments.map(segment => segment.text).join('') }] }] } } });
    await scan(session, true, () => true, async () => {});
    assert.deepEqual(appStore.getState().reviewList.map(item => item.id), ['keep', 'other']);
    assert.equal(libraryStore.getState().lyrics[song.id]!.timeline[0]!.startMs, 3000);
    globalThis.fetch = async () => Response.json({ 'subsonic-response': { status: 'ok', lyricsList: { structuredLyrics: [{ synced: false, line: [{ value: 'plain text' }] }] } } });
    await scan(session, true, () => true, async () => {});
    assert.deepEqual(appStore.getState().reviewList.map(item => item.id), ['other']);
    assert.equal(libraryStore.getState().bySong[song.id]!.lyricsStatus, 'none');
    assert.equal(libraryStore.getState().lyrics[song.id], undefined);
  } finally { globalThis.fetch = original; }
});

test('a failed save stops new work and waits for all workers before rejecting', async () => {
  const original = globalThis.fetch, targets = Array.from({ length: 6 }, (_, index) => ({ ...songs[0]!, id: String(index), lyricsStatus: 'unchecked' as const }));
  libraryStore.getState().setLibrary({ songs: targets, albums, artists, lyrics: {} });
  let release!: () => void, entered!: () => void, settled = false;
  const gate = new Promise<void>(resolve => { release = resolve; }), allSaving = new Promise<void>(resolve => { entered = resolve; });
  const saved: string[] = [], failure = new Error('SQLite write failed');
  try {
    globalThis.fetch = async () => Response.json({ 'subsonic-response': { status: 'ok', lyricsList: {} } });
    const work = scan(session, true, () => true, async id => {
      saved.push(id);
      if (saved.length === 4) entered();
      if (id === '0') { await allSaving; throw failure; }
      await gate;
    });
    const result = work.then(() => { settled = true; }, error => { settled = true; return error as unknown; });
    await allSaving;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    release();
    assert.equal(await result, failure);
    assert.deepEqual(saved, ['0', '1', '2', '3']);
    assert.ok(libraryStore.getState().songs.every(song => song.lyricsStatus === 'unchecked'));
    assert.equal(appStore.getState().lastScanAt, null);
  } finally { release(); globalThis.fetch = original; }
});

test('cancellation during a saved result prevents publishing or pruning', async () => {
  const original = globalThis.fetch, song = songs[0]!, cached = songLyrics[song.id]!;
  let valid = true;
  appStore.setState({ reviewList: [{ id: 'mark', songId: song.id, lineId: cached.lines[0]!.id, kind: 'new' }] });
  try {
    globalThis.fetch = async () => Response.json({ 'subsonic-response': { status: 'ok', lyricsList: {} } });
    await scan(session, true, () => valid, async () => { valid = false; });
    assert.equal(libraryStore.getState().lyrics[song.id], cached);
    assert.equal(appStore.getState().reviewList.length, 1);
    assert.equal(appStore.getState().lastScanAt, null);
  } finally { globalThis.fetch = original; }
});

test('clearing the session refuses new syncs while cancellation waits for active work', async () => {
  const original = globalThis.fetch, song = songs[0]!, cached = songLyrics[song.id]!;
  let release!: () => void, calls = 0, cancelled = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    sessionStore.setState({ session });
    globalThis.fetch = async () => { calls++; await gate; return Response.json({ 'subsonic-response': { status: 'ok', lyricsList: {} } }); };
    const active = scanLyrics({ all: true });
    sessionStore.setState({ session: null });
    await syncLibrary();
    await scanLyrics({ all: true });
    const cancellation = cancelSync().then(() => { cancelled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(cancelled, false);
    release();
    await active;
    await cancellation;
    assert.equal(libraryStore.getState().lyrics[song.id], cached);
    assert.equal(appStore.getState().lastScanAt, null);
    assert.equal(libraryStore.getState().progress, null);
  } finally { release(); sessionStore.setState({ session: null }); globalThis.fetch = original; }
});
