import { ScrollView, View } from 'react-native';
import { colors } from '@/constants/theme';
import { songs } from '@/data/fakeData';
import { getVisibleSongs } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { ScreenHeader } from '@/components/Header';
import { Button, Label, PixelToggle, SectionHeader, styles } from '@/components/ui';

/** Global library visibility and the fake library's Lyrics scan status. */
export default function SettingsScreen() {
  const nothingDue = appStore(state => state.nothingDue);
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const ready = getVisibleSongs(songs, true).length;
  const withoutSyncedLyrics = songs.length - ready;
  return <View style={styles.page}><ScreenHeader title="Settings" />
    <ScrollView contentContainerStyle={styles.content}>
      <SectionHeader title="Library" />
      <View style={styles.row}>
        <Label style={{ flex: 1 }}>Hide songs without synced lyrics</Label>
        <PixelToggle label="Hide songs without synced lyrics" on={hiding} onPress={() => appStore.getState().toggleHideSongsWithoutSyncedLyrics()} />
      </View>
      <Label muted style={{ fontSize: 11.5 }}>Songs you can't follow or quiz stay out of your library and queues.</Label>
      <SectionHeader title="Lyrics scan" />
      <Button label="Scan library" fill={colors.coral} border="#ff9aa5" onPress={() => {
        // Will run the Navidrome lyrics scan.
      }}><Label style={{ fontWeight: '700' }}>Scan library</Label></Button>
      <View style={{ gap: 4 }}>
        <Label>{ready.toLocaleString('en-US')} songs ready to learn</Label>
        <Label muted>{withoutSyncedLyrics.toLocaleString('en-US')} songs without synced lyrics</Label>
        <Label muted>Last scan: never</Label>
      </View>
      {__DEV__ && <Button label="Toggle nothing due" onPress={() => appStore.getState().toggleNothingDue()}><Label>Dev · nothing due {nothingDue ? 'on' : 'off'}</Label></Button>}
    </ScrollView>
  </View>;
}
