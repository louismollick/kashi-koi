import { Pressable } from 'react-native';
import { colors } from '@/constants/theme';
import { appStore } from '@/store/appStore';
import { Label } from './ui';

/** Reveal hidden songs globally, or restore hiding from the same thin row. */
export function HiddenSongsRow({ count, kind = 'songs', album = false }: { count: number; kind?: 'songs' | 'albums' | 'artists'; album?: boolean }) {
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  if (!count) return null;
  const noun = count === 1 ? kind.slice(0, -1) : kind;
  const hiddenLabel = album ? `${count} ${count === 1 ? 'track' : 'tracks'} hidden (no synced lyrics)`
    : `Hiding ${count} ${noun} without synced lyrics`;
  const description = hiding ? hiddenLabel : 'Showing all songs';
  const action = hiding ? 'Show' : 'Hide no-lyrics';
  const label = `${description} · ${action}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => appStore.getState().toggleHideSongsWithoutSyncedLyrics()}
    style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.track, opacity: pressed ? 0.7 : 1 })}>
    <Label muted style={{ fontSize: 13 }}>{description} · <Label style={{ fontSize: 13, color: colors.coral, fontWeight: '700' }}>{action}</Label></Label>
  </Pressable>;
}
