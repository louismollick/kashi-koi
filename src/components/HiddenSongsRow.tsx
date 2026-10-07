import { Pressable } from 'react-native';
import { colors } from '@/constants/theme';
import { appStore, useLibraryFilters } from '@/store/appStore';
import { Label } from './ui';

/** Thin row that turns the library filters (synced, Japanese) off together, or back on. */
export function HiddenSongsRow({ count, kind = 'songs', album = false }: { count: number; kind?: 'songs' | 'albums' | 'artists'; album?: boolean }) {
  const filters = useLibraryFilters();
  if (!count) return null;
  const hiding = filters.hideUnsynced || filters.hideNonJapanese;
  const noun = count === 1 ? kind.slice(0, -1) : kind;
  const description = !hiding ? 'Showing all songs' : album ? `${count} ${count === 1 ? 'track' : 'tracks'} hidden` : `Hiding ${count} ${noun}`;
  const action = hiding ? 'Show' : 'Hide';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${description} · ${action}`} onPress={() => {
    const state = appStore.getState();
    if (state.hideSongsWithoutSyncedLyrics === hiding) state.toggleHideSongsWithoutSyncedLyrics();
    if (state.hideSongsWithoutJapanese === hiding) state.toggleHideSongsWithoutJapanese();
  }} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.track, opacity: pressed ? 0.7 : 1 })}>
    <Label muted style={{ fontSize: 13 }}>{description} · <Label style={{ fontSize: 13, color: colors.coral, fontWeight: '700' }}>{action}</Label></Label>
  </Pressable>;
}
