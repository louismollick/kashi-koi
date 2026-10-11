import { localAudioUri, localArtUri } from '@/downloads/store';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { appStore, setTransport } from '@/store/appStore';
import { hasTranslations, libraryStore } from '@/store/libraryStore';
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
  let song: Song | null = null,
    sourceUri: string | null = null,
    failed = false,
    submitted = false,
    finished = false,
    awaitingStart = false,
    seeking = false,
    wantsPlay = false,
    pausePending = false,
    startMs = 0,
    revision = 0;
  const fail = (error: unknown) => {
    failed = true;
    wantsPlay = false;
    appStore.setState({
      loading: false,
      playbackError:
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Could not play this song',
      playing: false,
    });
  };
  /** Pause through seeks; only the latest request may resume playback. */
  const seek = (ms: number) => {
    startMs = ms;
    if (awaitingStart) return;
    const request = ++revision;
    seeking = true;
    player.pause();
    void player
      .seekTo(ms / 1000, 0, 0)
      .then(() => {
        if (request !== revision) return;
        seeking = false;
        if (wantsPlay) player.play();
      })
      .catch((error) => {
        if (request === revision) {
          seeking = false;
          fail(error);
        }
      });
  };
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!status.playing) pausePending = false;
    if (!song) return;
    if (status.error) {
      fail(status.error);
      return;
    }
    if (!status.isLoaded || seeking) return;
    if (awaitingStart) {
      if (status.currentTime >= 1) return;
      awaitingStart = false;
      appStore.setState({ loading: false });
      seek(startMs);
      return;
    }
    // A queued playing status cannot acknowledge a pause or release an answer wait.
    if (status.playing && !wantsPlay && !pausePending && !seeking && !awaitingStart) {
      wantsPlay = true;
      appStore.getState().setPlaying(true);
      // Releasing the last line completes the run and pauses again.
      if (!wantsPlay) return;
    }
    const positionMs = status.currentTime * 1000,
      durationMs = (status.duration || song.duration) * 1000;
    const clip = appStore.getState().clipPlayback;
    // Native EOF may arrive just short of duration; clips still need their refresh state.
    const clipPositionMs = status.didJustFinish ? durationMs : positionMs;
    // Clip controls follow native pauses, while buffering and queued pause statuses keep the requested state.
    const clipPlaying = wantsPlay && (status.playing || status.isBuffering);
    appStore
      .getState()
      .updatePlayback(clip ? clipPositionMs : positionMs, durationMs, clip ? clipPlaying : status.playing);
    if (clip) return;
    if (!submitted && positionMs >= Math.min(durationMs / 2, 240000) && durationMs > 0) {
      submitted = true;
      const session = sessionStore.getState().session,
        at = Date.now();
      libraryStore.getState().markPlayed(song.id, at);
      void savePlayed(song.id, at).catch(() => appStore.setState({ playbackError: 'Could not save Recently played' }));
      if (session && !appStore.getState().offlineMode)
        void request(session, 'scrobble', { id: song.id, submission: true, time: at }).catch(() =>
          appStore.setState({ playbackError: 'Could not scrobble this song' }),
        );
    }
    if (status.didJustFinish && !finished && !appStore.getState().answerWait) {
      finished = true;
      if (appStore.getState().quizToggle && hasTranslations(song.id)) appStore.getState().completeRun();
      else appStore.getState().nextSong();
    }
  });
  const transportLoad = (next: Song, offset = 0) => {
    const session = sessionStore.getState().session;
    const local = localAudioUri(next.id);
    if (appStore.getState().offlineMode && !local) {
      song = null;
      awaitingStart = false;
      player.pause();
      fail('Song is not downloaded');
      return;
    }
    if (!local && !session) {
      fail('No account is connected');
      return;
    }
    ++revision;
    player.pause();
    wantsPlay = false;
    pausePending = false;
    seeking = false;
    startMs = offset;
    song = next;
    failed = false;
    submitted = false;
    finished = false;
    awaitingStart = true;
    try {
      sourceUri = local ?? mediaUrl(session!, 'stream', next.id);
      player.replace({ uri: sourceUri });
      player.setActiveForLockScreen(
        true,
        {
          title: next.title,
          artist: next.artist,
          albumTitle: next.album,
          artworkUrl: next.coverArt
            ? (localArtUri(next.coverArt) ??
              (session && !appStore.getState().offlineMode
                ? mediaUrl(session, 'getCoverArt', next.coverArt, 600)
                : undefined))
            : undefined,
        },
        { showSeekBackward: false, showSeekForward: false },
      );
      if (session && !appStore.getState().offlineMode && !appStore.getState().clipPlayback)
        void request(session, 'scrobble', { id: next.id, submission: false }).catch(() =>
          appStore.setState({ playbackError: 'Could not announce this song to the server' }),
        );
    } catch (error) {
      fail(error);
    }
  };
  const detach = setTransport({
    load: transportLoad,
    play: () => {
      if (!song || failed) return;
      wantsPlay = true;
      pausePending = false;
      try {
        if (!awaitingStart && !seeking) player.play();
      } catch (error) {
        fail(error);
      }
    },
    pause: () => {
      wantsPlay = false;
      pausePending = true;
      player.pause();
    },
    seek,
  });
  // Switching offline must release a streaming AVPlayer item, including its buffered network work.
  const unsubscribeOffline = appStore.subscribe((state, previous) => {
    if (!state.offlineMode || previous.offlineMode || !song) return;
    const local = localAudioUri(song.id);
    if (local && local === sourceUri) return;
    if (local) {
      const current = song,
        playing = state.playing;
      appStore.setState({ loading: true, playbackError: null });
      // Reload at the current clip or song position without announcing anything to Navidrome.
      transportLoad(current, state.clipPlayback?.positionMs ?? state.positionMs);
      wantsPlay = playing;
    } else {
      ++revision;
      song = null;
      awaitingStart = false;
      player.pause();
      player.replace(null);
      player.clearLockScreenControls();
      fail('Song is not downloaded');
    }
  });
  return () => {
    unsubscribeOffline();
    ++revision;
    wantsPlay = false;
    song = null;
    player.pause();
    player.clearLockScreenControls();
    subscription.remove();
    player.remove();
    if (detach()) void setIsAudioActiveAsync(false).catch(() => {});
  };
}
