import { useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { colors } from '@kashi-koi/design/tokens';
import { Label } from './ui';

/** Thin row that turns the library filters (synced, Japanese) off together, or back on. */
export function HiddenSongsRow({
  count,
  kind = 'songs',
  album = false,
}: {
  count: number;
  kind?: 'songs' | 'albums' | 'artists' | 'playlists';
  album?: boolean;
}) {
  const filters = useLibraryFilters();
  if (!count) return null;
  const hiding = filters.hideUnsynced || filters.hideNonJapanese;
  const noun = count === 1 ? kind.slice(0, -1) : kind;
  const description = !hiding
    ? 'Showing all songs'
    : album
      ? `${count} ${count === 1 ? 'track' : 'tracks'} hidden`
      : `Hiding ${count} ${noun}`;
  const action = hiding ? 'Show' : 'Hide';
  return (
    <button
      type="button"
      aria-label={`${description} · ${action}`}
      onClick={() => {
        const state = settingsStore.getState();
        if (state.hideSongsWithoutSyncedLyrics === hiding) state.toggleHideSongsWithoutSyncedLyrics();
        if (state.hideSongsWithoutJapanese === hiding) state.toggleHideSongsWithoutJapanese();
      }}
      className="flex min-h-11 w-full items-center border-b border-track text-left active:opacity-70"
    >
      <Label muted className="text-[13px]">
        {description} ·{' '}
        <Label className="text-[13px] font-bold" style={{ color: colors.coral }}>
          {action}
        </Label>
      </Label>
    </button>
  );
}
