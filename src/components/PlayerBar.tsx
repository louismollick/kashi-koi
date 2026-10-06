import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { libraryStore } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { colors } from '@/constants/theme';
import { Cover } from './Cover';
import { IconButton, Label, styles } from './ui';

const time = (ms: number) => { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
/** Native audio position and seek controls; absent until a song starts. */
export function PlayerBar({ clipReview = false }: { clipReview?: boolean }) {
  const insets = useSafeAreaInsets();
  const clip = appStore(state => state.clipPlayback), review = appStore(state => state.clipReview);
  const songId = appStore(state => clipReview ? state.clipPlayback?.songId : state.songId);
  const waiting = appStore(state => !!state.answerWait);
  const loading = appStore(state => state.loading);
  const song = libraryStore(state => songId ? state.bySong[songId] : undefined);
  const playing = appStore(state => state.playing && (clipReview || !state.clipPlayback)), index = appStore(state => state.lineIndex);
  const position = appStore(state => state.positionMs), duration = appStore(state => state.durationMs);
  if (!song) return null;
  const synced = song.lyricsStatus === 'synced';
  const ended = clipReview ? !!clip && clip.positionMs >= clip.endMs : waiting;
  const elapsed = clipReview && clip ? Math.max(0, clip.positionMs - clip.startMs) : position;
  const total = clipReview && clip ? clip.endMs - clip.startMs : duration;
  return <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom - 4, 14), backgroundColor: colors.panel }]}>
    <Cover song={song} size={54} />
    <Label style={{ flex: 1, fontSize: 14, fontWeight: '600' }}>{time(elapsed)}<Label muted> / {time(total)}</Label></Label>
    <IconButton name="skipPrevious" size={50} label={clipReview ? 'Previous clip' : synced ? 'Previous line' : 'Previous song'} disabled={clipReview && review?.index === 0} onPress={() => clipReview ? appStore.getState().jumpToClip((review?.index ?? 0) - 1) : synced ? appStore.getState().jumpToLine(index - 1) : appStore.getState().previousSong()} />
    <IconButton name={playing ? 'pause' : ended ? 'refresh' : 'play'} fill={colors.coral} size={56} label={playing ? 'Pause' : ended ? clipReview ? 'Replay clip' : 'Replay line' : 'Play'} disabled={loading} onPress={() => ended && !clipReview ? appStore.getState().replayLine() : appStore.getState().setPlaying(!playing)} />
    <IconButton name="skipNext" size={50} label={clipReview ? 'Next clip' : synced ? 'Next line' : 'Next song'} onPress={() => clipReview ? appStore.getState().nextClip() : synced ? appStore.getState().advanceLine() : appStore.getState().nextSong()} />
  </View>;
}
