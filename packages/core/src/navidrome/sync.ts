import { libraryDb } from './libraryDb';
import { cancelAnalyses, loadAnalysisToken } from '../analysis/fetcher';
import { pauseTranslations, resumeTranslations } from '../japanese/translate';
import { pruneReview } from '../lyrics/review';
import { carryLyrics, libraryStore } from '../store/libraryStore';
import { appStore, dropRemovedSong, fetchLibraryAnalyses, resumePlayback } from '../store/appStore';
import { settingsStore } from '../store/settingsStore';
import { sessionStore } from './session';
import { pickEntry, toSongLyrics } from './lyrics';
import {
  request,
  searchAll,
  type ServerAlbum,
  type ServerArtist,
  type ServerPlaylist,
  type ServerSong,
  type Session,
  type StructuredLyrics,
} from './subsonic';
import type { Library, LyricsResult } from '../store/libraryStore';
import type { LyricsStatus, Playlist, Song, SongLyrics } from '../types/domain';

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

/**
 * Playlists never block the library: servers without them answer with none, a failed list keeps the saved
 * playlists, and a playlist that fails to load keeps its saved songs or, if new or deleted meanwhile, is skipped.
 */
async function fetchPlaylists(session: Session, valid: () => boolean): Promise<Playlist[]> {
  const previous = new Map(libraryStore.getState().playlists.map((playlist) => [playlist.id, playlist]));
  let listed: ServerPlaylist[];
  try {
    listed =
      (await request<{ playlists?: { playlist?: ServerPlaylist[] } }>(session, 'getPlaylists')).playlists?.playlist ??
      [];
  } catch {
    return [...previous.values()];
  }
  const playlists: Playlist[] = [];
  for (const playlist of listed) {
    if (!valid()) break;
    try {
      const detail = await request<{ playlist?: { entry?: { id: string }[] } }>(session, 'getPlaylist', {
        id: playlist.id,
      });
      playlists.push({
        id: playlist.id,
        name: playlist.name,
        coverArt: playlist.coverArt,
        songIds: detail.playlist?.entry?.map((entry) => entry.id) ?? [],
      });
    } catch {
      const saved = previous.get(playlist.id);
      if (saved) playlists.push({ ...saved, name: playlist.name, coverArt: playlist.coverArt });
    }
  }
  return playlists;
}

export function syncLibrary(
  replace: (library: Library) => Promise<void> = async (library) => libraryDb().replaceLibrary(library),
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
    const playlists = await fetchPlaylists(session, valid);
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
        playlists,
      },
      libraryStore.getState(),
    );
    await replace(library);
    if (!valid()) return;
    const { translations, analyses } = libraryStore.getState();
    libraryStore.getState().setLibrary({ ...library, translations, analyses });
    dropRemovedSong();
    await (await import('../downloads/queue')).pruneDownloads();
    if (!valid()) return;
    const ids = new Set(songs.map((song) => song.id));
    appStore.setState((state) => ({ reviewList: pruneReview(state.reviewList, ids) }));
    settingsStore.setState({ lastSyncAt: Date.now() });
    await scan(session, false, valid);
  });
}

/**
 * Four workers fetch lyrics; results are saved to SQLite in one transaction and then published to the store
 * twice a second. An interrupted scan loses at most one flush window, and those songs are rescanned next launch.
 * Errors stay retryable on the next sync.
 */
export async function scan(
  session: Session,
  all: boolean,
  valid: () => boolean,
  save: (results: LyricsResult[]) => Promise<void> = async (results) => libraryDb().saveLyricsResults(results),
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
    pending: LyricsResult[] = [],
    flushing = Promise.resolve();
  // Saved results stay true after going offline or cancelling; only a new session must not receive them.
  const current = () => valid() || sessionStore.getState().session === session;
  // Every lyrics change makes Library, Home and review remapping walk the whole library, so publish twice a second.
  const flush = () => {
    flushing = flushing.then(async () => {
      const state = libraryStore.getState();
      // A failed check never replaces good synced lyrics. This is the only place that rule lives: filtering here
      // keeps SQLite and the store in step.
      const batch = pending.filter(
        ({ songId, status }) =>
          !(status === 'error' && state.bySong[songId]?.lyricsStatus === 'synced' && state.lyrics[songId]),
      );
      pending = [];
      try {
        if (batch.length && !stopped && current()) {
          await save(batch);
          if (current()) libraryStore.getState().setLyricsResults(batch);
        }
      } catch (error) {
        if (!stopped) {
          stopped = true;
          failure = error;
        }
      }
      if (libraryStore.getState().progress?.completed !== completed)
        libraryStore.setState({ progress: { kind: 'scan', completed, total: targets.length } });
    });
    return flushing;
  };
  libraryStore.setState({ progress: { kind: 'scan', completed, total: targets.length } });
  // A timer, so saved results still appear while every worker waits on a slow request.
  const timer = setInterval(() => void flush(), 500);
  await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
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
        pending.push({ songId: song.id, status, lyrics });
        completed++;
      }
    }),
  );
  clearInterval(timer);
  await flush();
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
  libraryStore.getState().setLibrary(await libraryDb().loadAll());
  resumePlayback();
  // Downloads are optional; a failure here must not keep the library or session from loading.
  await (await import('../downloads/queue')).loadDownloadState().catch(() => {
    libraryStore.setState({ error: 'Could not load downloads' });
  });
  await loadAnalysisToken();
  void fetchLibraryAnalyses();
}
