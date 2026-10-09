import { translationHint } from '@/japanese/translate';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/theme';
import { hasTranslations, libraryStore, songAnalysisInfo } from '@/store/libraryStore';
import { appStore, canAnalyze } from '@/store/appStore';
import { ScreenHeader } from '@/components/Header';
import { SongIntro } from '@/components/SongIntro';
import { Button, Label, SectionHeader, styles } from '@/components/ui';

/** One song's song analysis and where its translations come from, with Analyze for the admin. */
export default function SongInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = libraryStore((state) => state.bySong[id]);
  const lyrics = libraryStore((state) => state.lyrics[id]);
  const useAnalysis = appStore((state) => !state.lineByLineSongIds.includes(id));
  libraryStore((state) => state.translationSongIds.has(id));
  libraryStore((state) => state.translationStatus);
  const request = appStore((state) => state.analysisRequests[id]);
  appStore((state) => state.analysisToken + state.analysisServerUrl);
  const info = songAnalysisInfo(id);
  const analyze = (force: boolean) => void appStore.getState().analyzeSong(id, { force });

  return (
    <View style={styles.page}>
      <ScreenHeader title={song?.title} subtitle={song?.artist} />
      <ScrollView contentContainerStyle={styles.content}>
        {info && <SongIntro info={info} />}
        <SectionHeader title="Translation" />
        {info && (
          <View style={styles.row}>
            {[
              { label: 'iOS (line by line)', enabled: false },
              { label: 'Song analysis', enabled: true },
            ].map(({ label, enabled }) => (
              <Pressable
                key={label}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ checked: useAnalysis === enabled }}
                onPress={() => appStore.getState().setListenAnalysisEnabled(id, enabled)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: useAnalysis === enabled ? colors.lavender : colors.track,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Label muted={useAnalysis !== enabled} style={{ fontWeight: '700' }}>
                  {label}
                </Label>
              </Pressable>
            ))}
          </View>
        )}
        <Label muted>
          {!lyrics?.timeline.length
            ? 'No synced lyrics'
            : info && useAnalysis
              ? 'Song analysis'
              : (info ? lyrics.lines.some((line) => line.translation) : hasTranslations(id))
                ? 'Line by line'
                : translationHint(id)}
        </Label>
        {request?.status === 'failed' ? (
          <View style={styles.row}>
            <Label numberOfLines={3} style={{ flex: 1, color: colors.red }}>
              {request.error ?? 'Analysis failed'}
            </Label>
            <Button label="Retry analysis" onPress={() => analyze(request.force)}>
              <Label style={{ fontWeight: '700' }}>RETRY</Label>
            </Button>
          </View>
        ) : request ? (
          <View style={[styles.row, { minHeight: 48 }]}>
            <ActivityIndicator size="small" color={colors.lavender} />
            <Label muted>{request.status === 'running' ? 'Analyzing song' : 'Analysis queued'}</Label>
          </View>
        ) : (
          canAnalyze() &&
          !!lyrics?.timeline.length && (
            <Button
              label={info ? 'Analyze song again' : 'Analyze song'}
              fill={info ? colors.slate : colors.lavender}
              border={info ? undefined : null}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => analyze(!!info)}
            >
              <Label style={{ fontWeight: '700', color: info ? colors.text : colors.bg }}>
                {info ? 'RE-ANALYZE' : 'ANALYZE'}
              </Label>
            </Button>
          )
        )}
      </ScrollView>
    </View>
  );
}
