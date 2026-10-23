import {
  countBy,
  countedFilters,
  getVisibleLibrary,
  getVisibleSongs,
  groupBy,
  syncedIds,
  useLibraryFilters,
} from '@kashi-koi/core/data/libraryVisibility';
import { getPlaylistSongs, libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { Playlist } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { z } from 'zod';
import { AlbumTile, albumTileHeight } from '@/components/AlbumTile';
import { ArtistTile, artistTileHeight } from '@/components/ArtistTile';
import { Cover } from '@/components/Cover';
import { TabHeader } from '@/components/Header';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Icon } from '@/components/Icon';
import { PixelFrame } from '@/components/PixelFrame';
import { Screen } from '@/components/Screen';
import { SongRow, songRowHeight } from '@/components/SongRow';
import { Button, Label } from '@/components/ui';
import { VirtualGrid, VirtualList } from '@/components/VirtualList';
import { useIsDesktop } from '@/hooks/useIsDesktop';

const tabs = ['albums', 'artists', 'songs', 'playlists'] as const;
const tabLabels = { albums: 'Albums', artists: 'Artists', songs: 'Songs', playlists: 'Playlists' } as const;

// The sub-tab and the search live in the URL, so going back from an album returns to the same list.
const search = z.object({
  tab: z.enum(tabs).catch('albums').default('albums'),
  q: z.string().catch('').default(''),
});

export const Route = createFileRoute('/_app/library/')({ validateSearch: search, component: LibraryScreen });

const playlistRowHeight = 64;

/** A playlist with its visible song count; opens the playlist page. */
function PlaylistRow({ playlist, count }: { playlist: Playlist; count: number }) {
  return (
    <Link
      to="/library/playlist/$id"
      params={{ id: playlist.id }}
      aria-label={`Open playlist ${playlist.name}`}
      className="flex items-center gap-[10px] border-b border-track py-2 transition-[filter] active:opacity-70 hover:brightness-125"
      style={{ height: playlistRowHeight }}
    >
      <Cover song={playlist} size={48} />
      <span className="block min-w-0 flex-1">
        <Label lines={1} className="text-base font-bold">
          {playlist.name}
        </Label>
        <Label muted className="block text-[13px]">
          {count} {count === 1 ? 'song' : 'songs'}
        </Label>
      </span>
    </Link>
  );
}

