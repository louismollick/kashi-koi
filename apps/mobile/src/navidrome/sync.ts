import { cancelAnalyses, loadAnalysisToken } from '@/analysis/fetcher';
import { pauseTranslations, resumeTranslations } from '@/japanese/translate';
import { carryLyrics, libraryStore } from '@/store/libraryStore';
import { appStore, fetchLibraryAnalyses } from '@/store/appStore';
import { settingsStore } from '@/store/settingsStore';
import { sessionStore } from './session';
import { pickEntry, toSongLyrics } from './lyrics';
import {
  request,
  searchAll,
  type ServerAlbum,
  type ServerArtist,
  type ServerSong,
  type Session,
  type StructuredLyrics,
} from './subsonic';
import type { Library, LyricsResult } from '@/store/libraryStore';
import type { LyricsStatus, Song, SongLyrics } from '@/types/domain';

let running: Promise<void> | null = null;
let generation = 0;
export async function cancelSync() {
  generation++;
  await running;
}

let offlineTransition = Promise.resolve();

/**
 * Switch offline mode and run its network side effects. Turning it on cancels sync, analyses and translation;
 * turning it off resumes them. Transitions run one after another, each acting on the setting's latest value.
 */
export function setOfflineMode(offlineMode: boolean) {
  settingsStore.setState({ offlineMode });
  offlineTransition = offlineTransition
    .catch(() => {})
    .then(async () => {
      if (settingsStore.getState().offlineMode) {
        await Promise.all([cancelSync(), cancelAnalyses(), pauseTranslations()]);
      } else {
        void resumeTranslations();
        void fetchLibraryAnalyses();
      }
    });
}

/** Serialize library sync and lyrics scans, and keep failures visible in Settings. */
function run(work: (session: Session, valid: () => boolean) => Promise<void>) {
  const session = sessionStore.getState().session,
    version = generation;
  if (!session || settingsStore.getState().offlineMode) return Promise.resolve();
  if (running) return running;
  libraryStore.setState({ error: null });
  running = work(
    session,
    () =>
      version === generation && sessionStore.getState().session === session && !settingsStore.getState().offlineMode,
  )
    .catch((error) => {
      libraryStore.setState({ error: error instanceof Error ? error.message : 'Library sync failed' });
    })
    .finally(() => {
      running = null;
      libraryStore.setState({ progress: null });
    });
  return running;
}

export function syncLibrary(
  replace: (library: Library) => Promise<void> = async (library) => (await import('./db')).replaceLibrary(library),
) {
  return run(async (session, valid) => {
    libraryStore.setState({ progress: { kind: 'sync', completed: 0, total: libraryStore.getState().songs.length } });
    const entries = await searchAll<ServerSong>(session, 'song', valid);
    if (!valid()) return;
    libraryStore.setState({ progress: { kind: 'sync', completed: entries.length, total: entries.length } });
    const albums = await searchAll<ServerAlbum>(session, 'album', valid);
    if (!valid()) return;
    const response = await request<{ artists?: { index?: { artist?: ServerArtist[] }[] } }>(session, 'getArtists');
    if (!response.artists) throw new Error('Invalid artists response');
    if (!valid()) return;
    const songs: Song[] = entries.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist ?? '',
      artistId: song.artistId ?? '',
      album: song.album ?? '',
      albumId: song.albumId ?? '',
      track: song.track,
      disc: song.discNumber,
      year: song.year,
      duration: song.duration ?? 0,
      coverArt: song.coverArt,
      suffix: song.suffix,
      played: song.played ? Date.parse(song.played) || undefined : undefined,
      lyricsStatus: 'unchecked',
    }));
    const library = carryLyrics(
      {
        songs,
        albums: albums.map((album) => ({
          id: album.id,
          title: album.name,
          artist: album.artist ?? '',
          artistId: album.artistId ?? '',
          year: album.year,
          coverArt: album.coverArt,
          songCount: album.songCount,
        })),
        artists: response.artists.index?.flatMap((index) => index.artist ?? []) ?? [],
      },
      libraryStore.getState(),
    );
    await replace(library);
    if (!valid()) return;
    const { translations, analyses } = libraryStore.getState();
    libraryStore.getState().setLibrary({ ...library, translations, analyses });
    await (await import('@/downloads/queue')).pruneDownloads();
    if (!valid()) return;
    const ids = new Set(songs.map((song) => song.id));
    appStore.setState((state) => ({ reviewList: state.reviewList.filter((item) => ids.has(item.songId)) }));
    settingsStore.setState({ lastSyncAt: Date.now() });
    await scan(session, false, valid);
  });
}

