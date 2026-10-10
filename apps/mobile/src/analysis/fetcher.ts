import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import type { appStore as AppStore } from '@/store/appStore';
import { getLyrics, getSong, libraryStore } from '@/store/libraryStore';
import { timelineTexts } from '@/lyrics/sentences';
import { fetchAnalysis, requestAnalysis } from './client';
import { resetBreakdowns } from './breakdowns';

const defaults = {
  fetch: ((...args) => globalThis.fetch(...args)) as typeof fetch,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  save: async (analysis: SongAnalysis) => (await import('@/navidrome/db')).saveAnalysis(analysis),
  loadToken: async () => (await import('expo-secure-store')).getItemAsync('analysis-token'),
  saveToken: async (token: string) => {
    const secure = await import('expo-secure-store');
    if (token) await secure.setItemAsync('analysis-token', token);
    else await secure.deleteItemAsync('analysis-token');
  },
};
let runtime = defaults;
let appStore: typeof AppStore;
let generation = 0;
let tokenWrites = Promise.resolve();
let queue: string[] = [];
let running: Promise<void> | null = null;
const attempted = new Set<string>();
const requests = new Map<string, Promise<void>>();

/** Inject the initialized store so the fetcher has no runtime dependency on appStore. */
export function setAnalysisStore(store: typeof AppStore) {
  appStore = store;
}

/** Inject fetch, clock waits and persistence without native imports in Node tests. */
export function setAnalysisRuntime(overrides: Partial<typeof defaults> = {}) {
  runtime = { ...defaults, ...overrides };
}

/** An empty override uses the bundled environment default; empty defaults disable reads. */
export const analysisServerUrl = () =>
  (appStore.getState().analysisServerUrl || process.env.EXPO_PUBLIC_KASHI_SERVER_URL || '').trim().replace(/\/+$/, '');

/** Capture the current transport and login so transient breakdowns use the same cancellation rules. */
export function analysisSession() {
  const version = generation,
    base = analysisServerUrl(),
    token = appStore.getState().analysisToken;
  return { base, token, fetch: runtime.fetch, valid: () => version === generation && base === analysisServerUrl() };
}

/** Load the admin token at boot; it is never included in persisted learning state. */
export async function loadAnalysisToken() {
  const version = generation;
  try {
    const token = await runtime.loadToken();
    if (version === generation) appStore.setState({ analysisToken: token ?? '' });
  } catch {
    if (version === generation) appStore.setState({ analysisToken: '' });
  }
}
/** Serialize SecureStore writes and report whether publication still belongs to this login. */
export async function saveAnalysisToken(token: string) {
  const version = generation,
    save = runtime.saveToken;
  const work = tokenWrites.then(() => save(token));
  tokenWrites = work.catch(() => {});
  await work;
  return version === generation;
}

/** Save before publication so logout can wait for every accepted SQLite write. */
async function accept(analysis: SongAnalysis, valid: () => boolean) {
  if (!valid()) return;
  await runtime.save(analysis);
  if (valid()) libraryStore.getState().setAnalysis(analysis);
}

/** Four workers fetch missing analyses, with newly prioritized songs ahead of the backlog. */
export function prioritizeAnalyses(ids: string[]) {
  queue = [...new Set([...ids, ...queue])];
  if (running) return running;
  const base = analysisServerUrl(),
    version = generation;
  if (!base) {
    queue = [];
    return Promise.resolve();
  }
  const valid = () => version === generation && base === analysisServerUrl();
  const fetcher = runtime.fetch;
  running = Promise.all(
    Array.from({ length: 4 }, async () => {
      while (valid()) {
        const id = queue.shift();
        if (!id) break;
        const lyrics = libraryStore.getState().lyrics[id];
        if (!lyrics?.timeline.length || libraryStore.getState().analyses[lyrics.fingerprint]) continue;
        const key = `${base}\n${lyrics.fingerprint}`;
        if (attempted.has(key)) continue;
        attempted.add(key);
        try {
          const result = await fetchAnalysis(base, lyrics.fingerprint, fetcher);
          if (result.status === 200 && result.analysis.lines.length === lyrics.timeline.length)
            await accept(result.analysis, () => valid() && !libraryStore.getState().analyses[lyrics.fingerprint]);
        } catch {
          /* Missing or unavailable analyses keep Apple's fallback for this launch. */
        }
      }
    }),
  )
    .then(() => {})
    .finally(() => {
      running = null;
      if (queue.length && version === generation) void prioritizeAnalyses([]);
    });
  return running;
}

