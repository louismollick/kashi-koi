import {
  setTranslator,
  resumeTranslations,
  pauseTranslations,
  setTranslationForeground,
} from '../src/japanese/translate';
import { availableReviewList } from '../src/data/reviewVisibility';
import { withSentences } from '../src/lyrics/sentences';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  cancelDownloads,
  deleteAllDownloads,
  loadDownloadState,
  pruneDownloads,
  queueDownloads,
  removeDownloads,
  resumeDownloads,
  retryFailedDownloads,
  setDownloadRuntime,
  waitForDownloads,
} from '../src/downloads/queue';
import { downloadStore, isDownloaded, localAudioUri, localArtUri, type DownloadEntries } from '../src/downloads/store';
import { eligibleSongs } from '../src/downloads/targets';
import { downloadSummary } from '../src/downloads/selectors';
import { validateMediaHeader, type DownloadMedia } from '../src/downloads/validation';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import { assetName, audioExtension } from '../src/downloads/names';
import { appStore, resetAppState, setTransport, hydrateAppState } from '../src/store/appStore';
import { libraryStore, readyReviewLines, hasTranslations } from '../src/store/libraryStore';
import { sessionStore } from '../src/navidrome/session';
import { countedFilters, getVisibleLibrary, getVisibleSongs } from '../src/data/libraryVisibility';
import { scanLyrics, syncLibrary } from '../src/navidrome/sync';
import { analyzeSong, prioritizeAnalyses, setAnalysisRuntime } from '../src/analysis/fetcher';
import { setBreakdownRuntime } from '../src/analysis/breakdowns';
import { albums, artists, songs, songLyrics } from './fixtures';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let rows: DownloadEntries,
  files: Map<string, number>,
  transfers: string[],
  moves: [string, string][],
  begins: number[],
  ends: boolean[];
const root = 'file:///documents/downloads';
const entry = (status: DownloadEntries[string]['status']) => ({ status, createdAt: 1, updatedAt: 1 });

beforeEach(async () => {
  rows = {};
  files = new Map();
  transfers = [];
  moves = [];
  begins = [];
  ends = [];
  setDownloadRuntime(testRuntime());
  setBreakdownRuntime({ read: async () => undefined, save: async () => {}, remove: async () => {} });
  await cancelDownloads();
  downloadStore.setState({ entries: {}, art: {}, root: null, progress: null });
  await resetAppState();
  setAnalysisRuntime({ fetch: async () => new Response(null, { status: 404 }) });
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  sessionStore.setState({
    session: { url: 'https://music.test', username: 'user', salt: 'salt', token: 'token' },
    ready: true,
  });
});
afterEach(async () => {
  await cancelDownloads();
  await pauseTranslations(true);
  await setTranslationForeground(true);
  sessionStore.setState({ session: null });
  await resetAppState();
});

test('eligibility uses synced Japanese lyrics for every target and album ownership for artists', () => {
  const credited = { ...songs[0]!, artistId: 'guest' };
  const english = { ...songs[1]!, id: 'english' };
  libraryStore.getState().setLibrary({
    songs: [credited, english, ...songs.slice(1)],
    albums,
    artists,
    lyrics: {
      ...songLyrics,
      english: { ...songLyrics.glass!, songId: 'english', lines: [{ id: 'en', segments: [{ text: 'Hello' }] }] },
    },
  });
  appStore.setState({ hideSongsWithoutSyncedLyrics: false, hideSongsWithoutJapanese: false });
  assert.deepEqual(eligibleSongs({ kind: 'song', id: 'dawn' }), [credited]);
  assert.equal(eligibleSongs({ kind: 'song', id: 'english' }).length, 0);
  assert.equal(eligibleSongs({ kind: 'song', id: 'missing' }).length, 0);
  assert.equal(eligibleSongs({ kind: 'album', id: 'dawn' }).length, 1);
  assert.deepEqual(
    eligibleSongs({ kind: 'artist', id: 'minami' }).map((song) => song.id),
    ['dawn', 'glass', 'dream'],
  );
  assert.equal(eligibleSongs({ kind: 'library' }).length, 6);
});