/** Four workers persist each result and publish them in batches; errors stay retryable on the next sync. */
export async function scan(
  session: Session,
  all: boolean,
  valid: () => boolean,
  save: (songId: string, status: LyricsStatus, lyrics?: SongLyrics) => Promise<void> = async (...args) =>
    (await import('./db')).saveLyricsResult(...args),
) {
  if (settingsStore.getState().offlineMode) return;
  const online = () => valid() && !settingsStore.getState().offlineMode;
  const targets = libraryStore
    .getState()
    .songs.filter((song) => all || ['unchecked', 'error'].includes(song.lyricsStatus))
    // Recently played first, so Home settles before the long tail.
    .sort((a, b) => (b.played ?? 0) - (a.played ?? 0));
  let cursor = 0,
    completed = 0,
    errors = 0,
    stopped = false;
  let failure: unknown,
    pending: LyricsResult[] = [];
  // Every lyrics change makes Library, Home and review remapping walk the whole library, so publish twice a second.
  // Saved results stay true after going offline or cancelling; only a new session must not receive them.
  const flush = () => {
    if (pending.length && (valid() || sessionStore.getState().session === session))
      libraryStore.getState().setLyricsResults(pending);
    pending = [];
    if (libraryStore.getState().progress?.completed !== completed)
      libraryStore.setState({ progress: { kind: 'scan', completed, total: targets.length } });
  };
  libraryStore.setState({ progress: { kind: 'scan', completed, total: targets.length } });
  // A timer, so saved results still appear while every worker waits on a slow request.
  const timer = setInterval(flush, 500);
  await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      try {
        while (online() && !stopped) {
          const song = targets[cursor++];
          if (!song) break;
          let status: LyricsStatus, lyrics: SongLyrics | undefined;
          try {
            const response = await request<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>(
              session,
              'getLyricsBySongId',
              { id: song.id },
            );
            if (!response.lyricsList) throw new Error('Invalid lyrics response');
            const entry = pickEntry(response.lyricsList.structuredLyrics ?? []);
            lyrics = entry ? toSongLyrics(song.id, entry, song.duration * 1000) : undefined;
            status = lyrics?.timeline.length ? 'synced' : 'none';
          } catch {
            status = 'error';
            errors++;
          }
          if (!online() || stopped) break;
          if (!(status === 'error' && song.lyricsStatus === 'synced' && libraryStore.getState().lyrics[song.id])) {
            await save(song.id, status, lyrics);
            pending.push({ songId: song.id, status, lyrics });
            if (!online() || stopped) break;
          }
          completed++;
        }
      } catch (error) {
        if (!stopped) {
          stopped = true;
          failure = error;
        }
      }
    }),
  );
  clearInterval(timer);
  flush();
  if (stopped) throw failure;
  if (online()) {
    settingsStore.setState({ lastScanAt: Date.now() });
    void resumeTranslations();
    void fetchLibraryAnalyses();
    if (errors) libraryStore.setState({ error: `${errors} songs could not be checked. Rescan lyrics to retry.` });
  }
}

export const scanLyrics = ({ all = false }: { all?: boolean } = {}) =>
  run((session, valid) => scan(session, all, valid));
export async function loadLibrary() {
  const { loadAll } = await import('./db');
  libraryStore.getState().setLibrary(await loadAll());
  // Downloads are optional; a failure here must not keep the library or session from loading.
  await (await import('@/downloads/queue')).loadDownloadState().catch(() => {
    libraryStore.setState({ error: 'Could not load downloads' });
  });
  await loadAnalysisToken();
  void fetchLibraryAnalyses();
}
