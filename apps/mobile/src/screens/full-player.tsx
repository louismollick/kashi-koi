import { useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getAlbum, getSong, libraryStore } from '@/store/libraryStore';
import { appStore, getUpNext, useLibraryFilters } from '@/store/appStore';
import { isHiddenSong } from '@/data/libraryVisibility';
import { ScreenHeader } from '@/components/Header';
import { Cover } from '@/components/Cover';
import { FogBadge } from '@/components/Fog';
import { ProgressLine, time } from '@/components/PlayerBar';
import { SongRow } from '@/components/SongRow';
import { IconButton, Label, styles } from '@/components/ui';
import { songMenu } from './song-menu';
import type { Song } from '@/types/domain';

type Item = { kind: 'heading'; title: string } | { kind: 'song'; song: Song; position: number };

/** Scrubber and elapsed/remaining times; subscribes on its own so the queue doesn't re-render every tick. */
function Scrubber() {
  const position = appStore((state) => state.positionMs),
    duration = appStore((state) => state.durationMs);
  return (
    <View style={{ gap: 6 }}>
      <ProgressLine
        progress={duration ? position / duration : 0}
        total={duration}
        onSeek={(ms) => appStore.getState().seek(ms)}
      />
      <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: 16 }]}>
        <Label muted style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {time(position)}
        </Label>
        <Label muted style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
          -{time(Math.max(0, duration - position))}
        </Label>
      </View>
    </View>
  );
}

/** The slim bar grown up: cover, fog, scrubber, transport, then Up next and autoplay. */
export default function FullPlayerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const playing = appStore((state) => state.playing && !state.clipPlayback);
  const loading = appStore((state) => state.loading);
  const waiting = appStore((state) => !!state.answerWait);
  const queue = appStore((state) => state.queue),
    queueIndex = appStore((state) => state.queueIndex),
    autoplay = appStore((state) => state.autoplay);
  const filters = useLibraryFilters(),
    library = libraryStore((state) => state.bySong),
    lyrics = libraryStore((state) => state.lyrics);
  // Rows keep their playback position, so hidden or removed songs drop out without shifting what a tap plays.
  const items = useMemo(() => {
    const next = getUpNext(appStore.getState());
    const songs = [...next.queue, ...next.autoplay].map(getSong);
    const rows = (start: number, count: number): Item[] =>
      songs
        .slice(start, start + count)
        .flatMap((song, offset) =>
          song && !isHiddenSong(song, filters) ? [{ kind: 'song' as const, song, position: start + offset }] : [],
        );
    return [
      ...(next.queue.length ? [{ kind: 'heading' as const, title: 'UP NEXT' }, ...rows(0, next.queue.length)] : []),
      ...(next.autoplay.length
        ? [{ kind: 'heading' as const, title: 'AUTOPLAY' }, ...rows(next.queue.length, next.autoplay.length)]
        : []),
    ];
  }, [queue, queueIndex, autoplay, filters, library, lyrics]);
  if (!song)
    return (
      <View style={styles.page}>
        <ScreenHeader sheet />
        <Label muted style={{ padding: 16 }}>
          No song playing
        </Label>
      </View>
    );
  const cover = Math.min(width - 96, 300);
  const header = (
    <View style={{ gap: 18, paddingBottom: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Song menu for ${song.title}`}
        onPress={() => router.push(songMenu(song.id))}
        style={({ pressed }) => ({ gap: 16, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ alignItems: 'center', paddingTop: 4 }}>
          <Cover song={getAlbum(song.albumId) ?? song} size={cover} />
        </View>
        <View style={[styles.row, { paddingHorizontal: 16, alignItems: 'flex-end' }]}>
          <View style={{ flex: 1 }}>
            <Label numberOfLines={1} style={styles.title}>
              {song.title}
            </Label>
            <Label muted numberOfLines={1}>
              {song.artist} · {song.album}
            </Label>
          </View>
          <FogBadge songId={song.id} />
        </View>
      </Pressable>
      <Scrubber />
      <View style={[styles.row, { justifyContent: 'center', gap: 28 }]}>
        <IconButton
          name="skipPrevious"
          size={52}
          label="Previous song"
          onPress={() => appStore.getState().skipBack()}
        />
        <IconButton
          name={playing ? 'pause' : waiting ? 'refresh' : 'play'}
          fill={colors.coral}
          size={68}
          label={playing ? 'Pause' : waiting ? 'Replay' : 'Play'}
          disabled={loading}
          onPress={() => (waiting ? appStore.getState().replayLine() : appStore.getState().setPlaying(!playing))}
        />
        <IconButton name="skipNext" size={52} label="Next song" onPress={() => appStore.getState().nextSong()} />
      </View>
    </View>
  );
  return (
    <View style={styles.page}>
      <ScreenHeader
        sheet
        right={<IconButton name="more" label="Song menu" onPress={() => router.push(songMenu(song.id))} />}
      />
      <FlashList
        data={items}
        ListHeaderComponent={header}
        keyExtractor={(item) => (item.kind === 'heading' ? item.title : `${item.position}:${item.song.id}`)}
        getItemType={(item) => item.kind}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) =>
          item.kind === 'heading' ? (
            <Label
              muted
              style={{
                fontSize: 12,
                fontWeight: '800',
                letterSpacing: 1,
                paddingHorizontal: 16,
                paddingTop: 20,
                paddingBottom: 4,
              }}
            >
              {item.title}
            </Label>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
              <SongRow song={item.song} onPress={() => appStore.getState().playUpNext(item.position)} />
            </View>
          )
        }
      />
    </View>
  );
}
