import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import type { DownloadMedia } from './validation';
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
import { assetName, audioExtension } from './names';
import type { DownloadArt } from './store';
import { downloadStore, type DownloadEntries, type DownloadEntry, type DownloadTarget } from './store';
import { eligibleSongs, targetSongs } from './targets';

/** Files and the iOS task are native; `downloads/native.ts` provides them at boot. */
const unconfigured = async (): Promise<never> => {
  throw new Error('Downloads are not available');
};

const defaults = {
  prepare: unconfigured as () => Promise<{ root: string; art: DownloadArt }>,
  download: unconfigured as (
    url: string,
    uri: string,
    signal: AbortSignal,
    kind: DownloadMedia,
    onProgress?: (fraction: number) => void,
  ) => Promise<number>,
  move: unconfigured as (from: string, to: string) => Promise<void>,
  remove: unconfigured as (uri: string) => Promise<void>,
  exists: unconfigured as (uri: string) => Promise<boolean>,
  clearFiles: unconfigured as () => Promise<void>,
  load: unconfigured as () => Promise<DownloadEntries>,
  save: unconfigured as (id: string, entry: DownloadEntry) => Promise<void>,
  saveMany: unconfigured as (entries: DownloadEntries) => Promise<void>,
  saveAnalysis: unconfigured as (analysis: SongAnalysis) => Promise<void>,
  delete: unconfigured as (id: string) => Promise<void>,
  clear: unconfigured as () => Promise<void>,
  prepareText: async (song: Song, valid: () => boolean, signal: AbortSignal) => {
    const session = analysisSession(),
      lyrics = libraryStore.getState().lyrics[song.id];
    if (valid() && session.base && lyrics && !libraryStore.getState().analyses[lyrics.fingerprint]) {
      const result = await fetchAnalysis(session.base, lyrics.fingerprint, session.fetch, signal);
      // Another request may have accepted a newer analysis while this GET was in flight.
      const missing = () => !libraryStore.getState().analyses[lyrics.fingerprint];
      if (result.status === 200 && valid() && session.valid() && missing()) {
        if (result.analysis.lines.length !== lyrics.timeline.length)
          throw new Error('Song analysis length does not match');
        await runtime.saveAnalysis(result.analysis);
        if (valid() && session.valid() && missing()) libraryStore.getState().setAnalysis(result.analysis);
      }
    }
    if (!valid()) return;
    prioritizeTranslations([song.id]);
    await ensureSongTranslation(song.id, signal);
    if (!valid()) return;
    await cacheSongBreakdowns(song.id, valid, signal);
  },
  begin: async (_total: number, _completed?: number) => false,
  progress: async (_completed: number, _total: number) => {},
  end: async (_success: boolean) => {},
  observe: async (_onExpired: () => void, _onActive: (active: boolean) => void) => true,
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
      const bytes = await runtime.download(mediaUrl(session, 'getCoverArt', id, 600), temp, signal, 'image');
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
  const stages = new Map<string, number>();
  /** Native progress includes byte and cache stages; the UI still counts finished songs. */
  const report = (id: string, fraction: number) => {
    const stage = Math.floor(fraction * 100) / 100;
    if (stage <= (stages.get(id) ?? 0)) return;
    stages.set(id, stage);
    const progress = downloadStore.getState().progress;
    if (valid() && background && progress)
      void runtime
        .progress(progress.completed + [...stages.values()].reduce((sum, value) => sum + value, 0), progress.total)
        .catch(() => {});
  };
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
            const bytes = await runtime.download(mediaUrl(session!, 'stream', id), temp, signal, 'audio', (fraction) =>
              report(id, Math.max(0, Math.min(fraction, 1)) * 0.7),
            );
            if (!valid()) break;
            report(id, 0.7);
            const coverIds = new Set([libraryStore.getState().byAlbum[song.albumId]?.coverArt, song.coverArt]);
            for (const coverId of coverIds) if (coverId && valid()) await cover(coverId, signal, valid);
            report(id, 0.8);
            if (valid()) await runtime.prepareText(song, valid, signal);
            if (!valid()) break;
            report(id, 0.9);
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
          stages.delete(id);
          const progress = downloadStore.getState().progress;
          if (progress) {
            const completed = progress.completed + 1;
            downloadStore.setState({ progress: { ...progress, completed } });
            if (background)
              await runtime
                .progress(completed + [...stages.values()].reduce((sum, value) => sum + value, 0), progress.total)
                .catch(() => {});
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
    const granted = await runtime.begin(total, downloadStore.getState().progress?.completed ?? 0).catch(() => false);
    setBackground(background || granted);
    if (appStore.getState().offlineMode || !sessionStore.getState().session) {
      if (background) await runtime.end(false).catch(() => {});
      setBackground(false);
      return 0;
    }
    if (songs.length) {
      const now = Date.now();
      const queued: DownloadEntries = Object.fromEntries(
        songs.map((song) => [
          song.id,
          { status: 'queued', createdAt: entries[song.id]?.createdAt ?? now, updatedAt: now },
        ]),
      );
      await runtime.saveMany(queued);
      downloadStore.setState(({ entries }) => ({ entries: { ...entries, ...queued } }));
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
      foreground = await runtime.observe(
        () => {
          setBackground(false);
          void cancelDownloads();
        },
        (active) => {
          foreground = active;
          if (active) void resumeDownloads();
          else if (!background) void cancelDownloads();
        },
      );
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
