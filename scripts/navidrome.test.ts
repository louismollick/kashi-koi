import test from 'node:test';
import assert from 'node:assert/strict';
import { authParams, loginError, mediaUrl, normalizeServerUrl, request, searchAll, SubsonicError, type Session } from '../src/navidrome/subsonic';
import { currentOccurrence, pickEntry, toSongLyrics } from '../src/navidrome/lyrics';

const session: Session = { url: 'https://music.test/sub', username: '日本 user', token: 'abc', salt: 'fixed' };
test('server URLs preserve subpaths and explicit HTTP', () => {
  assert.equal(normalizeServerUrl(' music.test/sub/rest/// '), 'https://music.test/sub');
  assert.equal(normalizeServerUrl('http://localhost:4533/rest'), 'http://localhost:4533');
  assert.equal(normalizeServerUrl('https://music.test/a/'), 'https://music.test/a');
  for (const value of ['', 'ftp://music.test', 'https://', 'https://user:secret@music.test']) assert.throws(() => normalizeServerUrl(value));
});
test('auth and media URLs share token parameters without stream conversion', () => {
  const params = authParams(session);
  assert.deepEqual(Object.fromEntries(params), { u: '日本 user', t: 'abc', s: 'fixed', v: '1.16.1', c: 'kashi-koi', f: 'json' });
  const stream = new URL(mediaUrl(session, 'stream', 'song&1'));
  assert.equal(stream.searchParams.get('id'), 'song&1');
  assert.equal(stream.searchParams.get('t'), 'abc');
  assert.equal(stream.searchParams.has('format'), false);
  assert.equal(stream.searchParams.has('maxBitRate'), false);
  assert.equal(new URL(mediaUrl(session, 'getCoverArt', 'art', 151)).searchParams.get('size'), '300');
  assert.equal(new URL(mediaUrl(session, 'getCoverArt', 'art', 400)).searchParams.get('size'), '600');
});
test('Subsonic failures include code 40 and invalid envelopes', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong credentials' } } });
    await assert.rejects(request(session, 'ping'), error => error instanceof SubsonicError && error.code === 40 && loginError(error) === 'Wrong username or password');
    for (const response of [Response.json({}), Response.json({ 'subsonic-response': { status: 'other' } }), new Response('', { status: 503 })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(request(session, 'ping'), SubsonicError);
    }
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(request(session, 'ping'), SubsonicError);
  } finally { globalThis.fetch = original; }
});
test('lyrics entry prefers synced Japanese and ignores unsynced text', () => {
  const english = { synced: true, lang: 'en', line: [] }, japanese = { synced: true, lang: 'jpn', line: [] };
  assert.equal(pickEntry([english, japanese]), japanese);
  assert.equal(pickEntry([english]), english);
  assert.equal(pickEntry([{ synced: false, lang: 'ja', line: [] }]), undefined);
});
test('positive offset is earlier, chorus dedupes and blank lines end occurrences', () => {
  const lyrics = toSongLyrics('s', { synced: true, offset: 1000, line: [{ start: 2000, value: ' サビ ' }, { start: 4000, value: '' }, { start: 7000, value: '次' }, { start: 9000, value: 'サビ' }] }, 12000);
  assert.deepEqual(lyrics.lines.map(line => line.id), ['s:サビ', 's:次']);
  assert.deepEqual(lyrics.timeline, [{ lineId: 's:サビ', startMs: 1000, endMs: 3000 }, { lineId: 's:次', startMs: 6000, endMs: 8000 }, { lineId: 's:サビ', startMs: 8000, endMs: 12000 }]);
  assert.equal(currentOccurrence(lyrics.timeline, 0), -1);
  assert.equal(currentOccurrence(lyrics.timeline, 1000), 0);
  assert.equal(currentOccurrence(lyrics.timeline, 3000), 0);
  assert.equal(currentOccurrence(lyrics.timeline, 8000), 2);
  assert.equal(currentOccurrence(lyrics.timeline, 12000), 2);
  assert.equal(currentOccurrence([], 100), -1);
  assert.throws(() => toSongLyrics('s', { synced: true, line: [{ value: 'bad' }] }, 1000));
});
test('search3 stops on short or omitted pages and isolates counts', async () => {
  const original = globalThis.fetch, calls: URL[] = [];
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input)); calls.push(url);
      return Response.json({ 'subsonic-response': { status: 'ok', searchResult3: { song: Array.from({ length: calls.length === 1 ? 500 : 2 }, (_, id) => ({ id })) } } });
    };
    assert.equal((await searchAll(session, 'song')).length, 502);
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.searchParams.get('songOffset'), '500');
    assert.equal(calls[0]!.searchParams.get('albumCount'), '0');
    globalThis.fetch = async () => Response.json({ 'subsonic-response': { status: 'ok' } });
    assert.deepEqual(await searchAll(session, 'album'), []);
  } finally { globalThis.fetch = original; }
});

test('library sync carries lyrics status and local played times only for surviving songs', async () => {
  const { carryLyrics } = await import('../src/store/libraryStore');
  const { songs, albums, artists, songLyrics } = await import('./fixtures');
  const previous = { songs: songs.map((song, index) => ({ ...song, lyricsStatus: index === 0 ? 'error' as const : song.lyricsStatus })), albums, artists, lyrics: songLyrics };
  const result = carryLyrics({ songs: [{ ...songs[0]!, played: undefined, lyricsStatus: 'unchecked' }, { ...songs[1]!, id: 'new', lyricsStatus: 'unchecked' }], albums, artists }, previous);
  assert.equal(result.songs[0]!.lyricsStatus, 'error');
  assert.equal(result.songs[0]!.played, songs[0]!.played);
  assert.equal(result.songs[1]!.lyricsStatus, 'unchecked');
  assert.deepEqual(Object.keys(result.lyrics), [songs[0]!.id]);
});
