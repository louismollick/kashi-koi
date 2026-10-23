import { analysisRequests, analyzeSong, canAnalyze } from '@kashi-koi/core/analysis/fetcher';
import { getLibraryFilters, getVisibleSongs } from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import {
  getAlbum,
  getAlbumSongs,
  getArtist,
  getArtistSongs,
  hasTranslations,
  libraryStore,
  songAnalysisInfo,
} from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import type { Song } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { closeMenu, type MenuTarget, menuStore } from '@/lib/songMenu';
import { router } from '@/router';
import { Cover } from './Cover';
import { FogBadge, FogStrip, useSongFog } from './Fog';
import { PixelSpinner } from './PixelSpinner';
import { IconButton, Label, PixelToggle, Row } from './ui';

/** Each action closes the menu first. */
const act = (action: () => void) => () => {
  closeMenu();
  action();
};

/** Everything you can do with one song. Up next rows pass their `position` to offer removal. */
function SongActions({ song, position }: { song: Song; position?: number }) {
  const id = song.id;
  const lyrics = libraryStore((state) => state.lyrics[id]);
  const current = appStore((state) => state.songId === id);
  const repeat = appStore((state) => state.repeatSongId === id);
  const showTranslations = settingsStore((state) => state.showTranslations);
  const request = analysisRequests((requests) => requests[id]);
  // The admin token and server decide whether Analyze is offered.
  settingsStore((state) => state.analysisToken + state.analysisServerUrl);
  const synced = !!lyrics?.timeline.length;
  const info = songAnalysisInfo(id);
  return (
    <>
      {current ? (
        <Row label="Repeat song">
          <PixelToggle label="Repeat song" on={repeat} onPress={() => appStore.getState().setRepeatSong(id, !repeat)} />
        </Row>
      ) : (
        <>
          <Row label="Play next" onPress={act(() => appStore.getState().playNext([id]))} />
          <Row label="Add to queue" onPress={act(() => appStore.getState().addToQueue([id]))} />
        </>
      )}
      {position !== undefined && (
        <Row label="Remove from queue" onPress={act(() => appStore.getState().removeUpNext(position, id))} />
      )}
      <Row
        label="Go to album"
        detail={song.album}
        onPress={act(() => void router.navigate({ to: '/library/album/$id', params: { id: song.albumId } }))}
      />
      <Row
        label="Go to artist"
        detail={song.artist}
        onPress={act(() => void router.navigate({ to: '/library/artist/$id', params: { id: song.artistId } }))}
      />
      {synced && (
        <Row label="Translations">
          <PixelToggle
            label="Translations"
            on={showTranslations}
            onPress={() => settingsStore.getState().toggleTranslations()}
          />
        </Row>
      )}
      {synced && !info && !request && !hasTranslations(id) && <Row label="No song analysis yet" disabled />}
      {request?.status === 'failed' ? (
        <Row
          label="Retry analysis"
          detail={request.error ?? 'Analysis failed'}
          color={colors.red}
          onPress={() => void analyzeSong(id, { force: request.force })}
        />
      ) : request ? (
        <Row label={request.status === 'running' ? 'Analyzing song' : 'Analysis queued'} disabled>
          <PixelSpinner color={colors.lavender} />
        </Row>
      ) : (
        canAnalyze() &&
        synced && (
          <Row
            label={info ? 'Re-analyze song' : 'Analyze song'}
            onPress={() => void analyzeSong(id, { force: !!info })}
          />
        )
      )}
    </>
  );
}

/** An album's or artist's visible songs, for the tile menus. */
function collectionSongs(target: Extract<MenuTarget, { kind: 'album' | 'artist' }>) {
  const songs = target.kind === 'album' ? getAlbumSongs(target.id) : getArtistSongs(target.id);
  return getVisibleSongs(songs, getLibraryFilters()).map((song) => song.id);
}

/** Play, Shuffle, Play next and Add to queue for an album or artist tile. */
function CollectionActions({ target }: { target: Extract<MenuTarget, { kind: 'album' | 'artist' }> }) {
  const start = (shuffle: boolean) =>
    target.kind === 'album'
      ? appStore.getState().startAlbum(target.id, shuffle)
      : appStore.getState().startArtist(target.id, shuffle);
  return (
    <>
      <Row label="Play" onPress={act(() => start(false))} />
      <Row label="Shuffle" onPress={act(() => start(true))} />
      <Row label="Play next" onPress={act(() => appStore.getState().playNext(collectionSongs(target)))} />
      <Row label="Add to queue" onPress={act(() => appStore.getState().addToQueue(collectionSongs(target)))} />
    </>
  );
}

