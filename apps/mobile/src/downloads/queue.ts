import { fetchAnalysis } from '@/analysis/client';
import { analysisSession } from '@/analysis/fetcher';
import { cacheSongBreakdowns } from '@/analysis/breakdowns';
import { prioritizeTranslations, ensureSongTranslation, setTranslationBackground } from '@/japanese/translate';
import { hasJapaneseLyrics } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { libraryStore } from '@/store/libraryStore';
import { sessionStore } from '@/navidrome/session';
import { mediaUrl } from '@/navidrome/subsonic';
import type { Song } from '@/types/domain';
import {
  assetName,
  audioExtension,
  clearFiles,
  deleteFile,
  downloadFile,
  fileExists,
  moveFile,
  prepareFiles,
} from './files';
import { downloadStore, type DownloadEntry, type DownloadTarget } from './store';
import { eligibleSongs, targetSongs } from './targets';

const defaults = {
  prepare: prepareFiles,
  download: downloadFile,
  move: moveFile,
  remove: deleteFile,
  exists: fileExists,
  clearFiles,
  load: async () => (await import('@/navidrome/db')).loadDownloads(),
  save: async (id: string, entry: DownloadEntry) => (await import('@/navidrome/db')).saveDownload(id, entry),
  delete: async (id: string) => (await import('@/navidrome/db')).deleteDownload(id),
  clear: async () => (await import('@/navidrome/db')).clearDownloads(),
  prepareText: async (song: Song, valid: () => boolean, signal: AbortSignal) => {
    const session = analysisSession(),
      lyrics = libraryStore.getState().lyrics[song.id];
    if (valid() && session.base && lyrics && !libraryStore.getState().analyses[lyrics.fingerprint]) {
      try {
        const result = await fetchAnalysis(session.base, lyrics.fingerprint, session.fetch, signal);
        if (
          result.status === 200 &&
          result.analysis.lines.length === lyrics.timeline.length &&
          valid() &&
          session.valid()
        ) {
          await (await import('@/navidrome/db')).saveAnalysis(result.analysis);
          if (valid() && session.valid()) libraryStore.getState().setAnalysis(result.analysis);
        }
      } catch {
        /* Cached lyrics and on-device translations remain usable. */
      }
    }
    if (!valid()) return;
    prioritizeTranslations([song.id]);
    await ensureSongTranslation(song.id, signal);
    if (!valid()) return;
    await cacheSongBreakdowns(song.id, valid, signal);
  },
  begin: async (total: number, completed = 0) => {
    const { AppState } = await import('react-native');
    if (AppState.currentState !== 'active') return false;
    const native = (await import('../../modules/kashi-downloads')).default;
    return native.begin('Downloading songs', `${completed} of ${total}`, total);
  },
  progress: async (completed: number, total: number) =>
    (await import('../../modules/kashi-downloads')).default.setProgress(completed, total, `${completed} of ${total}`),
  end: async (success: boolean) => (await import('../../modules/kashi-downloads')).default.end(success),
  observe: async () => {
    const { AppState } = await import('react-native');
    const native = (await import('../../modules/kashi-downloads')).default;
    foreground = AppState.currentState === 'active';
    native.addListener('onExpired', () => {
      setBackground(false);
      void cancelDownloads();
    });
    AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (foreground) void resumeDownloads();
      else if (!background) void cancelDownloads();
    });
  },
};
/** Share the native task lifetime with the on-device translation worker. */
function setBackground(value: boolean) {
  if (background === value) return;
  background = value;
  void setTranslationBackground(value);
}
let runtime = defaults;
let generation = 0,
  foreground = true,
  background = false,
  observing = false,
  queueing = false;
let running: Promise<void> | null = null;
let operations = Promise.resolve();
let controller: AbortController | null = null;
const artTransfers = new Map<string, Promise<void>>();

