import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { libraryStore } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { colors } from '@/constants/theme';
import { Cover } from './Cover';
import { IconButton, Label, styles } from './ui';

const time = (ms: number) => { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
/** Native audio position and seek controls; absent until a song starts. */
export function PlayerBar() {
  const insets = useSafeAreaInsets(), songId = appStore(state => state.songId);
  const song = libraryStore(state => songId ? state.bySong[songId] : undefined);
  const playing = appStore(state => state.playing && !state.clipPlayback), index = appStore(state => state.lineIndex);
  const position = appStore(state => state.positionMs), duration = appStore(state => state.durationMs);
  if (!song) return null;
  const synced = song.lyricsStatus === 'synced';
  return <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom - 4, 14), backgroundColor: colors.panel }]}>
    <Cover song={song} size={54} />
    <Label style={{ flex: 1, fontSize: 14, fontWeight: '600' }}>{time(position)}<Label muted> / {time(duration)}</Label></Label>
    <IconButton name="skipPrevious" size={50} label={synced ? 'Previous line' : 'Previous song'} onPress={() => synced ? appStore.getState().jumpToLine(index - 1) : appStore.getState().previousSong()} />
    <IconButton name={playing ? 'pause' : 'play'} size={56} label={playing ? 'Pause' : 'Play'} onPress={() => appStore.getState().setPlaying(!playing)} />
    <IconButton name="skipNext" size={50} label={synced ? 'Next line' : 'Next song'} onPress={() => synced ? appStore.getState().advanceLine() : appStore.getState().nextSong()} />
  </View>;
}