/** Fetch the whole library after a scan, preserving playback and queue priority. */
export function fetchLibraryAnalyses() {
  const state = appStore.getState();
  return prioritizeAnalyses(
    [state.songId, ...(state.playbackQueue ?? []), ...libraryStore.getState().songs.map((song) => song.id)].filter(
      (id): id is string => !!id,
    ),
  );
}

/** Request an analysis once per song and poll for at most ten minutes. */
export function analyzeSong(songId: string, { force = false }: { force?: boolean } = {}) {
  const existing = requests.get(songId);
  if (existing) return existing;
  const base = analysisServerUrl(),
    token = appStore.getState().analysisToken;
  const song = getSong(songId),
    lyrics = getLyrics(songId),
    version = generation;
  if (!base || !token || !song || !lyrics.timeline.length) return Promise.resolve();
  const hash = lyrics.fingerprint,
    previous = libraryStore.getState().analyses[lyrics.fingerprint],
    service = runtime;
  const valid = () => version === generation && base === analysisServerUrl() && getLyrics(songId).fingerprint === hash;
  const update = (request?: { status: 'requesting' | 'queued' | 'running' | 'failed'; error?: string }) => {
    if (!valid()) return;
    const analysisRequests = { ...appStore.getState().analysisRequests };
    if (request) analysisRequests[songId] = { ...request, force };
    else delete analysisRequests[songId];
    appStore.setState({ analysisRequests });
  };
  update({ status: 'requesting' });
  const work = (async () => {
    try {
      const response = await requestAnalysis(
        base,
        token,
        { title: song.title, artist: song.artist || undefined, lines: timelineTexts(lyrics), force },
        service.fetch,
      );
      if (!valid()) return;
      if (response.status === 200) {
        await accept(response.analysis, valid);
        update();
        return;
      }
      update(response.job);
      if (response.job.status === 'failed') return;
      const deadline = Date.now() + 10 * 60 * 1000;
      for (let poll = 0; poll < 120 && Date.now() < deadline && valid(); poll++) {
        await service.sleep(5000);
        if (!valid()) return;
        const result = await fetchAnalysis(base, hash, service.fetch);
        if (!valid()) return;
        if (result.status === 200) {
          // Some servers keep serving the old result while a forced job is pending.
          if (force && previous && result.analysis.createdAt === previous.createdAt) continue;
          if (result.analysis.lines.length !== lyrics.timeline.length)
            throw new Error('Analysis line count does not match lyrics');
          await accept(result.analysis, valid);
          update();
          return;
        }
        if (result.status === 404) {
          update({ status: 'failed', error: 'Analysis was not found' });
          return;
        }
        update(result.job);
        if (result.job.status === 'failed') return;
      }
      update({ status: 'failed', error: 'Analysis timed out' });
    } catch (error) {
      update({ status: 'failed', error: error instanceof Error ? error.message : 'Analysis request failed' });
    }
  })().finally(() => {
    requests.delete(songId);
    if (!valid() && version === generation) {
      const analysisRequests = { ...appStore.getState().analysisRequests };
      delete analysisRequests[songId];
      appStore.setState({ analysisRequests });
    }
  });
  requests.set(songId, work);
  return work;
}

/** Invalidate reads and polling immediately, then wait for writes before logout clears SQLite. */
export async function cancelAnalyses() {
  generation++;
  resetBreakdowns();
  queue = [];
  await Promise.allSettled([running, ...requests.values(), tokenWrites]);
  appStore.setState({ analysisRequests: {} });
}
