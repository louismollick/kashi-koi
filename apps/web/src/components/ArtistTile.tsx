import type { Album, Artist } from '@kashi-koi/core/types/domain';
import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { openMenuAtPointer } from '@/lib/songMenu';
import { Cover } from './Cover';
import { NoLyricsBadge } from './NoLyricsBadge';
import { Label } from './ui';

/** Artist tile for the Library grid. Parents compute `albumCount`, `cover` (the first visible album) and `noLyrics` once per list. */
export const ArtistTile = memo(function ArtistTile({
  artist,
  size,
  cover,
  albumCount,
  noLyrics,
}: {
  artist: Artist;
  size: number;
  cover?: Album;
  albumCount: number;
  noLyrics: boolean;
}) {
  return (
    <Link
      to="/library/artist/$id"
      params={{ id: artist.id }}
      aria-label={`Open artist ${artist.name}`}
      className="block transition-[filter] active:opacity-70 hover:brightness-110"
      style={{ width: size }}
      onContextMenu={(event) => openMenuAtPointer(event, { kind: 'artist', id: artist.id })}
    >
      <span className="relative block">
        <Cover song={cover ?? artist} size={size} />
        {noLyrics && <NoLyricsBadge />}
      </span>
      <Label lines={1} className="mt-1.5 font-bold">
        {artist.name}
      </Label>
      <Label muted className="block">
        {albumCount} albums
      </Label>
    </Link>
  );
});

/** Height of an ArtistTile of this width: cover, 6px, two 21px lines. */
export const artistTileHeight = (size: number) => size + 6 + 42;