/** Cover, title and fog on top of a menu. */
function MenuHeader({
  title,
  subtitle,
  extra,
  art,
  fogSongId,
  onClose,
}: {
  title: string;
  subtitle: string;
  extra?: string;
  art: ReactNode;
  fogSongId?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 pb-3">
      <div className="flex items-center gap-[10px]">
        {art}
        <div className="min-w-0 flex-1">
          <Label lines={1} className="text-[17px] font-bold">
            {title}
          </Label>
          <Label muted lines={1} className="text-[13px]">
            {subtitle}
          </Label>
          {extra && (
            <Label lines={1} className="text-[13px] text-lavender">
              {extra}
            </Label>
          )}
        </div>
        <IconButton name="close" label="Close" onPress={onClose} />
      </div>
      {fogSongId && <SongFog songId={fogSongId} />}
    </div>
  );
}

function SongFog({ songId }: { songId: string }) {
  const { tiles } = useSongFog(songId);
  if (!tiles.length) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="block flex-1">
        <FogStrip tiles={tiles} />
      </span>
      <FogBadge songId={songId} />
    </div>
  );
}

function MenuBody({ target }: { target: MenuTarget }) {
  const song = libraryStore((state) => (target.kind === 'song' ? state.bySong[target.id] : undefined));
  if (target.kind === 'song') {
    if (!song) return null;
    const info = songAnalysisInfo(song.id);
    return (
      <>
        <MenuHeader
          title={song.title}
          subtitle={song.artist}
          extra={info?.title}
          art={<Cover song={getAlbum(song.albumId) ?? song} size={56} />}
          fogSongId={song.id}
          onClose={closeMenu}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+8px)]">
          <SongActions song={song} position={target.position} />
        </div>
      </>
    );
  }
  const album = target.kind === 'album' ? getAlbum(target.id) : undefined,
    artist = target.kind === 'artist' ? getArtist(target.id) : undefined;
  const subject = album ?? artist;
  if (!subject) return null;
  return (
    <>
      <MenuHeader
        title={album?.title ?? artist?.name ?? ''}
        subtitle={album?.artist ?? 'Artist'}
        art={<Cover song={subject} size={56} />}
        onClose={closeMenu}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <CollectionActions target={target} />
      </div>
    </>
  );
}

const margin = 8;

/**
 * The song menu: a bottom sheet on the phone, a menu at the pointer (right-click) or under its "more" button on
 * desktop. One native `<dialog>` serves both, so Escape, focus and the backdrop click come for free. Mounted once in
 * the shell; open it with `openMenu` from `@/lib/songMenu`.
 */
export function SongMenuHost() {
  const target = menuStore((state) => state.target);
  const anchor = menuStore((state) => state.anchor);
  const desktop = useIsDesktop();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (target && !element.open) element.showModal();
    else if (!target && element.open) element.close();
  }, [target]);
  // Place the desktop menu next to its anchor, kept inside the window.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || !target || !desktop || !anchor) return;
    const { width, height } = element.getBoundingClientRect();
    const left = anchor.align === 'end' ? anchor.x - width : anchor.x;
    element.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
    element.style.top = `${Math.max(margin, Math.min(anchor.y, window.innerHeight - height - margin))}px`;
  });
  const popover = desktop;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click is the backdrop; Escape closes a modal dialog natively
    <dialog
      ref={dialog}
      aria-label="Menu"
      onClose={closeMenu}
      // Only a click on the dialog's own box (its backdrop) closes it.
      onClick={(event) => {
        if (event.target === event.currentTarget) closeMenu();
      }}
      className={
        popover
          ? 'fixed m-0 max-h-[80dvh] w-[340px] max-w-none flex-col overflow-hidden border border-track bg-header p-0 text-text backdrop:bg-transparent open:flex'
          : 'fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none translate-y-0 flex-col overflow-hidden bg-header p-0 text-text transition-transform duration-200 backdrop:bg-scrim open:flex starting:open:translate-y-full'
      }
    >
      {target && <MenuBody target={target} />}
    </dialog>
  );
}