/** Inject filesystem, SQLite, text and native task work for deterministic Node tests. */
export function setDownloadRuntime(overrides: Partial<typeof defaults> = {}) {
  runtime = { ...defaults, ...overrides };
}
/** Serialize user operations; workers reserve songs synchronously before their first await. */
function operation<T>(work: () => Promise<T>): Promise<T> {
  const next = operations.catch(() => {}).then(work);
  operations = next.then(() => {});
  return next;
}
const pending = () =>
  Object.values(downloadStore.getState().entries).filter(
    (entry) => entry.status === 'queued' || entry.status === 'downloading',
  ).length;

async function publish(id: string, entry: DownloadEntry) {
  await runtime.save(id, entry);
  downloadStore.setState(({ entries }) => ({ entries: { ...entries, [id]: entry } }));
}
async function prepare() {
  if (!downloadStore.getState().root) downloadStore.setState(await runtime.prepare());
}

/** Share one artwork transfer per id and only expose complete, renamed files. */
async function cover(id: string, signal: AbortSignal, valid: () => boolean) {
  if (downloadStore.getState().art[id]) return;
  const existing = artTransfers.get(id);
  if (existing) return existing;
  const session = sessionStore.getState().session,
    root = downloadStore.getState().root;
  if (!session || !root) return;
  const fileName = `${assetName(id)}.jpg`,
    destination = `${root}/art/${fileName}`,
    temp = `${destination}.part`;
  const work = (async () => {
    try {
      const bytes = await runtime.download(mediaUrl(session, 'getCoverArt', id, 600), temp, signal);
      if (!valid()) return;
      await runtime.move(temp, destination);
      if (valid()) downloadStore.setState(({ art }) => ({ art: { ...art, [id]: { fileName, bytes } } }));
      else await runtime.remove(destination);
    } finally {
      await runtime.remove(temp);
    }
  })().finally(() => artTransfers.delete(id));
  artTransfers.set(id, work);
  return work;
}

/** Three workers finish audio, shared covers and cached text before marking a song done. */
function start() {
  if (
    running ||
    !pending() ||
    appStore.getState().offlineMode ||
    !sessionStore.getState().session ||
    (!foreground && !background)
  )
    return running ?? Promise.resolve();
  const version = generation,
    session = sessionStore.getState().session;
  controller = new AbortController();
  const signal = controller.signal;
  const valid = () =>
    version === generation && !appStore.getState().offlineMode && session === sessionStore.getState().session;
  if (!downloadStore.getState().progress) downloadStore.setState({ progress: { completed: 0, total: pending() } });
  let failures = false;
  running = (async () => {
    await prepare();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, async () => {
        while (valid()) {
          const pair = Object.entries(downloadStore.getState().entries).find(([, entry]) => entry.status === 'queued');
          if (!pair) break;
          const [id, entry] = pair,
            song = libraryStore.getState().bySong[id];
          const fileName = `${assetName(id)}.${audioExtension(song?.suffix)}`;
          const downloading: DownloadEntry = {
            ...entry,
            status: 'downloading',
            fileName,
            error: undefined,
            updatedAt: Date.now(),
          };
          downloadStore.setState(({ entries }) => ({ entries: { ...entries, [id]: downloading } }));
          const root = downloadStore.getState().root!;
          const destination = `${root}/audio/${fileName}`,
            temp = `${destination}.part`;
          let renamed = false;
          try {
            await runtime.save(id, downloading);
            if (!song || !hasJapaneseLyrics(id)) throw new Error('Song is no longer eligible');
            if (!valid()) break;
            const bytes = await runtime.download(mediaUrl(session!, 'stream', id), temp, signal);
            if (!valid()) break;
            const coverIds = new Set([libraryStore.getState().byAlbum[song.albumId]?.coverArt, song.coverArt]);
            for (const coverId of coverIds) if (coverId && valid()) await cover(coverId, signal, valid);
            if (valid()) await runtime.prepareText(song, valid, signal);
            if (!valid()) break;
            await runtime.move(temp, destination);
            renamed = true;
            if (!valid()) break;
            await publish(id, { ...downloading, status: 'done', fileName, bytes, updatedAt: Date.now() });
          } catch (error) {
            if (valid()) {
              failures = true;
              await publish(id, {
                ...downloading,
                status: 'failed',
                fileName: undefined,
                bytes: undefined,
                error: (error instanceof Error ? error.message : 'Download failed').slice(0, 160),
                updatedAt: Date.now(),
              });
            }
          } finally {
            await runtime.remove(temp);
            if (renamed && downloadStore.getState().entries[id]?.status !== 'done') await runtime.remove(destination);
          }
          if (!valid()) break;
          const progress = downloadStore.getState().progress;
          if (progress) {
            const completed = progress.completed + 1;
            downloadStore.setState({ progress: { ...progress, completed } });
            if (background) await runtime.progress(completed, progress.total).catch(() => {});
          }
        }
      }),
    );
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  })()
    .catch(async (error: unknown) => {
      failures = true;
      if (!valid()) return;
      for (const [id, entry] of Object.entries(downloadStore.getState().entries)) {
        if (entry.status !== 'downloading' && entry.status !== 'queued') continue;
        const failed: DownloadEntry = {
          ...entry,
          status: 'failed',
          error: (error instanceof Error ? error.message : 'Download failed').slice(0, 160),
          updatedAt: Date.now(),
        };
        await publish(id, failed).catch(() =>
          downloadStore.setState(({ entries }) => ({ entries: { ...entries, [id]: failed } })),
        );
      }
    })
    .finally(async () => {
      if (!queueing) {
        if (background) await runtime.end(!failures && valid()).catch(() => {});
        setBackground(false);
        downloadStore.setState({ progress: null });
      }
      running = null;
      controller = null;
      if (valid() && !failures && pending() && !queueing) void start();
    });
  return running;
}

