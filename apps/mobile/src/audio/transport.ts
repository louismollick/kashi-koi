import {
  announceNowPlaying,
  offlineSwitch,
  playbackBlock,
  playbackSource,
  reachedPlayed,
  recordPlayed,
} from '@kashi-koi/core/audio/playback';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { appStore, finishSong, setTransport } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import type { Song } from '@kashi-koi/core/types/domain';

/**
 * One native player owns audio; appStore owns queue and learning state. Which source plays, when a song counts as
 * played and what Navidrome hears live in `@kashi-koi/core/audio/playback`, shared with the web transport.
 */
export async function setupTransport(valid = () => true) {
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
  if (!valid()) return () => {};
  const player = createAudioPlayer(null, { updateInterval: 200, keepAudioSessionActive: true });
  // Each new item needs the pitch-keeping algorithm again, so loads reapply the rate too.
  const applyRate = () => player.setPlaybackRate(settingsStore.getState().playbackRate, 'high');
  applyRate();
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
  /** Pause through seeks; only the latest request may resume playback. Without a song, the next play loads at the store's position. */
  const seek = (ms: number) => {
    startMs = ms;
    if (awaitingStart || !song) return;
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
    const currentRevision = revision;
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
      // Releasing the last sentence can load another song; its first status owns playback.
      if (!wantsPlay || revision !== currentRevision || awaitingStart) return;
    }
    const positionMs = status.currentTime * 1000,
      durationMs = (status.duration || song.duration) * 1000;
    const clip = appStore.getState().clipPlayback;
    // Native EOF may arrive just short of duration; score the final sentence at its end.
    const playbackPositionMs = status.didJustFinish ? durationMs : positionMs;
    // Clip controls follow native pauses, while buffering and queued pause statuses keep the requested state.
    const clipPlaying = wantsPlay && (status.playing || status.isBuffering);
    appStore.getState().updatePlayback(playbackPositionMs, durationMs, clip ? clipPlaying : status.playing);
    if (clip) return;
    if (!submitted && reachedPlayed(positionMs, durationMs)) {
      submitted = true;
      recordPlayed(song);
    }
    if (status.didJustFinish && !finished && !appStore.getState().answerWait) {
      finished = true;
      finishSong();
    }
  });
  const transportLoad = (next: Song, offset = 0) => {
    const blocked = playbackBlock(next);
    if (blocked) {
      if (blocked.release) {
        song = null;
        awaitingStart = false;
        player.pause();
      }
      fail(blocked.error);
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
      const source = playbackSource(next);
      sourceUri = source.uri;
      player.replace({ uri: sourceUri });
      applyRate();
      player.setActiveForLockScreen(
        true,
        {
          title: next.title,
          artist: next.artist,
          albumTitle: next.album,
          artworkUrl: source.artworkUrl,
        },
        { showSeekBackward: false, showSeekForward: false },
      );
      announceNowPlaying(next);
    } catch (error) {
      fail(error);
    }
  };
  const detach = setTransport({
    load: transportLoad,
    play: () => {
      // Leaving offline mode released an undownloaded song; reload it where it stopped.
      if (!song) {
        const { songId, positionMs, clipPlayback } = appStore.getState(),
          id = clipPlayback?.songId ?? songId,
          current = id ? libraryStore.getState().bySong[id] : undefined;
        if (!current) return;
        appStore.setState({ loading: true, playbackError: null });
        transportLoad(current, clipPlayback?.positionMs ?? positionMs);
      }
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
  // Speed changes apply at once. Switching offline must release a streaming AVPlayer item, including its buffered network work.
  const unsubscribeSettings = settingsStore.subscribe((settings, previous) => {
    if (settings.playbackRate !== previous.playbackRate) applyRate();
    if (!settings.offlineMode || previous.offlineMode || !song) return;
    const state = appStore.getState();
    const action = offlineSwitch(song, sourceUri);
    if (action === 'keep') return;
    if (action === 'reload') {
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
    unsubscribeSettings();
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
