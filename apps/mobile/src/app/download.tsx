import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { queueDownloads, removeDownloads, useDownloadSummary } from '@/downloads';
import type { SheetTarget } from '@/routes';
import { appStore } from '@/store/appStore';
import { settingsStore } from '@/store/settingsStore';
import { getAlbum, getAlbumSongs, getArtist, getArtistAlbums, getArtistSongs, getSong } from '@/store/libraryStore';
import { getLibraryFilters, getVisibleSongs } from '@/data/libraryVisibility';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Button, IconButton, Label, styles } from '@/components/ui';

/** What the sheet header shows for a song, album or artist. */
function describe(target: SheetTarget) {
  if (target.kind === 'song') {
    const song = getSong(target.id);
    return song && { title: song.title, subtitle: song.artist, art: getAlbum(song.albumId) ?? song };
  }
  if (target.kind === 'album') {
    const album = getAlbum(target.id);
    return album && { title: album.title, subtitle: album.artist, art: album };
  }
  const artist = getArtist(target.id);
  return artist && { title: artist.name, subtitle: 'Discography', art: getArtistAlbums(artist.id)[0] ?? artist };
}

/** Visible song ids an album or artist adds to the queue. */
function queueable(target: SheetTarget) {
  const songs =
    target.kind === 'album' ? getAlbumSongs(target.id) : target.kind === 'artist' ? getArtistSongs(target.id) : [];
  return getVisibleSongs(songs, getLibraryFilters()).map((song) => song.id);
}

/**
 * Bottom sheet from a long press or a page's download button: queue an album or artist, and download or remove
 * offline copies.
 */
export default function DownloadScreen() {
  const params = useLocalSearchParams<{ kind: 'song' | 'album' | 'artist'; id: string }>();
  const target = { kind: params.kind, id: params.id };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offline = settingsStore((state) => state.offlineMode);
  const { eligible, done, pending, failed } = useDownloadSummary(target);
  const item = describe(target);
  const missing = eligible - done - pending;
  const single = target.kind === 'song';
  const status = !eligible
    ? 'Needs synced Japanese lyrics'
    : pending
      ? `Downloading ${done} of ${eligible}`
      : done === eligible
        ? single
          ? 'Downloaded'
          : `All ${eligible} ${eligible === 1 ? 'song' : 'songs'} downloaded`
        : single
          ? failed
            ? 'Download failed'
            : 'Not downloaded'
          : `${done} of ${eligible} ${eligible === 1 ? 'song' : 'songs'} downloaded${failed ? ` · ${failed} failed` : ''}`;
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={{ flex: 1 }}
      />
      <View style={{ backgroundColor: colors.header, padding: 16, paddingBottom: insets.bottom + 16, gap: 16 }}>
        <View style={styles.row}>
          {item && <Cover song={item.art} size={56} />}
          <View style={{ flex: 1 }}>
            <Label numberOfLines={1} style={{ fontSize: 17, fontWeight: '700' }}>
              {item?.title ?? 'Not found'}
            </Label>
            <Label muted numberOfLines={1} style={{ fontSize: 13 }}>
              {item?.subtitle}
            </Label>
          </View>
          <IconButton name="close" label="Close" onPress={() => router.back()} />
        </View>
        <View style={[styles.row, { gap: 8 }]}>
          {!!eligible && done === eligible && <Icon name="downloaded" color={colors.green} size={18} />}
          <Label muted style={{ fontSize: 14 }}>
            {status}
          </Label>
        </View>
        {!single && (
          <View style={styles.row}>
            {(['Play next', 'Add to queue'] as const).map((label) => (
              <Button
                key={label}
                label={label}
                border="#4b4f80"
                style={{ flex: 1 }}
                onPress={() => {
                  const ids = queueable(target);
                  if (label === 'Play next') appStore.getState().playNext(ids);
                  else appStore.getState().addToQueue(ids);
                  router.back();
                }}
              >
                <Label style={{ fontWeight: '700' }}>{label}</Label>
              </Button>
            ))}
          </View>
        )}
        {missing > 0 && (
          <Button
            label={single ? 'Download' : `Download ${missing} songs`}
            fill={colors.coral}
            border={colors.coralBorder}
            disabled={offline}
            onPress={() => {
              void queueDownloads(target);
              router.back();
            }}
          >
            <View style={styles.row}>
              <Icon name="download" size={20} />
              <Label style={{ fontWeight: '700' }}>
                {offline
                  ? 'Go online to download'
                  : single
                    ? failed
                      ? 'Retry download'
                      : 'Download'
                    : `Download ${missing}${missing === eligible ? '' : ' more'} ${missing === 1 ? 'song' : 'songs'}`}
              </Label>
            </View>
          </Button>
        )}
        {done + pending > 0 && (
          <Button
            label={pending && !done ? 'Cancel download' : 'Remove download'}
            onPress={() => {
              void removeDownloads(target);
              router.back();
            }}
          >
            <View style={styles.row}>
              <Icon name="trash" size={20} color={colors.muted} />
              <Label>{pending && !done ? 'Cancel download' : single ? 'Remove download' : 'Remove downloads'}</Label>
            </View>
          </Button>
        )}
      </View>
    </View>
  );
}
