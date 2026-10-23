import { memo, useCallback, useMemo, useRef } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import ReorderableList, { useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getAlbum, getSong, libraryStore } from '@/store/libraryStore';
import { appStore, getUpNext } from '@/store/appStore';
import { isHiddenSong, useLibraryFilters } from '@/data/libraryVisibility';
import { ScreenHeader } from '@/components/Header';
import { SpeedButton } from '@/components/SpeedButton';
import { Cover } from '@/components/Cover';
import { FogBadge } from '@/components/Fog';
import { ProgressLine, time } from '@/components/PlayerBar';
import { SongRow } from '@/components/SongRow';
import { Icon } from '@/components/Icon';
import { IconButton, Label, styles } from '@/components/ui';
import { songMenu } from './song-menu';
import type { Song } from '@/types/domain';

/** A visible song in Up next or autoplay, keeping its position in `[...upcoming queue, ...autoplay]`. */
type Row = { song: Song; position: number };

/** Autoplay is a shuffle of the whole library, so the full player previews only its start. */
const AUTOPLAY_PREVIEW = 20;

function Heading({ title, onClear }: { title: string; onClear?: () => void }) {
  return (
    <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }]}>
      <Label muted pixel style={{ flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>
        {title}
      </Label>
      {onClear && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear Up next" hitSlop={12} onPress={onClear}>
          <Label style={{ color: colors.lavender, fontSize: 13, fontWeight: '700' }}>Clear</Label>
        </Pressable>
      )}
    </View>
  );
}

/** An Up next song: drag its handle to reorder, long-press for the song menu with Remove from queue. */
const QueuedRow = memo(function QueuedRow({ song, position, onDragStart }: Row & { onDragStart: () => void }) {
  const router = useRouter();
  const drag = useReorderableDrag();
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SongRow
        song={song}
        onPress={() => appStore.getState().playUpNext(position)}
        onLongPress={() => router.push(songMenu(song.id, position))}
        accessory={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${song.title}`}
            onPressIn={() => {
              onDragStart();
              drag();
            }}
            hitSlop={8}
            style={{ width: 32, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <Icon name="drag" color={colors.muted} size={20} />
          </Pressable>
        }
      />
    </View>
  );
});

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

/** The slim bar grown up: cover, fog, scrubber, transport, then a reorderable Up next and the start of autoplay. */
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
    library = libraryStore((state) => state.bySong);
  // Rows keep their playback position, so hidden or removed songs drop out without shifting what a tap plays.
  const { upNext, autoplayRows, queued } = useMemo(() => {
    const next = getUpNext(appStore.getState());
    const rows = (ids: string[], start: number): Row[] =>
      ids.flatMap((id, offset) => {
        const song = getSong(id);
        return song && !isHiddenSong(song, filters) ? [{ song, position: start + offset }] : [];
      });
    return {
      upNext: rows(next.queue, 0),
      autoplayRows: rows(next.autoplay, next.queue.length).slice(0, AUTOPLAY_PREVIEW),
      queued: next.queue.length,
    };
  }, [queue, queueIndex, autoplay, filters, library]);
  const repeat = appStore((state) => !!songId && state.repeatSongId === songId);
  // The list reports indices into the rows it was dragging, which playback may have replaced before the drop.
  const latest = useRef(upNext),
    dragging = useRef<Row[] | null>(null);
  latest.current = upNext;
  const startDrag = useCallback(() => {
    dragging.current = latest.current;
  }, []);
  const reorder = ({ from, to }: ReorderableListReorderEvent) => {
    const rows = dragging.current ?? upNext,
      source = rows[from],
      target = rows[to];
    dragging.current = null;
    if (source && target) appStore.getState().moveUpNext(source.position, target.position, source.song.id);
  };
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
            {repeat && (
              <View style={[styles.row, { gap: 4, paddingTop: 2 }]}>
                <Icon name="repeat" color={colors.lavender} size={16} />
                <Label style={{ color: colors.lavender, fontSize: 13, fontWeight: '700' }}>Repeating</Label>
              </View>
            )}
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
        right={
          <View style={[styles.row, { gap: 14 }]}>
            <SpeedButton />
            <IconButton name="more" label="Song menu" onPress={() => router.push(songMenu(song.id))} />
          </View>
        }
      />
      <ReorderableList
        data={upNext}
        onReorder={reorder}
        ListHeaderComponent={
          <>
            {header}
            {queued > 0 && <Heading title="UP NEXT" onClear={() => appStore.getState().clearUpNext()} />}
          </>
        }
        ListFooterComponent={
          autoplayRows.length > 0 ? (
            <>
              <Heading title="AUTOPLAY" />
              {autoplayRows.map((row) => (
                <View key={row.song.id} style={{ paddingHorizontal: 16 }}>
                  <SongRow
                    song={row.song}
                    onPress={() => appStore.getState().playUpNext(row.position)}
                    onLongPress={() => router.push(songMenu(row.song.id, row.position))}
                  />
                </View>
              ))}
            </>
          ) : null
        }
        // Upcoming songs can repeat after Previous, so positions keep keys unique.
        keyExtractor={(row) => `${row.position}:${row.song.id}`}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => <QueuedRow song={item.song} position={item.position} onDragStart={startDrag} />}
      />
    </View>
  );
}
