import type { Album } from '@kashi-koi/core/types/domain';
import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { openMenuAtPointer } from '@/lib/songMenu';
import { Cover } from './Cover';
import { NoLyricsBadge } from './NoLyricsBadge';
import { Label } from './ui';

/** Shared album tile for the Library and an artist's album grid. Parents compute `count` and `noLyrics` once per list. */
export const AlbumTile = memo(function AlbumTile({
  album,
  size,
  count,
  noLyrics,
}: {
  album: Album;
  size: number;
  count: number;
  noLyrics: boolean;
}) {
  return (
    <Link
      to="/library/album/$id"
      params={{ id: album.id }}
      aria-label={`Open album ${album.title}`}
      className="block transition-[filter] active:opacity-70 hover:brightness-110"
      style={{ width: size }}
      onContextMenu={(event) => openMenuAtPointer(event, { kind: 'album', id: album.id })}
    >
      <span className="relative block">
        <Cover song={album} size={size} />
        {noLyrics && <NoLyricsBadge />}
      </span>
      <Label lines={1} className="mt-1.5 text-[15px] font-bold">
        {album.title}
      </Label>
      <Label muted lines={1} className="text-xs">
        {album.artist}
      </Label>
      <Label muted className="block text-xs">
        {count} {count === 1 ? 'song' : 'songs'}
      </Label>
    </Link>
  );
});

/** Height of an AlbumTile of this width: cover, 6px, three 21px lines. */
export const albumTileHeight = (size: number) => size + 6 + 63;
