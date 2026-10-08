import { fetchLibraryAnalyses, loadAnalysisToken } from '@/analysis/fetcher';
import { resumeTranslations } from '@/japanese/translate';
import { carryLyrics, libraryStore } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
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
import type { LyricsStatus, Song, SongLyrics } from '@/types/domain';

let running: Promise<void> | null = null;
let generation = 0;
export async function cancelSync() {
  generation++;
  await running;
}

/** Serialize library sync and lyrics scans, and keep failures visible in Settings. */
function run(work: (session: Session, valid: () => boolean) => Promise<void>) {
  const session = sessionStore.getState().session,
    version = generation;
  if (!session) return Promise.resolve();
  if (running) return running;
  libraryStore.setState({ error: null });
  running = work(session, () => version === generation && sessionStore.getState().session === session)
    .catch((error) => {
      libraryStore.setState({ error: error instanceof Error ? error.message : 'Library sync failed' });
    })
    .finally(() => {
      running = null;
      libraryStore.setState({ progress: null });
    });
  return running;
}

export function syncLibrary() {
  return run(async (session, valid) => {
    libraryStore.setState({ progress: { kind: 'sync', completed: 0, total: libraryStore.getState().songs.length } });
    const entries = await searchAll<ServerSong>(session, 'song');
    if (!valid()) return;
    libraryStore.setState({ progress: { kind: 'sync', completed: entries.length, total: entries.length } });
    const albums = await searchAll<ServerAlbum>(session, 'album');
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
    const { replaceLibrary } = await import('./db');
    await replaceLibrary(library);
    if (!valid()) return;
    libraryStore.getState().setLibrary({ ...library, translations: libraryStore.getState().translations });
    const ids = new Set(songs.map((song) => song.id));
    appStore.setState((state) => ({
      reviewList: state.reviewList.filter((item) => ids.has(item.songId)),
      lastSyncAt: Date.now(),
    }));
    await scan(session, false, valid);
  });
}

/** Four workers persist each result; errors stay retryable on the next sync. */
export async function scan(
  session: Session,
  all: boolean,
  valid: () => boolean,
  save: (songId: string, status: LyricsStatus, lyrics?: SongLyrics) => Promise<void> = async (...args) =>
    (await import('./db')).saveLyricsResult(...args),
) {
  const targets = libraryStore
    .getState()
    .songs.filter((song) => all || ['unchecked', 'error'].includes(song.lyricsStatus));
  let cursor = 0,
    completed = 0,
    lastUpdate = 0,
    errors = 0,
    stopped = false;
  let failure: unknown;
  libraryStore.setState({ progress: { kind: 'scan', completed, total: targets.length } });
  await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      try {
        while (valid() && !stopped) {
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
          if (!valid() || stopped) break;
          if (!(status === 'error' && song.lyricsStatus === 'synced' && libraryStore.getState().lyrics[song.id])) {
            await save(song.id, status, lyrics);
            if (!valid() || stopped) break;
            libraryStore.getState().setLyricsResult(song.id, status, lyrics);
          }
          completed++;
          if (Date.now() - lastUpdate >= 250 || completed === targets.length) {
            lastUpdate = Date.now();
            libraryStore.setState({ progress: { kind: 'scan', completed, total: targets.length } });
          }
        }
      } catch (error) {
        if (!stopped) {
          stopped = true;
          failure = error;
        }
      }
    }),
  );
  if (stopped) throw failure;
  if (valid()) {
    appStore.setState({ lastScanAt: Date.now() });
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
  await loadAnalysisToken();
  void fetchLibraryAnalyses();
}