test('queue deduplicates concurrent taps, writes temporary audio then renames, and shares 600px artwork', async () => {
  const first = { ...songs[0]!, suffix: 'FLAC', coverArt: 'shared' },
    second = { ...songs[1]!, coverArt: 'shared' };
  libraryStore.getState().setLibrary({
    songs: [first, second],
    albums: albums.map((album) => ({ ...album, coverArt: 'album' })),
    artists,
    lyrics: songLyrics,
  });
  const counts = await Promise.all([queueDownloads({ kind: 'library' }), queueDownloads({ kind: 'library' })]);
  assert.equal(
    counts.reduce((sum, count) => sum + count),
    2,
  );
  await waitForDownloads();
  assert.equal(transfers.filter((url) => url.includes('stream.view')).length, 2);
  assert.equal(transfers.filter((url) => url.includes('getCoverArt.view')).length, 2);
  assert.ok(
    transfers
      .filter((url) => url.includes('getCoverArt.view'))
      .every((url) => new URL(url).searchParams.get('size') === '600'),
  );
  assert.ok(moves.every(([from, to]) => from.endsWith('.part') && !to.endsWith('.part')));
  assert.equal(localAudioUri(first.id), `${root}/audio/dawn.flac`);
  assert.equal(localArtUri('shared'), `${root}/art/shared.jpg`);
  assert.equal(isDownloaded(first.id), true);
  assert.equal(await queueDownloads({ kind: 'library' }), 0);
  assert.deepEqual(downloadSummary({ kind: 'library' }), { eligible: 2, done: 2, pending: 0, failed: 0 });
});

test('failed partial audio never becomes local and a retry completes it', async () => {
  setDownloadRuntime({
    ...testRuntime(),
    download: async (_url, uri) => {
      files.set(uri, 2);
      throw new Error('Network failed');
    },
  });
  assert.equal(await queueDownloads({ kind: 'song', id: 'dawn' }), 1);
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'failed');
  assert.equal(rows.dawn?.error, 'Network failed');
  assert.equal(files.size, 0);
  assert.equal(localAudioUri('dawn'), undefined);
  assert.deepEqual(ends, [false]);
  setDownloadRuntime(testRuntime());
  await retryFailedDownloads();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'done');
});

/** Reuse this test's in-memory disk and database while replacing a transfer behavior. */
function testRuntime(headers: Partial<Record<DownloadMedia, Uint8Array>> = {}) {
  return {
    prepare: async () => ({ root, art: {} }),
    load: async () => structuredClone(rows),
    save: async (id: string, value: DownloadEntries[string]) => {
      rows[id] = structuredClone(value);
    },
    saveMany: async (entries: DownloadEntries) => {
      Object.assign(rows, structuredClone(entries));
    },
    saveAnalysis: async () => {},
    delete: async (id: string) => {
      delete rows[id];
    },
    clear: async () => {
      rows = {};
    },
    exists: async (uri: string) => files.has(uri),
    remove: async (uri: string) => {
      files.delete(uri);
    },
    clearFiles: async () => {
      files.clear();
    },
    download: async (
      url: string,
      uri: string,
      _signal: AbortSignal,
      kind: DownloadMedia,
      onProgress?: (fraction: number) => void,
    ) => {
      transfers.push(url);
      files.set(uri, 100);
      onProgress?.(0.5);
      onProgress?.(1);
      validateMediaHeader(headers[kind] ?? new Uint8Array([0xff, kind === 'audio' ? 0xfb : 0xd8, 0xff]), kind);
      return 100;
    },
    move: async (from: string, to: string) => {
      assert.ok(files.has(from));
      moves.push([from, to]);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    prepareText: async () => {},
    observe: async () => true,
    begin: async (total: number) => {
      begins.push(total);
      return true;
    },
    progress: async () => {},
    end: async (success: boolean) => {
      ends.push(success);
    },
  };
}

test('boot recovers interrupted and missing files, resumes without a background request, and preserves valid done rows', async () => {
  rows = {
    dawn: entry('downloading'),
    glass: entry('queued'),
    rain: { ...entry('done'), fileName: 'rain.mp3', bytes: 100 },
    dream: { ...entry('done'), fileName: 'lost.mp3' },
  };
  files.set(`${root}/audio/rain.mp3`, 100);
  await loadDownloadState();
  await waitForDownloads();
  assert.deepEqual(
    Object.values(rows).map((value) => value.status),
    ['done', 'done', 'done', 'done'],
  );
  assert.equal(transfers.length, 3);
  assert.deepEqual(begins, []);
});

test('three workers bound concurrency; cancellation aborts transfers and returns them to queued', async () => {
  let active = 0,
    peak = 0;
  setDownloadRuntime({
    ...testRuntime(),
    download: async (_url, uri, signal) => {
      active++;
      peak = Math.max(peak, active);
      files.set(uri, 1);
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            active--;
            reject(new Error('Aborted'));
          },
          { once: true },
        ),
      );
      return 100;
    },
  });
  await queueDownloads({ kind: 'library' });
  await tick();
  assert.equal(active, 3);
  assert.equal(peak, 3);
  await cancelDownloads();
  assert.ok(Object.values(rows).every((row) => row.status === 'queued'));
  assert.equal(files.size, 0);
  assert.equal(downloadStore.getState().progress, null);
  setDownloadRuntime(testRuntime());
  await resumeDownloads();
  assert.ok(Object.values(rows).every((row) => row.status === 'done'));
});

