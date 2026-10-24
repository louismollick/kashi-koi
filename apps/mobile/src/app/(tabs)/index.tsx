import { useAvailableReviewList } from '@kashi-koi/core/data/reviewVisibility';
import { isDue, nextDue, reviewTime } from '@kashi-koi/core/lyrics/review';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { useNow } from '@/hooks/useNow';
import { useMemo } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getRecentlyPlayed, useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import { Header } from '@/components/Header';
import { HarborScene } from '@/components/Harbor';
import { PixelFrame } from '@/components/PixelFrame';
import { Cover } from '@/components/Cover';
import { FogBadge } from '@/components/Fog';
import { songMenu } from '@/routes';
import { Icon } from '@/components/Icon';
import { Label, SectionHeader, styles } from '@/components/ui';

/**
 * Harbor hero scrolls away and its review row overlaps the dock's bottom edge. The row keeps one height either way:
 * red with the count when something is due, quiet with the next due day once nothing is, when she holds up her catch.
 */
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
        {/* The review row rides 26 points over the hero's bottom edge, so she sits on the deck above it. */}
        <HarborScene
          style={{ height: 250 }}
          covered={26}
          left={26}
          size={() => 240}
          pose={count === 0 ? 'catch' : 'play'}
        />
        <View style={{ marginTop: -26, paddingHorizontal: 16, gap: 14 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open review list"
            onPress={() => router.navigate('/review')}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {count === 0 ? (
              <PixelFrame
                fill={colors.surface}
                border="#363a5e"
                contentStyle={[styles.row, { height: 56, paddingRight: 16, paddingLeft: 14 }]}
              >
                <Icon name="check" color={colors.green} size={24} />
                <Label pixel style={{ fontSize: 24, letterSpacing: 0.5 }}>
                  ALL CAUGHT UP
                </Label>
                <Label muted numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>
                  {nextDue(reviewList, now)}
                </Label>
              </PixelFrame>
            ) : (
              <PixelFrame
                fill={colors.coralDeep}
                border="#ff8f9b"
                contentStyle={[styles.row, { height: 56, paddingRight: 10, paddingLeft: 14 }]}
              >
                <Icon name="musicFilled" size={30} color={colors.cream} />
                {/* A narrow phone drops the time so the title keeps its count. */}
                <Label pixel numberOfLines={1} style={{ flex: 1, fontSize: 24, letterSpacing: 0.5 }}>
                  REVIEW {count} {count === 1 ? 'LYRIC' : 'LYRICS'}
                </Label>
                {width >= 360 && (
                  <Label numberOfLines={1} style={{ flexShrink: 0, fontSize: 13 }}>
                    {reviewTime}
                  </Label>
                )}
                <PixelFrame
                  fill={colors.coralSoft}
                  border={null}
                  contentStyle={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="next" size={30} />
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
