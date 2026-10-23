import { analysisRequests, analyzeSong, canAnalyze } from '@kashi-koi/core/analysis/fetcher';
import { prioritizeTranslations, translationHint } from '@kashi-koi/core/japanese/translate';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { PixelSpinner } from '@/components/PixelSpinner';
import { queueDownloads, removeDownloads, useDownloadSummary } from '@kashi-koi/core/downloads';
import { getAlbum, hasTranslations, libraryStore, songAnalysisInfo } from '@kashi-koi/core/store/libraryStore';
import { appStore } from '@kashi-koi/core/store/appStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { Cover } from '@/components/Cover';
import { FogBadge, FogStrip, useSongFog } from '@/components/Fog';
import { IconButton, Label, PixelToggle, Row, styles } from '@/components/ui';

/** Everything you can do with one song, from the player's ⋯, a long press, or the full player. */
export default function SongMenuScreen() {
  const params = useLocalSearchParams<{ id: string; position?: string }>(),
    id = params.id,
    position = params.position === undefined ? undefined : Number(params.position);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const song = libraryStore((state) => state.bySong[id]);
  const lyrics = libraryStore((state) => state.lyrics[id]);
  libraryStore((state) => state.translationSongIds.has(id));
  libraryStore((state) => state.translationStatus);
  const current = appStore((state) => state.songId === id);
  const repeat = appStore((state) => state.repeatSongId === id);
  const offline = settingsStore((state) => state.offlineMode);
  const showTranslations = settingsStore((state) => state.showTranslations);
  const useAnalysis = settingsStore((state) => !state.lineByLineSongIds.includes(id));
  const request = analysisRequests((requests) => requests[id]);
  settingsStore((state) => state.analysisToken + state.analysisServerUrl);
  const { tiles } = useSongFog(id);
  const download = useDownloadSummary({ kind: 'song', id });
  const info = songAnalysisInfo(id);
  const synced = !!lyrics?.timeline.length;
  // Each action closes the menu first.
  const act = (action: () => void) => () => {
    router.back();
    action();
  };
  // Library pages live in the tabs, so close the menu and any player screens above them first.
  const goTo = (href: Href) => () => {
    router.dismissAll();
    router.navigate(href);
  };
  if (!song) return null;
  const album = getAlbum(song.albumId);
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={{ flex: 1 }}
      />
      <View style={{ backgroundColor: colors.header, maxHeight: '85%' }}>
        <View style={{ padding: 16, paddingBottom: 12, gap: 12 }}>
          <View style={styles.row}>
            <Cover song={album ?? song} size={56} />
            <View style={{ flex: 1 }}>
              <Label numberOfLines={1} style={{ fontSize: 17, fontWeight: '700' }}>
                {song.title}
              </Label>
              <Label muted numberOfLines={1} style={{ fontSize: 13 }}>
                {song.artist}
              </Label>
              {info && (
                <Label numberOfLines={1} style={{ fontSize: 13, color: colors.lavender }}>
                  {info.title}
                </Label>
              )}
            </View>
            <IconButton name="close" label="Close" onPress={() => router.back()} />
          </View>
          {tiles.length > 0 && (
            <View style={[styles.row, { gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <FogStrip tiles={tiles} />
              </View>
              <FogBadge songId={id} />
            </View>
          )}
        </View>
        <ScrollView bounces={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 8 }}>
          {current ? (
            <Row label="Repeat song">
              <PixelToggle
                label="Repeat song"
                on={repeat}
                onPress={() => appStore.getState().setRepeatSong(id, !repeat)}
              />
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
            onPress={goTo({ pathname: '/library/album/[id]', params: { id: song.albumId } })}
          />
          <Row
            label="Go to artist"
            detail={song.artist}
            onPress={goTo({ pathname: '/library/artist/[id]', params: { id: song.artistId } })}
          />
          {download.eligible > 0 &&
            (download.done ? (
              <Row label="Remove download" onPress={act(() => void removeDownloads({ kind: 'song', id }))} />
            ) : download.pending ? (
              <Row label="Cancel download" onPress={act(() => void removeDownloads({ kind: 'song', id }))}>
                <PixelSpinner color={colors.muted} />
              </Row>
            ) : (
              <Row
                label={offline ? 'Go online to download' : download.failed ? 'Retry download' : 'Download'}
                disabled={offline}
                onPress={act(() => void queueDownloads({ kind: 'song', id }))}
              />
            ))}
          {synced && (
            <Row label="Translations">
              <PixelToggle
                label="Translations"
                on={showTranslations}
                onPress={() => settingsStore.getState().toggleTranslations()}
              />
            </Row>
          )}
          {synced && info && (
            <Row label="Translation source">
              <View style={[styles.row, { gap: 0 }]}>
                {[
                  { label: 'Line by line', enabled: false },
                  { label: 'Song analysis', enabled: true },
                ].map(({ label, enabled }) => (
                  <Pressable
                    key={label}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    accessibilityState={{ checked: useAnalysis === enabled }}
                    onPress={() => {
                      settingsStore.getState().setListenAnalysisEnabled(id, enabled);
                      // Line-by-line display needs the song's line translations soon.
                      if (!enabled) prioritizeTranslations([id]);
                    }}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 10,
                      justifyContent: 'center',
                      borderBottomWidth: 2,
                      borderBottomColor: useAnalysis === enabled ? colors.lavender : colors.track,
                    }}
                  >
                    <Label muted={useAnalysis !== enabled} style={{ fontSize: 14, fontWeight: '700' }}>
                      {label}
                    </Label>
                  </Pressable>
                ))}
              </View>
            </Row>
          )}
          {synced && !info && !request && !hasTranslations(id) && <Row label={translationHint(id)} disabled />}
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
        </ScrollView>
      </View>
    </View>
  );
}
