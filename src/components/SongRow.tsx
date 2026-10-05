import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getAlbum } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { Label, styles } from './ui';
import type { Song } from '@/types/domain';

/** Play a song from the Library's cover rows or an album's numbered list. */
export function SongRow({ song, number }: { song: Song; number?: number }) {
  const router = useRouter();
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const duration = `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration) % 60).padStart(2, '0')}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Play ${song.title}${(song.lyricsStatus === 'synced') ? '' : ', no lyrics'}`} onPress={() => {
    appStore.getState().startSong(song.id);
    router.push('/player');
  }} style={({ pressed }) => [styles.row, { minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.track, opacity: pressed ? 0.7 : 1 }]}>
    {number === undefined ? <Cover song={getAlbum(song.albumId) ?? song} size={46} /> : <Label muted style={{ width: 26, textAlign: 'center', fontSize: 14 }}>{number}</Label>}
    <View style={{ flex: 1 }}>
      <View style={[styles.row, { gap: 6 }]}>
        <Label numberOfLines={1} style={{ fontWeight: '700', fontSize: 16, flexShrink: 1 }}>{song.title}</Label>
        {!hiding && !(song.lyricsStatus === 'synced') && <Icon name="micOff" color={colors.muted} size={16} accessibilityLabel="No synced lyrics" />}
      </View>
      {number === undefined && <Label muted numberOfLines={1} style={{ fontSize: 13 }}>{song.artist}</Label>}
    </View>
    <Label muted style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>{duration}</Label>
  </Pressable>;
}
