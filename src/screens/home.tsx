import { isDue, libraryStore } from '@/store/libraryStore';
import { useNow } from '@/hooks/useNow';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getRecentlyPlayed } from '@/data/libraryVisibility';
import { appStore, useLibraryFilters } from '@/store/appStore';
import { Header } from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { PixelFrame } from '@/components/PixelFrame';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Label, SectionHeader, Tag, styles } from '@/components/ui';

/** Harbor hero scrolls away; its review card overlaps the dock's bottom edge. */
export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  libraryStore(state => state.songs);
  libraryStore(state => state.lyrics);
  const ranks = appStore(state => state.ranks);
  const filters = useLibraryFilters();
  const reviewList = appStore(state => state.reviewList);
  const now = useNow();
  const count = reviewList.filter(line => isDue(line, now)).length;
  const coverSize = (width - 56) / 3;
  return <View style={styles.page}>
    <Header />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={{ height: 250 }}>
        <Image source={require('../../assets/background.png')} contentFit="cover" style={{ width: '100%', height: '100%' }} />
        <View style={{ position: 'absolute', bottom: 8, left: 26 }}><Mascot size={240} /></View>
      </View>
      <View style={{ marginTop: -26, paddingHorizontal: 16, gap: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open review list" onPress={() => router.navigate('/review')}>
          {count === 0 ? <PixelFrame fill={colors.surface} border="#363a5e" contentStyle={[styles.row, { padding: 14 }]}>
            <Icon name="check" color={colors.green} size={22} /><Label style={{ fontSize: 15, fontWeight: '600' }}>All caught up</Label>
          </PixelFrame> : <PixelFrame fill={colors.coralDeep} border="#ff8f9b" contentStyle={[styles.row, { paddingVertical: 14, paddingHorizontal: 18, minHeight: 122 }]}>
            <Icon name="musicFilled" size={54} color={colors.cream} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Label style={{ fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: 1 }}>REVIEW</Label>
              <Label style={{ fontSize: 34, lineHeight: 38, fontWeight: '800' }}>{count}</Label>
              <Label style={{ fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: 1 }}>LYRICS</Label>
            </View>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.coralSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="next" size={40} />
            </View>
          </PixelFrame>}
        </Pressable>
        <SectionHeader title="Recently played" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {getRecentlyPlayed(filters, 6).map(song => <Pressable key={song.id} style={{ width: coverSize }} accessibilityRole="button" accessibilityLabel={`Play ${song.title}`} onPress={() => { router.push('/player'); appStore.getState().startSong(song.id); }}>
            <Cover song={song} size={coverSize} />
            {ranks[song.id] && <View style={{ position: 'absolute', right: 6, top: 6 }}><Tag fill={colors.bg}>{ranks[song.id]}</Tag></View>}
            <Label numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>{song.title}</Label>
            <Label muted numberOfLines={1} style={{ fontSize: 12 }}>{song.artist}</Label>
          </Pressable>)}
        </View>
      </View>
    </ScrollView>
  </View>;
}