/** User taps share the same native task lifecycle, including retries. */
async function queueSongs(candidates: Song[]): Promise<number> {
  if (appStore.getState().offlineMode || !sessionStore.getState().session) return 0;
  const entries = downloadStore.getState().entries;
  const songs = candidates.filter((song) => !entries[song.id] || entries[song.id]?.status === 'failed');
  const total = (downloadStore.getState().progress?.completed ?? 0) + pending() + songs.length;
  if (!total) return 0;
  const version = generation;
  queueing = true;
  try {
    setBackground(await runtime.begin(total, downloadStore.getState().progress?.completed ?? 0).catch(() => false));
    if (appStore.getState().offlineMode || !sessionStore.getState().session) {
      if (background) await runtime.end(false).catch(() => {});
      setBackground(false);
      return 0;
    }
    for (const song of songs) {
      const now = Date.now();
      await publish(song.id, { status: 'queued', createdAt: entries[song.id]?.createdAt ?? now, updatedAt: now });
    }
    const progress = downloadStore.getState().progress;
    if (progress) downloadStore.setState({ progress: { ...progress, total: progress.total + songs.length } });
    if (!pending()) {
      if (background) await runtime.end(true).catch(() => {});
      setBackground(false);
      downloadStore.setState({ progress: null });
      return songs.length;
    }
    if (version === generation) void start();
    return songs.length;
  } finally {
    queueing = false;
    if (!running) {
      if (pending() && version === generation && !appStore.getState().offlineMode) void start();
      else {
        if (background) await runtime.end(!pending()).catch(() => {});
        setBackground(false);
        downloadStore.setState({ progress: null });
      }
    }
  }
}

/** Called by a user tap; persistence and deduplication precede the asynchronous workers. */
export const queueDownloads = (target: DownloadTarget) => operation(() => queueSongs(eligibleSongs(target)));

/** Boot and foreground resumes never request an iOS background task. */
export function resumeDownloads() {
  return operations.catch(() => {}).then(start);
}

/** Wait until the current queue drains; useful for callers and injected tests. */
export async function waitForDownloads() {
  await operations.catch(() => {});
  await running;
}

