import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  announceNowPlaying,
  offlineSwitch,
  playbackBlock,
  playbackSource,
  reachedPlayed,
  recordPlayed,
} from '../src/audio/playback';
import { downloadStore } from '../src/downloads/store';
import { setLibraryDb } from '../src/navidrome/libraryDb';
import { sessionStore } from '../src/navidrome/session';
import { appStore, resetAppState } from '../src/store/appStore';
import { libraryStore } from '../src/store/libraryStore';
import { settingsStore } from '../src/store/settingsStore';
import { albums, artists, fakeLibraryDb, firstSong, songLyrics, songs } from './fixtures';

const session = { url: 'https://music.test', username: 'user', token: 'token', salt: 'salt' };
const song = { ...firstSong, coverArt: 'cover' };

beforeEach(async () => {
  await resetAppState();
  downloadStore.setState({ entries: {}, art: {}, root: 'file:///downloads', progress: null });
  libraryStore
    .getState()
    .setLibrary({ songs: songs.map((item) => ({ ...item, coverArt: 'cover' })), albums, artists, lyrics: songLyrics });
  sessionStore.setState({ session });
});
afterEach(() => {
  setLibraryDb(undefined);
  sessionStore.setState({ session: null });
  settingsStore.setState({ offlineMode: false });
});

const downloaded = () =>
  downloadStore.setState({
    entries: { [song.id]: { status: 'done', fileName: `${song.id}.mp3`, createdAt: 1, updatedAt: 1 } },
    art: { cover: { fileName: 'cover.jpg', bytes: 1 } },
  });

test('a song counts as played at half its length, capped at 240 seconds', () => {
  assert.equal(reachedPlayed(0, 0), false);
  assert.equal(reachedPlayed(118999, 238000), false);
  assert.equal(reachedPlayed(119000, 238000), true);
  assert.equal(reachedPlayed(239999, 600000), false);
  assert.equal(reachedPlayed(240000, 600000), true);
});

test('sources prefer downloads, then stream, and offline mode blocks undownloaded songs', () => {
  assert.equal(playbackBlock(song), undefined);
  assert.match(playbackSource(song).uri, /^https:\/\/music\.test\/rest\/stream/);
  assert.match(playbackSource(song).artworkUrl!, /getCoverArt/);
  settingsStore.setState({ offlineMode: true });
  assert.deepEqual(playbackBlock(song), { error: 'Song is not downloaded', release: true });
  downloaded();
  assert.equal(playbackBlock(song), undefined);
  assert.match(playbackSource(song).uri, /^file:\/\/\/downloads\/audio\//);
  sessionStore.setState({ session: null });
  settingsStore.setState({ offlineMode: false });
  downloadStore.setState({ entries: {} });
  assert.deepEqual(playbackBlock(song), { error: 'No account is connected', release: false });
});

test('going offline keeps, reloads or releases the loaded song', () => {
  const stream = playbackSource(song).uri;
  assert.equal(offlineSwitch(song, stream), 'release');
  downloaded();
  assert.equal(offlineSwitch(song, stream), 'reload');
  assert.equal(offlineSwitch(song, playbackSource(song).uri), 'keep');
});

test('recordPlayed marks Recently played, saves it and scrobbles unless offline', async (t) => {
  const saved: [string, number][] = [],
    urls: string[] = [];
  setLibraryDb(
    fakeLibraryDb({
      savePlayed: async (id, at) => {
        saved.push([id, at]);
      },
    }),
  );
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(String(url));
    return Response.json({ 'subsonic-response': { status: 'ok' } });
  });
  recordPlayed(song);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved[0]?.[0], song.id);
  assert.equal(libraryStore.getState().bySong[song.id]?.played, saved[0]?.[1]);
  assert.equal(urls.length, 1);
  assert.match(urls[0]!, /scrobble.*submission=true/);
  settingsStore.setState({ offlineMode: true });
  recordPlayed(song);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.length, 2);
  assert.equal(urls.length, 1);
});

test('a failed played save reports Recently played, and a failed now-playing scrobble reports the server', async (t) => {
  setLibraryDb(
    fakeLibraryDb({
      savePlayed: async () => {
        throw new Error('disk');
      },
    }),
  );
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  recordPlayed(song);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appStore.getState().playbackError, 'Could not save Recently played');
  announceNowPlaying(song);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appStore.getState().playbackError, 'Could not announce this song to the server');
});

test('clip playback never announces to the server', async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(String(url));
    return Response.json({ 'subsonic-response': { status: 'ok' } });
  });
  appStore.setState({ clipPlayback: { songId: song.id, startMs: 0, endMs: 1000, positionMs: 0, ended: false } });
  announceNowPlaying(song);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(urls, []);
});
