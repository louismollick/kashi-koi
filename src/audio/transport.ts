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
  let song: Song | null = null, submitted = false, finished = false, awaitingStart = false;
  const fail = (error: unknown) => appStore.setState({ playbackError: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Could not play this song', playing: false });
  const subscription = player.addListener('playbackStatusUpdate', status => {
    if (!song) return;
    if (status.error) { fail(status.error); return; }
    if (!status.isLoaded || awaitingStart && status.currentTime >= 1) return;
    awaitingStart = false;
    const positionMs = status.currentTime * 1000, durationMs = (status.duration || song.duration) * 1000;
    appStore.getState().updatePlayback(positionMs, durationMs, status.playing);
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
    load: next => {
      const session = sessionStore.getState().session;
      if (!session) return;
      song = next; submitted = false; finished = false; awaitingStart = true;
      try {
        player.replace({ uri: mediaUrl(session, 'stream', next.id) });
        player.setActiveForLockScreen(true, { title: next.title, artist: next.artist, albumTitle: next.album, artworkUrl: next.coverArt ? mediaUrl(session, 'getCoverArt', next.coverArt, 600) : undefined }, { showSeekBackward: false, showSeekForward: false });
        void request(session, 'scrobble', { id: next.id, submission: false }).catch(() => appStore.setState({ playbackError: 'Could not announce this song to the server' }));
      } catch (error) { fail(error); }
    },
    play: () => { try { player.play(); } catch (error) { fail(error); } },
    pause: () => player.pause(),
    seek: ms => { void player.seekTo(ms / 1000).catch(fail); },
  });
  return () => { song = null; player.pause(); player.clearLockScreenControls(); subscription.remove(); player.remove(); if (detach()) void setIsAudioActiveAsync(false).catch(() => {}); };
}