/** Virtualized grids and rows for the entire in-memory library. */
function LibraryScreen() {
  const { tab, q: query } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const desktop = useIsDesktop();
  const songs = libraryStore((state) => state.songs),
    albums = libraryStore((state) => state.albums),
    artists = libraryStore((state) => state.artists),
    playlists = libraryStore((state) => state.playlists);
  const progress = libraryStore((state) => state.progress),
    error = libraryStore((state) => state.error);
  const filters = useLibraryFilters();
  const source = useMemo(() => {
    const needle = query.toLowerCase();
    const matching = songs.filter((song) =>
      `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(needle),
    );
    const albumIds = new Set(matching.map((song) => song.albumId)),
      artistIds = new Set(matching.map((song) => song.artistId));
    return {
      songs: matching,
      albums: albums.filter((album) => albumIds.has(album.id)),
      artists: artists.filter((artist) => artistIds.has(artist.id)),
    };
  }, [songs, albums, artists, query]);
  // Visibility reads each song's lyrics, which only change with `songs`, so these recompute when the library or filters change.
  const { albumCounts, synced } = useMemo(
    () => ({
      // Counts and badges describe the whole album or artist, not just the songs matching the search.
      albumCounts: countBy(getVisibleSongs(songs, filters), (song) => song.albumId),
      synced: syncedIds(songs),
    }),
    [filters, songs],
  );
  const { visible, hidden, artistAlbums } = useMemo(() => {
    const visible = getVisibleLibrary(filters, source);
    return {
      visible,
      hidden: getVisibleLibrary(countedFilters(filters), source),
      artistAlbums: groupBy(visible.albums, (album) => album.artistId),
    };
  }, [filters, source]);
  // Playlists match by name and show only when some song in them is visible, like albums.
  const { shownPlaylists, playlistCounts, hiddenPlaylists } = useMemo(() => {
    const needle = query.toLowerCase(),
      matching = playlists.filter((playlist) => playlist.name.toLowerCase().includes(needle)),
      counted = countedFilters(filters);
    const playlistCounts = new Map(
      matching.map((playlist) => [playlist.id, getVisibleSongs(getPlaylistSongs(playlist.id), filters).length]),
    );
    return {
      shownPlaylists: matching.filter((playlist) => playlistCounts.get(playlist.id)),
      playlistCounts,
      // Empty playlists, or ones whose songs all left the library, aren't hidden by a filter, so they don't count.
      hiddenPlaylists: matching.filter((playlist) => {
        const songs = getPlaylistSongs(playlist.id);
        return songs.length > 0 && !getVisibleSongs(songs, counted).length;
      }).length,
    };
  }, [playlists, filters, query]);
  // Playing from the Songs list queues the list as shown.
  const queue = useMemo(() => visible.songs.map((song) => song.id), [visible.songs]);
  const minTile = desktop ? 140 : 100;
  const kind = tab === 'playlists' ? null : tab;
  const setSearch = (next: Partial<z.infer<typeof search>>) =>
    navigate({ search: (previous) => ({ ...previous, ...next }), replace: true });
  const empty = (
    <Label muted className="block">
      {progress
        ? 'Your library will appear as lyrics are checked'
        : query
          ? 'No matches'
          : tab === 'playlists'
            ? 'No playlists'
            : 'No visible songs'}
    </Label>
  );
  const items = { albums: visible.albums, artists: visible.artists, songs: visible.songs, playlists: shownPlaylists }[
    tab
  ];
  return (
    <Screen header={<TabHeader />}>
      <div className="px-4 pt-4 pb-4">
        <div className="flex flex-col gap-4 pb-4">
          <PixelFrame fill={colors.surface} contentClassName="flex items-center gap-[10px] px-3">
            <Icon name="search" size={20} color={colors.muted} />
            <input
              aria-label="Search library"
              placeholder="Search songs, albums, artists"
              value={query}
              onChange={(event) => setSearch({ q: event.target.value })}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-[50px] min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-muted"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch({ q: '' })}
                className="active:opacity-70"
              >
                <Icon name="close" size={20} color={colors.muted} />
              </button>
            )}
          </PixelFrame>
          <div className="flex gap-1.5">
            {tabs.map((value) => (
              <Button
                key={value}
                label={tabLabels[value]}
                fill={tab === value ? colors.coral : colors.slate}
                onPress={() => setSearch({ tab: value })}
                className="flex-1"
                // Four segments leave little width; tighter padding keeps "Playlists" on one line.
                contentClassName="px-1"
              >
                <Label lines={1} className="font-bold">
                  {tabLabels[value]}
                </Label>
              </Button>
            ))}
          </div>
          {kind ? (
            <HiddenSongsRow count={source[kind].length - hidden[kind].length} kind={kind} />
          ) : (
            <HiddenSongsRow count={hiddenPlaylists} kind="playlists" />
          )}
          {progress && (
            <Label muted className="block">
              {progress.kind === 'sync' ? 'Syncing library' : 'Checking lyrics'}… {progress.completed.toLocaleString()}{' '}
              / {progress.total.toLocaleString()}
            </Label>
          )}
          {error && (
            <Label className="block" style={{ color: colors.red }}>
              {error}
            </Label>
          )}
        </div>
        {items.length === 0 ? (
          empty
        ) : tab === 'songs' ? (
          <VirtualList
            items={visible.songs}
            rowHeight={songRowHeight}
            renderItem={(song) => <SongRow song={song} queue={queue} />}
          />
        ) : tab === 'playlists' ? (
          <VirtualList
            items={shownPlaylists}
            rowHeight={playlistRowHeight}
            renderItem={(playlist) => <PlaylistRow playlist={playlist} count={playlistCounts.get(playlist.id) ?? 0} />}
          />
        ) : tab === 'albums' ? (
          <VirtualGrid
            items={visible.albums}
            minTile={minTile}
            tileHeight={albumTileHeight}
            getKey={(album) => album.id}
            renderItem={(album, size) => (
              <AlbumTile
                album={album}
                size={size}
                count={albumCounts.get(album.id) ?? 0}
                noLyrics={!filters.hideUnsynced && !synced.albums.has(album.id)}
              />
            )}
          />
        ) : (
          <VirtualGrid
            items={visible.artists}
            minTile={minTile}
            tileHeight={artistTileHeight}
            getKey={(artist) => artist.id}
            renderItem={(artist, size) => {
              const albums = artistAlbums.get(artist.id) ?? [];
              return (
                <ArtistTile
                  artist={artist}
                  size={size}
                  cover={albums[0]}
                  albumCount={albums.length}
                  noLyrics={!filters.hideUnsynced && !synced.artists.has(artist.id)}
                />
              );
            }}
          />
        )}
      </div>
    </Screen>
  );
}
