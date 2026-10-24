import { useAvailableReviewList } from '@kashi-koi/core/data/reviewVisibility';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appStore } from '@kashi-koi/core/store/appStore';
import { isDue } from '@kashi-koi/core/lyrics/review';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { useNow } from '@/hooks/useNow';
import { colors } from '@/constants/theme';
import { PixelFrame } from './PixelFrame';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { Marquee } from './Marquee';
import { ProgressLine } from './PlayerBar';
import { IconButton, Label, styles } from './ui';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

const tabs = [
  { name: 'index', title: 'Home', icon: 'home', activeIcon: 'homeFilled' },
  { name: 'library', title: 'Library', icon: 'musicFilled', activeIcon: 'musicFilled' },
  { name: 'review', title: 'Review', icon: 'book', activeIcon: 'book' },
] as const;

/** Display-only song progress; subscribes on its own so the tabs don't re-render every tick. */
function MiniProgress() {
  const position = appStore((state) => state.positionMs),
    duration = appStore((state) => state.durationMs);
  return <ProgressLine progress={duration ? position / duration : 0} height={3} track="#363a5e" />;
}

/** Mini player and tabs remain mounted while browsing the three main screens. */
export function TabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const playing = appStore((state) => state.playing);
  const reviewList = useAvailableReviewList();
  const now = useNow();
  const count = reviewList.filter((line) => isDue(line, now)).length;
  return (
    <View style={{ backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom - 6, 10) }}>
      {song && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open player"
          onPress={() => router.push('/player')}
          style={{ marginHorizontal: 14, marginBottom: 6 }}
        >
          <PixelFrame
            fill={colors.surface}
            border="#363a5e"
            contentStyle={[styles.row, { height: 64, padding: 8, paddingRight: 6 }]}
          >
            <Cover song={song} size={48} />
            <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Marquee key={songId} style={{ fontWeight: '700', fontSize: 16 }}>
                {song.title}
              </Marquee>
              <Label muted numberOfLines={1} style={{ fontSize: 13 }}>
                {song.artist}
              </Label>
            </View>
            {/* The 44 point slot the web reserves; the 40 point button sits flush right inside it. */}
            <View style={{ marginLeft: 4 }}>
              <IconButton
                name={playing ? 'pause' : 'play'}
                fill={colors.coral}
                border={colors.coralBorder}
                size={40}
                label={playing ? 'Pause' : 'Play'}
                onPress={() => appStore.getState().setPlaying(!playing)}
              />
            </View>
            <View style={{ position: 'absolute', left: 6, right: 6, top: 2 }}>
              <MiniProgress />
            </View>
          </PixelFrame>
        </Pressable>
      )}
      <View style={[styles.row, { paddingTop: 6, gap: 0 }]}>
        {tabs.map((tab) => {
          const route = state.routes.find((route) => route.name === tab.name)!;
          const on = state.routes[state.index]!.key === route.key;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={descriptors[route.key]!.options.title ?? tab.title}
              onPress={() => {
                // The nested native stack handles popToTop on a focused tabPress.
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!on && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={{ flex: 1, alignItems: 'center', gap: 2 }}
            >
              <View>
                <Icon name={on ? tab.activeIcon : tab.icon} size={32} color={on ? colors.coral : colors.lavender} />
                {tab.title === 'Review' && count > 0 && (
                  <PixelFrame
                    fill={colors.coral}
                    border={colors.bg}
                    style={{ position: 'absolute', top: -8, left: 22 }}
                    contentStyle={{
                      minWidth: 24,
                      height: 24,
                      paddingHorizontal: 6,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Label pixel style={{ fontSize: 16 }}>
                      {count}
                    </Label>
                  </PixelFrame>
                )}
              </View>
              <Label pixel style={{ color: on ? colors.coral : colors.lavender, fontSize: 19 }}>
                {tab.title}
              </Label>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