test('done is published only after the rename succeeds and a failed rename removes the partial file', async () => {
  const rename = gate();
  setDownloadRuntime({
    ...testRuntime(),
    move: async () => {
      await rename.promise;
      throw new Error('Rename failed');
    },
  });
  await queueDownloads({ kind: 'song', id: 'dawn' });
  await tick();
  assert.equal(isDownloaded('dawn'), false);
  assert.equal(downloadStore.getState().entries.dawn?.status, 'downloading');
  rename.resolve();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'failed');
  assert.equal(files.size, 0);
});

test('target removal keeps shared art until its last song is removed; library pruning and delete-all remove rows and files', async () => {
  libraryStore
    .getState()
    .setLibrary({ songs: songs.map((song) => ({ ...song, coverArt: 'shared' })), albums, artists, lyrics: songLyrics });
  await queueDownloads({ kind: 'library' });
  await waitForDownloads();
  await removeDownloads({ kind: 'song', id: 'dawn' });
  assert.equal(isDownloaded('dawn'), false);
  assert.ok(localArtUri('shared'));
  libraryStore.getState().setLibrary({ songs: [songs[1]!], albums, artists, lyrics: songLyrics });
  await pruneDownloads();
  assert.deepEqual(Object.keys(rows), ['glass']);
  await deleteAllDownloads();
  assert.equal(files.size, 0);
  assert.deepEqual(rows, {});
  assert.deepEqual(downloadStore.getState().art, {});
});

test('offline visibility, lyric hidden counts, album queue steps and review readiness use only downloads', async () => {
  downloadStore.setState({
    root,
    entries: { dawn: { ...entry('done'), fileName: 'dawn.mp3' }, rain: { ...entry('done'), fileName: 'rain.mp3' } },
  });
  appStore.setState({ offlineMode: true });
  await cancelDownloads();
  const filters = { hideUnsynced: false, hideNonJapanese: false, downloadedOnly: true };
  assert.deepEqual(
    getVisibleSongs(songs, filters).map((song) => song.id),
    ['dawn', 'rain'],
  );
  const visible = getVisibleLibrary(filters);
  assert.deepEqual(
    visible.albums.map((album) => album.id),
    ['dawn', 'rain'],
  );
  assert.deepEqual(
    visible.artists.map((artist) => artist.id),
    ['minami', 'deep-sea'],
  );
  assert.equal(songs.length - getVisibleSongs(songs, countedFilters(filters)).length, 0);
  const noLyrics = { ...songs.find((song) => song.id === 'tide')! };
  downloadStore.setState(({ entries }) => ({
    entries: { ...entries, tide: { ...entry('done'), fileName: 'tide.mp3' } },
  }));
  assert.equal(getVisibleSongs([noLyrics], countedFilters(filters)).length, 0);
  assert.equal(songs.length - getVisibleSongs(songs, countedFilters(filters)).length, 1);
  const loaded: string[] = [],
    detach = setTransport({
      load: (song) => {
        loaded.push(song.id);
      },
      play() {},
      pause() {},
      seek() {},
    });
  try {
    appStore.getState().startAlbum('dawn');
    assert.equal(appStore.getState().songId, 'dawn');
    appStore.setState({ queue: ['dawn', 'glass', 'rain'] });
    appStore.getState().nextSong();
    assert.equal(appStore.getState().songId, 'rain');
    appStore.getState().previousSong();
    assert.equal(appStore.getState().songId, 'dawn');
    appStore.getState().startSong('glass');
    assert.equal(appStore.getState().playbackError, 'Song is not downloaded');
    assert.equal(appStore.getState().loading, false);
    assert.equal(appStore.getState().playing, false);
    assert.deepEqual(loaded, ['dawn', 'rain', 'dawn']);
    const review = ['dawn', 'glass'].map((songId) => ({
      id: songId,
      songId,
      sentenceId: songLyrics[songId]!.sentences[0]!.id,
      kind: 'due' as const,
      misses: 1,
    }));
    assert.deepEqual(
      readyReviewLines(review).map((item) => item.songId),
      ['dawn'],
    );
  } finally {
    detach();
  }
});

