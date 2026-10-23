import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { isHiddenSong, useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { appStore, getUpNext } from '@kashi-koi/core/store/appStore';
import { getSong, libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { Song } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { useMemo } from 'react';
import { Icon } from './Icon';
import { SongRow } from './SongRow';
import { Label } from './ui';

/** A visible song in Up next or autoplay, keeping its position in `[...upcoming queue, ...autoplay]`. */
type Row = { song: Song; position: number };
/** Upcoming songs can repeat after Previous, so a row's position keeps its key unique. */
const rowKey = (row: Row) => `${row.position}:${row.song.id}`;

/** Autoplay is a shuffle of the whole library, so Up next previews only its start. */
const AUTOPLAY_PREVIEW = 20;

function Heading({ title, onClear }: { title: string; onClear?: () => void }) {
  return (
    <div className="flex items-center pt-5 pb-1">
      <Label muted pixel className="flex-1 text-[13px] font-bold tracking-[1px]">
        {title}
      </Label>
      {onClear && (
        <button type="button" aria-label="Clear Up next" onClick={onClear} className="px-1 py-2 hover:brightness-125">
          <Label className="text-[13px] font-bold text-lavender">Clear</Label>
        </button>
      )}
    </div>
  );
}

/** An Up next song: drag its handle to reorder; long-press or right-click for the song menu with Remove from queue. */
function QueuedRow({ row }: { row: Row }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: rowKey(row),
  });
  return (
    <div
      ref={setNodeRef}
      className="relative bg-bg"
      // Rows only slide vertically, and the one being dragged floats above its neighbours.
      style={{
        transform: CSS.Transform.toString(transform && { ...transform, x: 0, scaleX: 1, scaleY: 1 }),
        transition,
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      <SongRow
        song={row.song}
        menuPosition={row.position}
        onPress={() => appStore.getState().playUpNext(row.position)}
        accessory={
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Reorder ${row.song.title}`}
            className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-end"
            {...attributes}
            {...listeners}
          >
            <Icon name="drag" color={colors.muted} size={20} />
          </button>
        }
      />
    </div>
  );
}

/**
 * Up next (reorderable, with Clear) and a preview of autoplay below it. Rows keep their playback position, so hidden or
 * removed songs drop out without shifting what a click plays. Used by the phone's full player and the desktop pane.
 */
export function UpNext() {
  const queue = appStore((state) => state.queue),
    queueIndex = appStore((state) => state.queueIndex),
    autoplay = appStore((state) => state.autoplay);
  const filters = useLibraryFilters(),
    library = libraryStore((state) => state.bySong);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the queue fields and library invalidate the rows read from the store
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reorder = ({ active, over }: DragEndEvent) => {
    const source = upNext.find((row) => rowKey(row) === active.id),
      target = upNext.find((row) => rowKey(row) === over?.id);
    if (source && target) appStore.getState().moveUpNext(source.position, target.position, source.song.id);
  };
  return (
    <div className="px-4 pb-8">
      {queued > 0 && <Heading title="UP NEXT" onClear={() => appStore.getState().clearUpNext()} />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={upNext.map(rowKey)} strategy={verticalListSortingStrategy}>
          {upNext.map((row) => (
            <QueuedRow key={rowKey(row)} row={row} />
          ))}
        </SortableContext>
      </DndContext>
      {autoplayRows.length > 0 && (
        <>
          <Heading title="AUTOPLAY" />
          {autoplayRows.map((row) => (
            <SongRow
              key={row.song.id}
              song={row.song}
              menuPosition={row.position}
              onPress={() => appStore.getState().playUpNext(row.position)}
            />
          ))}
        </>
      )}
    </div>
  );
}
