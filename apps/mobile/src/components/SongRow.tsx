import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getAlbum } from '@kashi-koi/core/store/libraryStore';
import { appStore } from '@kashi-koi/core/store/appStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { Cover } from './Cover';
import { FogBadge } from './Fog';
import { songMenu } from '@/routes';
import { useIsDownloaded } from '@kashi-koi/core/downloads';
import { Icon } from './Icon';
import { Label, styles } from './ui';
import type { Song } from '@kashi-koi/core/types/domain';

/**
 * A song in the Library, an album's numbered list or Up next. Tapping plays it with `queue` (stable ids, default just
 * this song) as the queue, unless `onPress` overrides it. Long-press opens the song menu unless `onLongPress` overrides
 * it. `accessory` sits after the duration, like Up next's drag handle.
 */
export const SongRow = memo(function SongRow({
  song,
  number,
  queue,
  queueIndex,
  onPress,
  onLongPress,
  accessory,
}: {
  song: Song;
  number?: number;
  queue?: string[];
  /** This row's position in `queue`, for lists that repeat a song. */
  queueIndex?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  accessory?: ReactNode;
}) {
  const router = useRouter();
  const hideUnsynced = settingsStore((state) => state.hideSongsWithoutSyncedLyrics),
    downloaded = useIsDownloaded(song.id);
  const duration = `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration) % 60).padStart(2, '0')}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.title}${song.lyricsStatus === 'synced' ? '' : ', no lyrics'}`}
      onPress={
        onPress ??
        (() => {
          router.push('/player');
          appStore.getState().startSong(song.id, queue, queueIndex);
        })
      }
      onLongPress={onLongPress ?? (() => router.push(songMenu(song.id)))}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: 64,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.track,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {number === undefined ? (
        <Cover song={getAlbum(song.albumId) ?? song} size={46} />
      ) : (
        <Label muted style={{ width: 26, textAlign: 'center', fontSize: 14 }}>
          {number}
        </Label>
      )}
      <View style={{ flex: 1 }}>
        <View style={[styles.row, { gap: 6 }]}>
          <Label numberOfLines={1} style={{ fontWeight: '700', fontSize: 16, flexShrink: 1 }}>
            {song.title}
          </Label>
          {!hideUnsynced && !(song.lyricsStatus === 'synced') && (
            <Icon name="micOff" color={colors.muted} size={16} accessibilityLabel="No synced lyrics" />
          )}
          {downloaded && <Icon name="downloaded" color={colors.green} size={14} accessibilityLabel="Downloaded" />}
        </View>
        {number === undefined && (
          <Label muted numberOfLines={1} style={{ fontSize: 13 }}>
            {song.artist}
          </Label>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Label muted style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>
          {duration}
        </Label>
        <FogBadge songId={song.id} compact />
      </View>
      {accessory}
    </Pressable>
  );
});
