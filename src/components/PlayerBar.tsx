import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSong } from '@/data/fakeData';
import { appStore } from '@/store/appStore';
import { colors } from '@/constants/theme';
import { Cover } from './Cover';
import { IconButton, Label, styles } from './ui';

/** Fake transport controls. The line lane is the only progress indicator. */
export function PlayerBar() {
  const insets = useSafeAreaInsets();
  const song = getSong(appStore(state => state.songId));
  const playing = appStore(state => state.playing);
  const lineIndex = appStore(state => state.lineIndex);
  const seconds = !song.lines.length ? 0 : lineIndex === 3 ? 72 : Math.round((lineIndex / song.lines.length) * song.duration);
  const duration = `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}`;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom - 4, 14), backgroundColor: colors.panel }]}>
    <Cover song={song} size={54} />
    <Label style={{ flex: 1, fontSize: 14, fontWeight: '600' }}>{time}<Label muted style={{ fontSize: 14 }}> / {duration}</Label></Label>
    <IconButton name="skipPrevious" size={50} label={song.hasLyrics ? 'Previous line' : 'Previous song'} onPress={() => {
      if (song.hasLyrics) appStore.getState().jumpToLine(lineIndex - 1);
      else appStore.getState().previousSong();
    }} />
    <IconButton name={playing ? 'pause' : 'play'} size={56} border="#6a6c8c" label={playing ? 'Pause' : 'Play'} onPress={() => appStore.getState().setPlaying(!playing)} />
    <IconButton name="skipNext" size={50} label={song.hasLyrics ? 'Next line' : 'Next song'} onPress={() => song.hasLyrics ? appStore.getState().advanceLine() : appStore.getState().nextSong()} />
  </View>;
}