test('offline calls skip library sync, scans, analysis reads and generation, and download queueing', async () => {
  appStore.setState({ offlineMode: true, analysisServerUrl: 'https://analysis.test', analysisToken: 'owner' });
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Unexpected network');
  };
  setAnalysisRuntime({ fetch: globalThis.fetch });
  try {
    await syncLibrary();
    await scanLyrics({ all: true });
    await analyzeSong('dawn');
    await prioritizeAnalyses(['dawn']);
    assert.equal(await queueDownloads({ kind: 'library' }), 0);
    assert.equal(calls, 0);
    assert.deepEqual(begins, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('asset names prevent server ids from creating paths; suffixes preserve audio format', () => {
  assert.equal(assetName('../a/b'), '%2E%2E%2Fa%2Fb');
  assert.equal(audioExtension('FLAC'), 'flac');
  assert.equal(audioExtension('../aac'), 'mp3');
  assert.equal(audioExtension(), 'mp3');
});

test('granted background downloads wait for fallback translation persistence and use GET only', async () => {
  const translated = gate(),
    saved = gate(),
    calls: string[] = [];
  const source = songLyrics.dawn!;
  libraryStore.getState().setLibrary({
    songs: [songs[0]!],
    albums,
    artists,
    lyrics: {
      dawn: withSentences({
        songId: 'dawn',
        timeline: source.timeline,
        lines: source.lines.map(({ translation: _translation, ...line }) => line),
      }),
    },
  });
  libraryStore.setState({ translationStatus: 'installed' });
  appStore.setState({ analysisServerUrl: 'https://analysis.test', analysisToken: 'owner' });
  setAnalysisRuntime({
    fetch: async (_url, init) => {
      calls.push(init?.method ?? 'GET');
      return new Response(null, { status: 404 });
    },
  });
  setTranslator(
    {
      translationStatus: async () => 'installed',
      prepareTranslation: async () => 'installed',
      tokenize: async (texts) => texts.map((surface) => [{ surface }]),
      translate: async (texts) => {
        await translated.promise;
        return texts.map(() => 'Translated');
      },
    },
    async () => {
      await saved.promise;
    },
  );
  const { prepareText: _prepareText, ...adapters } = testRuntime();
  setDownloadRuntime(adapters);
  const translation = resumeTranslations();
  await queueDownloads({ kind: 'song', id: 'dawn' });
  await tick();
  assert.equal(isDownloaded('dawn'), false);
  assert.equal(hasTranslations('dawn'), false);
  const backgroundTranslation = setTranslationForeground(false);
  translated.resolve();
  await tick();
  assert.equal(isDownloaded('dawn'), false);
  saved.resolve();
  await translation;
  await backgroundTranslation;
  await waitForDownloads();
  assert.equal(isDownloaded('dawn'), true);
  assert.equal(hasTranslations('dawn'), true);
  assert.deepEqual(calls, ['GET']);
});

test('a duplicate tap whose native begin resolves after drain ends the unused task', async () => {
  const transfer = gate(),
    begin = gate();
  setDownloadRuntime({
    ...testRuntime(),
    download: async (_url, uri) => {
      await transfer.promise;
      files.set(uri, 100);
      return 100;
    },
    begin: async () => {
      if (begins.length) await begin.promise;
      begins.push(1);
      return true;
    },
  });
  await queueDownloads({ kind: 'song', id: 'dawn' });
  const duplicate = queueDownloads({ kind: 'song', id: 'dawn' });
  await tick();
  transfer.resolve();
  await tick();
  assert.equal(isDownloaded('dawn'), true);
  begin.resolve();
  assert.equal(await duplicate, 0);
  await waitForDownloads();
  assert.deepEqual(ends, [true]);
});

test('available review lists preserve stored unavailable schedules and omit them only offline', async () => {
  const review = ['dawn', 'glass'].map((songId) => ({
    id: songId,
    songId,
    sentenceId: songLyrics[songId]!.sentences[0]!.id,
    kind: 'due' as const,
    misses: 1,
  }));
  appStore.setState({ reviewList: review, offlineMode: true });
  await cancelDownloads();
  downloadStore.setState({ entries: { dawn: { ...entry('done'), fileName: 'dawn.mp3' } }, root });
  assert.deepEqual(
    availableReviewList(review).map((item) => item.songId),
    ['dawn'],
  );
  assert.equal(appStore.getState().reviewList.length, 2);
  appStore.setState({ offlineMode: false });
  assert.equal(availableReviewList(review).length, 2);
});

test('adding a new target while the previous batch drains keeps its background task alive', async () => {
  const first = gate(),
    begin = gate();
  let submissions = 0;
  setDownloadRuntime({
    ...testRuntime(),
    download: async (_url, uri) => {
      if (uri.includes('/dawn.')) await first.promise;
      files.set(uri, 100);
      return 100;
    },
    begin: async (total) => {
      submissions++;
      begins.push(total);
      if (submissions === 2) await begin.promise;
      return true;
    },
  });
  await queueDownloads({ kind: 'song', id: 'dawn' });
  const second = queueDownloads({ kind: 'song', id: 'glass' });
  await tick();
  first.resolve();
  await tick();
  assert.equal(isDownloaded('dawn'), true);
  assert.deepEqual(ends, []);
  begin.resolve();
  assert.equal(await second, 1);
  await waitForDownloads();
  assert.equal(isDownloaded('glass'), true);
  assert.deepEqual(ends, [true]);
});

test('offline mode hydrates and persists alongside the lyric filters', async () => {
  let saved = '';
  await hydrateAppState({
    getItem: () => JSON.stringify({ state: { offlineMode: true }, version: 0 }),
    setItem: (_key, value) => {
      saved = value;
    },
    removeItem() {},
  });
  assert.equal(appStore.getState().offlineMode, true);
  appStore.setState({ offlineMode: false });
  const state = (JSON.parse(saved) as { state: { offlineMode: boolean } }).state;
  assert.equal(state.offlineMode, false);
});

test('cancellation aborts the real analysis cache GET and releases persisted downloading rows', async () => {
  const started = gate();
  let requestSignal: AbortSignal | null | undefined;
  appStore.setState({ analysisServerUrl: 'https://analysis.test' });
  setAnalysisRuntime({
    fetch: async (_url, init) => {
      requestSignal = init?.signal;
      started.resolve();
      return new Promise<Response>((_resolve, reject) => {
        requestSignal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
    },
  });
  const { prepareText: _prepareText, ...adapters } = testRuntime();
  setDownloadRuntime(adapters);
  await queueDownloads({ kind: 'song', id: 'dawn' });
  await started.promise;
  assert.equal(requestSignal?.aborted, false);
  await cancelDownloads();
  assert.equal(requestSignal?.aborted, true);
  assert.equal(rows.dawn?.status, 'queued');
  assert.equal(isDownloaded('dawn'), false);
  assert.ok([...files.keys()].every((file) => !file.endsWith('.part')));
});

test('HTTP 200 error documents and invalid artwork fail without retaining partial audio', async () => {
  for (const [kind, text] of [
    ['audio', '  {"subsonic-response":{"status":"failed"}}'],
    ['audio', '\n<subsonic-response status="failed"/>'],
    ['image', ' {"subsonic-response":{"status":"failed"}}'],
    ['image', '<subsonic-response status="failed"/>'],
  ] as const) {
    await deleteAllDownloads();
    libraryStore
      .getState()
      .setLibrary({ songs: [{ ...songs[0]!, coverArt: 'cover' }], albums: [], artists, lyrics: songLyrics });
    setDownloadRuntime(testRuntime({ [kind]: new TextEncoder().encode(text) }));
    await queueDownloads({ kind: 'song', id: 'dawn' });
    await waitForDownloads();
    assert.equal(rows.dawn?.status, 'failed');
    assert.match(rows.dawn?.error ?? '', /not audio|not an image/);
    assert.equal(files.size, 0);
    assert.equal(localAudioUri('dawn'), undefined);
    assert.equal(localArtUri('cover'), undefined);
  }
  setDownloadRuntime(testRuntime());
  await retryFailedDownloads();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'done');
});

test('artwork accepts JPEG, PNG, WebP and both GIF headers; audio rejects empty and BOM error documents', () => {
  for (const bytes of [
    [0xff, 0xd8, 0xff],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    [...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP')],
    [...new TextEncoder().encode('GIF87a')],
    [...new TextEncoder().encode('GIF89a')],
  ])
    assert.doesNotThrow(() => validateMediaHeader(new Uint8Array(bytes), 'image'));
  assert.throws(() => validateMediaHeader(new Uint8Array(), 'audio'), /Empty/);
  assert.throws(() => validateMediaHeader(new TextEncoder().encode('\uFEFF \n{}'), 'audio'), /not audio/);
  assert.doesNotThrow(() => validateMediaHeader(new TextEncoder().encode('fLaC'), 'audio'));
});

test('a later refused background begin retains the running grant through drain', async () => {
  const transfer = gate();
  let calls = 0;
  setDownloadRuntime({
    ...testRuntime(),
    begin: async () => ++calls === 1,
    download: async (_url, uri) => {
      await transfer.promise;
      files.set(uri, 100);
      return 100;
    },
  });
  await queueDownloads({ kind: 'song', id: 'dawn' });
  assert.equal(await queueDownloads({ kind: 'song', id: 'glass' }), 1);
  assert.deepEqual(ends, []);
  transfer.resolve();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'done');
  assert.equal(rows.glass?.status, 'done');
  assert.deepEqual(ends, [true]);
});

function dawnAnalysis(): SongAnalysis {
  const lyrics = libraryStore.getState().lyrics.dawn!;
  return {
    schemaVersion: 3,
    fingerprint: lyrics.fingerprint,
    model: 'test',
    createdAt: '2026-10-11T00:00:00Z',
    title: 'Dawn',
    about: 'A bus ride.',
    lines: lyrics.timeline.map(() => 'A bus ride'),
    sentences: [{ start: 0, end: lyrics.timeline.length - 1, translation: 'A bus ride', quiz: null }],
  };
}

test('analysis GET HTTP and network failures remain retryable; 404 is allowed', async () => {
  appStore.setState({ analysisServerUrl: 'https://analysis.test' });
  const { prepareText: _prepareText, ...adapters } = testRuntime();
  setDownloadRuntime(adapters);
  for (const fetcher of [
    async () => new Response(null, { status: 503 }),
    async () => {
      throw new Error('Network failed');
    },
  ]) {
    setAnalysisRuntime({ fetch: fetcher });
    await queueDownloads({ kind: 'song', id: 'dawn' });
    await waitForDownloads();
    assert.equal(rows.dawn?.status, 'failed');
    assert.equal(files.size, 0);
  }
  setAnalysisRuntime({ fetch: async () => new Response(null, { status: 404 }) });
  await retryFailedDownloads();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'done');
});

test('analysis persistence failures fail the download and retry saves before marking done', async () => {
  appStore.setState({ analysisServerUrl: 'https://analysis.test' });
  const analysis = dawnAnalysis();
  setAnalysisRuntime({ fetch: async () => Response.json(analysis) });
  const { prepareText: _prepareText, ...adapters } = testRuntime();
  setDownloadRuntime({
    ...adapters,
    saveAnalysis: async () => {
      throw new Error('Disk full');
    },
  });
  await queueDownloads({ kind: 'song', id: 'dawn' });
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'failed');
  assert.equal(rows.dawn?.error, 'Disk full');
  assert.equal(libraryStore.getState().analyses[analysis.fingerprint], undefined);
  setDownloadRuntime(adapters);
  setAnalysisRuntime({
    fetch: async (url) =>
      String(url).includes('/breakdowns/') ? new Response(null, { status: 404 }) : Response.json(analysis),
  });
  await retryFailedDownloads();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'done');
  assert.ok(libraryStore.getState().analyses[analysis.fingerprint]);
});

test('breakdown HTTP, network, read and save failures fail downloads; missing explanations allow retry', async () => {
  appStore.setState({ analysisServerUrl: 'https://analysis.test' });
  const analysis = dawnAnalysis();
  libraryStore.getState().setAnalysis(analysis);
  const { prepareText: _prepareText, ...adapters } = testRuntime();
  setDownloadRuntime(adapters);
  for (const failure of ['http', 'network', 'read', 'save']) {
    let saveAttempts = 0;
    setBreakdownRuntime({
      read: async () => {
        if (failure === 'read') throw new Error('Read failed');
        return undefined;
      },
      save: async () => {
        saveAttempts++;
        if (failure === 'save') throw new Error('Save failed');
      },
      remove: async () => {},
    });
    setAnalysisRuntime({
      fetch: async () => {
        if (failure === 'network') throw new Error('Network failed');
        if (failure !== 'save') return new Response(null, { status: 503 });
        const lyrics = libraryStore.getState().lyrics.dawn!;
        const text = lyrics.timeline
          .map(({ lineId }) =>
            lyrics.lines
              .find((line) => line.id === lineId)!
              .segments.map(({ text }) => text)
              .join(''),
          )
          .join('\n');
        return Response.json({
          fingerprint: analysis.fingerprint,
          start: 0,
          model: 'test',
          createdAt: analysis.createdAt,
          chunks: [
            {
              text,
              reading: 'よあけ',
              role: 'topic',
              english: [],
              steps: [{ japanese: 'あ', reading: '', english: 'a' }],
              note: '',
            },
          ],
        });
      },
    });
    await queueDownloads({ kind: 'song', id: 'dawn' });
    await waitForDownloads();
    assert.equal(rows.dawn?.status, 'failed', failure);
    assert.equal(files.size, 0);
    assert.equal(saveAttempts, failure === 'save' ? 1 : 0, failure);
  }
  setBreakdownRuntime({ read: async () => undefined, save: async () => {}, remove: async () => {} });
  setAnalysisRuntime({ fetch: async () => new Response(null, { status: 404 }) });
  await retryFailedDownloads();
  await waitForDownloads();
  assert.equal(rows.dawn?.status, 'done');
});

test('bulk enqueue persists once and publishes all queued rows together; summary indexes are shared', async () => {
  const writes: DownloadEntries[] = [],
    published: DownloadEntries[] = [],
    transfer = gate();
  setDownloadRuntime({
    ...testRuntime(),
    saveMany: async (entries) => {
      writes.push(entries);
      Object.assign(rows, structuredClone(entries));
    },
    download: async (_url, uri) => {
      await transfer.promise;
      files.set(uri, 100);
      return 100;
    },
  });
  const unsubscribe = downloadStore.subscribe((state, previous) => {
    if (state.entries !== previous.entries) published.push(state.entries);
  });
  try {
    assert.equal(await queueDownloads({ kind: 'library' }), 6);
    assert.equal(writes.length, 1);
    assert.equal(Object.keys(writes[0]!).length, 6);
    assert.equal(Object.values(published[0]!).filter(({ status }) => status === 'queued').length, 6);
    const target = { kind: 'album', id: 'dawn' } as const;
    const summary = downloadSummary(target);
    for (const song of songs) downloadSummary({ kind: 'song', id: song.id });
    assert.equal(downloadSummary(target), summary);
    downloadStore.setState({ progress: { completed: 0, total: 6 } });
    assert.equal(downloadSummary(target), summary);
    downloadStore.setState(({ entries }) => ({ entries: { ...entries } }));
    assert.notEqual(downloadSummary(target), summary);
  } finally {
    unsubscribe();
    transfer.resolve();
    await waitForDownloads();
  }
});

test('background progress advances during audio and text stages before a song finishes', async () => {
  const text = gate(),
    updates: number[] = [];
  setDownloadRuntime({
    ...testRuntime(),
    prepareText: async () => {
      await text.promise;
    },
    progress: async (completed) => {
      updates.push(completed);
    },
  });
  await queueDownloads({ kind: 'song', id: 'dawn' });
  await tick();
  assert.equal(isDownloaded('dawn'), false);
  assert.ok(updates.some((completed) => completed > 0 && completed < 0.7));
  assert.ok(updates.includes(0.7));
  assert.ok(updates.includes(0.8));
  text.resolve();
  await waitForDownloads();
  assert.ok(updates.includes(0.9));
  assert.equal(updates.at(-1), 1);
});
