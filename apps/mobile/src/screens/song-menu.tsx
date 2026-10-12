import { translationHint } from '@/japanese/translate';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { queueDownloads, removeDownloads, useDownloadSummary } from '@/downloads';
import { getAlbum, hasTranslations, libraryStore, songAnalysisInfo } from '@/store/libraryStore';
import { appStore, canAnalyze } from '@/store/appStore';
import { Cover } from '@/components/Cover';
import { FogBadge, FogStrip, useSongFog } from '@/components/Fog';
import { IconButton, Label, PixelToggle, styles } from '@/components/ui';
import type { ReactNode } from 'react';

/** Route to the song menu, for long presses and ⋯ buttons. */
export const songMenu = (id: string) => ({
  pathname: '/song-menu' as const,
  params: { id },
});

/**
 * One full-width row: label left, detail or control right. Without `onPress` it's a plain row, so VoiceOver reaches
 * the control inside it.
 */
function Row({
  label,
  detail,
  onPress,
  disabled = false,
  color = colors.text,
  children,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
  children?: ReactNode;
}) {
  const row = [styles.row, { minHeight: 52, borderTopWidth: 1, borderTopColor: colors.track }],
    content = (
      <>
        <Label style={{ flex: 1, fontSize: 16, color }}>{label}</Label>
        {detail && (
          <Label muted numberOfLines={1} style={{ fontSize: 14, maxWidth: '55%' }}>
            {detail}
          </Label>
        )}
        {children}
      </>
    );
  if (!onPress) return <View style={[row, { opacity: disabled ? 0.45 : 1 }]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [row, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

/** Everything you can do with one song, from the player's ⋯, a long press, or the full player. */
export default function SongMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const song = libraryStore((state) => state.bySong[id]);
  const lyrics = libraryStore((state) => state.lyrics[id]);
  libraryStore((state) => state.translationSongIds.has(id));
  libraryStore((state) => state.translationStatus);
  const current = appStore((state) => state.songId === id);
  const offline = appStore((state) => state.offlineMode);
  const showTranslations = appStore((state) => state.showTranslations);
  const useAnalysis = appStore((state) => !state.lineByLineSongIds.includes(id));
  const request = appStore((state) => state.analysisRequests[id]);
  appStore((state) => state.analysisToken + state.analysisServerUrl);
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
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#090a1699' }}>
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
                <Label numberOfLines={1} style={{ fontSize: 13, fontStyle: 'italic', color: colors.lavender }}>
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
          {!current && (
            <>
              <Row label="Play next" onPress={act(() => appStore.getState().playNext(id))} />
              <Row label="Add to queue" onPress={act(() => appStore.getState().addToQueue(id))} />
            </>
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
                <ActivityIndicator size="small" color={colors.muted} />
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
                onPress={() => appStore.getState().toggleTranslations()}
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
                    onPress={() => appStore.getState().setListenAnalysisEnabled(id, enabled)}
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
              onPress={() => void appStore.getState().analyzeSong(id, { force: request.force })}
            />
          ) : request ? (
            <Row label={request.status === 'running' ? 'Analyzing song' : 'Analysis queued'} disabled>
              <ActivityIndicator size="small" color={colors.lavender} />
            </Row>
          ) : (
            canAnalyze() &&
            synced && (
              <Row
                label={info ? 'Re-analyze song' : 'Analyze song'}
                onPress={() => void appStore.getState().analyzeSong(id, { force: !!info })}
              />
            )
          )}
        </ScrollView>
      </View>
    </View>
  );
}
