import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appStore } from '@/store/appStore';
import { getSong, getLyrics, libraryStore } from '@/store/libraryStore';
import { colors } from '@/constants/theme';
import { PixelFrame } from './PixelFrame';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { IconButton, Label, styles } from './ui';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

const tabs = [
  { name: 'index', title: 'Home', icon: 'home', activeIcon: 'homeFilled' },
  { name: 'library', title: 'Library', icon: 'musicFilled', activeIcon: 'musicFilled' },
  { name: 'review', title: 'Review', icon: 'book', activeIcon: 'book' },
] as const;

/** Mini player and tabs remain mounted while browsing the three main screens. */
export function TabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const songId = appStore(state => state.songId);
  const song = libraryStore(state => songId ? state.bySong[songId] : undefined);
  const playing = appStore(state => state.playing);
  const reviewList = appStore(state => state.reviewList);
  const count = reviewList.filter(line => line.kind !== 'later').length;
  return <View style={{ backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom - 6, 10) }}>
    {song && <Pressable accessibilityRole="button" accessibilityLabel="Open player" onPress={() => router.push('/player')} style={{ marginHorizontal: 14, marginBottom: 6 }}>
      <PixelFrame fill={colors.mini} border="#d8cfe2" contentStyle={[styles.row, { padding: 8, paddingRight: 6 }]}>
        <Cover song={song} size={48} />
        <View style={{ flex: 1 }}>
          <Label style={{ color: colors.bg, fontWeight: '700', fontSize: 16 }}>{song.title}</Label>
          <Label style={{ color: '#4a4560', fontSize: 13 }}>{song.artist}</Label>
        </View>
        <IconButton plain name={playing ? 'pause' : 'play'} color={colors.bg} iconScale={0.7} label={playing ? 'Pause' : 'Play'} onPress={() => appStore.getState().setPlaying(!playing)} />
      </PixelFrame>
    </Pressable>}
    <View style={[styles.row, { paddingTop: 6, gap: 0 }]}>
      {tabs.map(tab => {
        const route = state.routes.find(route => route.name === tab.name)!;
        const on = state.routes[state.index]!.key === route.key;
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={descriptors[route.key]!.options.title ?? tab.title} onPress={() => {
          // The nested native stack handles popToTop on a focused tabPress.
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!on && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <View>
            <Icon name={on ? tab.activeIcon : tab.icon} size={32} color={on ? colors.coral : colors.lavender} />
            {tab.title === 'Review' && count > 0 && <View style={{ position: 'absolute', top: -8, left: 22, minWidth: 24, height: 24, paddingHorizontal: 5, borderRadius: 12, backgroundColor: colors.coral, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Label style={{ fontSize: 12, lineHeight: 15, fontWeight: '800' }}>{count}</Label>
            </View>}
          </View>
          <Label style={{ color: on ? colors.coral : colors.lavender, fontSize: 14, fontWeight: '700' }}>{tab.title}</Label>
        </Pressable>;
      })}
    </View>
  </View>;
}
