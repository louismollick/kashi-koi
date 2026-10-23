import { useAvailableReviewList } from '@/data/reviewVisibility';
import { isDue } from '@/lyrics/review';
import { libraryStore } from '@/store/libraryStore';
import { useNow } from '@/hooks/useNow';
import { useMemo } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getRecentlyPlayed, useLibraryFilters } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { Header } from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { PixelFrame } from '@/components/PixelFrame';
import { Cover } from '@/components/Cover';
import { FogBadge } from '@/components/Fog';
import { songMenu } from '@/routes';
import { Icon } from '@/components/Icon';
import { Label, SectionHeader, styles } from '@/components/ui';

/** Harbor hero scrolls away; its review card overlaps the dock's bottom edge. */
export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const songs = libraryStore((state) => state.songs);
  const filters = useLibraryFilters();
  const reviewList = useAvailableReviewList();
  const now = useNow();
  const count = reviewList.filter((line) => isDue(line, now)).length;
  const coverSize = (width - 56) / 3,
    recent = useMemo(() => getRecentlyPlayed(filters, 6, songs), [filters, songs]);
  return (
    <View style={styles.page}>
      <Header />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={{ height: 250 }}>
          <Image
            source={require('../../../assets/background.png')}
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
          />
          <View style={{ position: 'absolute', bottom: 8, left: 26 }}>
            <Mascot size={240} />
          </View>
        </View>
        <View style={{ marginTop: -26, paddingHorizontal: 16, gap: 14 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open review list"
            onPress={() => router.navigate('/review')}
          >
            {count === 0 ? (
              <PixelFrame fill={colors.surface} border="#363a5e" contentStyle={[styles.row, { padding: 14 }]}>
                <Icon name="check" color={colors.green} size={22} />
                <Label style={{ fontSize: 15, fontWeight: '600' }}>All caught up</Label>
              </PixelFrame>
            ) : (
              <PixelFrame
                fill={colors.coralDeep}
                border="#ff8f9b"
                contentStyle={[styles.row, { paddingVertical: 14, paddingHorizontal: 18, minHeight: 122 }]}
              >
                <Icon name="musicFilled" size={54} color={colors.cream} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Label pixel style={{ fontSize: 29, letterSpacing: 1 }}>
                    REVIEW
                  </Label>
                  <Label pixel style={{ fontSize: 44 }}>
                    {count}
                  </Label>
                  <Label pixel style={{ fontSize: 29, letterSpacing: 1 }}>
                    LYRICS
                  </Label>
                </View>
                <PixelFrame
                  fill={colors.coralSoft}
                  border={null}
                  contentStyle={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="next" size={40} />
                </PixelFrame>
              </PixelFrame>
            )}
          </Pressable>
          {recent.length > 0 && <SectionHeader title="Recently played" />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {recent.map((song) => (
              <Pressable
                key={song.id}
                style={{ width: coverSize }}
                accessibilityRole="button"
                accessibilityLabel={`Play ${song.title}`}
                onPress={() => {
                  router.push('/player');
                  appStore.getState().startSong(
                    song.id,
                    recent.map((song) => song.id),
                  );
                }}
                onLongPress={() => router.push(songMenu(song.id))}
              >
                <Cover song={song} size={coverSize} />

                <Label numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>
                  {song.title}
                </Label>
                <View style={[styles.row, { gap: 6 }]}>
                  <Label muted numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
                    {song.artist}
                  </Label>
                  <FogBadge songId={song.id} compact />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
