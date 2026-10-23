import { localArtUri, localAudioUri } from '../downloads/store';
import { libraryDb } from '../navidrome/libraryDb';
import { sessionStore } from '../navidrome/session';
import { mediaUrl, request } from '../navidrome/subsonic';
import { appStore } from '../store/appStore';
import { libraryStore } from '../store/libraryStore';
import { settingsStore } from '../store/settingsStore';
import type { Song } from '../types/domain';

/*
 * Platform-neutral playback rules shared by every transport (expo-audio on iOS, `<audio>` on the web): where a
 * song plays from, when it counts as played, what Navidrome is told, and what going offline does to a loaded song.
 * A transport owns the player and its status events and calls these at the matching moments.
 */

export type PlaybackSource = { uri: string; artworkUrl?: string };

/**
 * Why a song cannot start, or undefined when it can. `release` means the transport should drop its current song
 * (offline mode with nothing downloaded), not only report the error.
 */
export function playbackBlock(song: Song): { error: string; release: boolean } | undefined {
  const local = localAudioUri(song.id);
  if (settingsStore.getState().offlineMode && !local) return { error: 'Song is not downloaded', release: true };
  if (!local && !sessionStore.getState().session) return { error: 'No account is connected', release: false };
}

/** The audio and cover for a song that `playbackBlock` allows: downloaded files first, otherwise the stream. */
export function playbackSource(song: Song): PlaybackSource {
  const session = sessionStore.getState().session;
  const online = session && !settingsStore.getState().offlineMode ? session : undefined;
  return {
    uri: localAudioUri(song.id) ?? mediaUrl(session!, 'stream', song.id),
    artworkUrl: song.coverArt
      ? (localArtUri(song.coverArt) ?? (online ? mediaUrl(online, 'getCoverArt', song.coverArt, 600) : undefined))
      : undefined,
  };
}

/** Tell Navidrome a song started (a "now playing" scrobble). Clip playback and offline mode stay silent. */
export function announceNowPlaying(song: Song) {
  const session = sessionStore.getState().session;
  if (session && !settingsStore.getState().offlineMode && !appStore.getState().clipPlayback)
    void request(session, 'scrobble', { id: song.id, submission: false }).catch(() =>
      appStore.setState({ playbackError: 'Could not announce this song to the server' }),
    );
}

/** A song counts as played at half its length, or after 240 s for long ones. */
export const reachedPlayed = (positionMs: number, durationMs: number) =>
  durationMs > 0 && positionMs >= Math.min(durationMs / 2, 240000);

/** Record a played song: Recently played locally, then a submission scrobble unless offline. */
export function recordPlayed(song: Song) {
  const session = sessionStore.getState().session,
    at = Date.now();
  libraryStore.getState().markPlayed(song.id, at);
  void (async () => libraryDb().savePlayed(song.id, at))().catch(() =>
    appStore.setState({ playbackError: 'Could not save Recently played' }),
  );
  if (session && !settingsStore.getState().offlineMode)
    void request(session, 'scrobble', { id: song.id, submission: true, time: at }).catch(() =>
      appStore.setState({ playbackError: 'Could not scrobble this song' }),
    );
}

/**
 * What a loaded song needs once offline mode turns on: `keep` (already playing from its download), `reload` from the
 * download, or `release` because only a stream is loaded and nothing is downloaded.
 */
export function offlineSwitch(song: Song, sourceUri: string | null): 'keep' | 'reload' | 'release' {
  const local = localAudioUri(song.id);
  if (local && local === sourceUri) return 'keep';
  return local ? 'reload' : 'release';
}