/** Expiry and cancellation keep unfinished songs queued for the next foreground resume. */
async function stop() {
  generation++;
  controller?.abort();
  await running;
  if (background) await runtime.end(false).catch(() => {});
  setBackground(false);
  for (const [id, entry] of Object.entries(downloadStore.getState().entries)) {
    if (entry.status === 'downloading') {
      if (entry.fileName) await runtime.remove(`${downloadStore.getState().root}/audio/${entry.fileName}`);
      await publish(id, { ...entry, status: 'queued', fileName: undefined, bytes: undefined, updatedAt: Date.now() });
    }
  }
  downloadStore.setState({ progress: null });
}
export function cancelDownloads() {
  generation++;
  controller?.abort();
  return operation(stop);
}

/** Recover interrupted rows, validate completed audio and inventory pinned artwork at boot. */
export function loadDownloadState() {
  return operation(async () => {
    await prepare();
    downloadStore.setState({ entries: await runtime.load() });
    for (const [id, entry] of Object.entries(downloadStore.getState().entries)) {
      if (
        entry.status === 'downloading' ||
        (entry.status === 'done' &&
          (!entry.fileName || !(await runtime.exists(`${downloadStore.getState().root}/audio/${entry.fileName}`))))
      ) {
        if (entry.fileName) await runtime.remove(`${downloadStore.getState().root}/audio/${entry.fileName}`);
        await publish(id, { ...entry, status: 'queued', fileName: undefined, bytes: undefined, updatedAt: Date.now() });
      }
    }
    if (!observing) {
      await runtime.observe();
      observing = true;
    }
    void start();
  });
}

/** Remove only artwork no remaining download uses, including queued songs. */
async function pruneArt() {
  const { entries, root, art } = downloadStore.getState(),
    { bySong, byAlbum } = libraryStore.getState();
  const used = new Set(
    Object.keys(entries).flatMap((id) => {
      const song = bySong[id];
      return song ? [song.coverArt, byAlbum[song.albumId]?.coverArt] : [];
    }),
  );
  for (const [id, entry] of Object.entries(art))
    if (!used.has(id)) {
      await runtime.remove(`${root}/art/${entry.fileName}`);
      downloadStore.setState(({ art }) => {
        const next = { ...art };
        delete next[id];
        return { art: next };
      });
    }
}
async function removeIds(ids: string[]) {
  if (!ids.some((id) => downloadStore.getState().entries[id])) {
    await pruneArt();
    return;
  }
  await stop();
  for (const id of ids) {
    const entry = downloadStore.getState().entries[id];
    if (entry?.fileName) await runtime.remove(`${downloadStore.getState().root}/audio/${entry.fileName}`);
    await runtime.delete(id);
    downloadStore.setState(({ entries }) => {
      const next = { ...entries };
      delete next[id];
      return { entries: next };
    });
  }
  await pruneArt();
  void start();
}
export const removeDownloads = (target: DownloadTarget) =>
  target.kind === 'library'
    ? deleteAllDownloads()
    : operation(() => removeIds(targetSongs(target).map((song) => song.id)));
export const pruneDownloads = () =>
  operation(() =>
    removeIds(Object.keys(downloadStore.getState().entries).filter((id) => !libraryStore.getState().bySong[id])),
  );
export const deleteAllDownloads = () =>
  operation(async () => {
    await stop();
    await runtime.clearFiles();
    await runtime.clear();
    downloadStore.setState({ entries: {}, art: {}, root: null, progress: null });
  });
export const retryFailedDownloads = () =>
  operation(async () => {
    await queueSongs(
      libraryStore
        .getState()
        .songs.filter(
          (song) => downloadStore.getState().entries[song.id]?.status === 'failed' && hasJapaneseLyrics(song.id),
        ),
    );
  });

sessionStore.subscribe((state, previous) => {
  if (state.session && state.session !== previous.session) void resumeDownloads();
});
appStore.subscribe((state, previous) => {
  if (state.offlineMode === previous.offlineMode) return;
  if (state.offlineMode) void cancelDownloads();
  else void resumeDownloads();
});
