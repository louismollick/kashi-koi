import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { appStore, setTransport } from '@/store/appStore';
import { getLyrics, libraryStore } from '@/store/libraryStore';
import { sessionStore } from '@/navidrome/session';
import { mediaUrl, request } from '@/navidrome/subsonic';
import { savePlayed } from '@/navidrome/db';
import type { Song } from '@/types/domain';

/** One native player owns audio; appStore owns queue and learning state. */
export async function setupTransport(valid = () => true) {
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
  if (!valid()) return () => {};
  const player = createAudioPlayer(null, { updateInterval: 200, keepAudioSessionActive: true });
  let song: Song | null = null, submitted = false, finished = false, awaitingStart = false, seeking = false, wantsPlay = false, startMs = 0, revision = 0;
  const fail = (error: unknown) => { wantsPlay = false; appStore.setState({ playbackError: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Could not play this song', playing: false }); };
  /** Pause through seeks; only the latest request may resume playback. */
  const seek = (ms: number) => {
    startMs = ms;
    if (awaitingStart) return;
    const request = ++revision;
    seeking = true;
    player.pause();
    void player.seekTo(ms / 1000, 0, 0).then(() => {
      if (request !== revision) return;
      seeking = false;
      if (wantsPlay) player.play();
    }).catch(error => { if (request === revision) { seeking = false; fail(error); } });
  };
  const subscription = player.addListener('playbackStatusUpdate', status => {
    if (!song) return;
    if (status.error) { fail(status.error); return; }
    if (!status.isLoaded || seeking) return;
    if (awaitingStart) {
      if (status.currentTime >= 1) return;
      awaitingStart = false;
      seek(startMs);
      return;
    }
    const positionMs = status.currentTime * 1000, durationMs = (status.duration || song.duration) * 1000;
    const clip = appStore.getState().clipPlayback;
    appStore.getState().updatePlayback(positionMs, durationMs, status.playing);
    if (clip) return;
    if (!submitted && positionMs >= Math.min(durationMs / 2, 240000) && durationMs > 0) {
      submitted = true;
      const session = sessionStore.getState().session, at = Date.now();
      libraryStore.getState().markPlayed(song.id, at);
      void savePlayed(song.id, at).catch(() => appStore.setState({ playbackError: 'Could not save Recently played' }));
      if (session) void request(session, 'scrobble', { id: song.id, submission: true, time: at }).catch(() => appStore.setState({ playbackError: 'Could not scrobble this song' }));
    }
    if (status.didJustFinish && !finished) {
      finished = true;
      if (appStore.getState().quizToggle && getLyrics(song.id).lines.some(line => line.translation)) appStore.getState().completeRun();
      else appStore.getState().nextSong();
    }
  });
  const detach = setTransport({
    load: (next, offset = 0) => {
      const session = sessionStore.getState().session;
      if (!session) return;
      ++revision; player.pause(); wantsPlay = false; seeking = false; startMs = offset;
      song = next; submitted = false; finished = false; awaitingStart = true;
      try {
        player.replace({ uri: mediaUrl(session, 'stream', next.id) });
        player.setActiveForLockScreen(true, { title: next.title, artist: next.artist, albumTitle: next.album, artworkUrl: next.coverArt ? mediaUrl(session, 'getCoverArt', next.coverArt, 600) : undefined }, { showSeekBackward: false, showSeekForward: false });
        if (!appStore.getState().clipPlayback) void request(session, 'scrobble', { id: next.id, submission: false }).catch(() => appStore.setState({ playbackError: 'Could not announce this song to the server' }));
      } catch (error) { fail(error); }
    },
    play: () => { wantsPlay = true; try { if (!awaitingStart && !seeking) player.play(); } catch (error) { fail(error); } },
    pause: () => { wantsPlay = false; player.pause(); },
    seek,
  });
  return () => { ++revision; wantsPlay = false; song = null; player.pause(); player.clearLockScreenControls(); subscription.remove(); player.remove(); if (detach()) void setIsAudioActiveAsync(false).catch(() => {}); };
}
