import { setAnalysisToken } from '@/analysis/fetcher';
import { prepareTranslation } from '@/japanese/translate';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { colors, font } from '@/constants/theme';
import { libraryStore } from '@/store/libraryStore';
import { hasJapaneseLyrics } from '@/data/libraryVisibility';
import { setAnalysisServerUrl } from '@/store/appStore';
import { answerTimes, settingsStore } from '@/store/settingsStore';
import { refreshAlbumArt } from '@/store/artStore';
import { sessionStore, logout } from '@/navidrome/session';
import { syncLibrary, scanLyrics, setOfflineMode } from '@/navidrome/sync';
import {
  deleteAllDownloads,
  queueDownloads,
  retryFailedDownloads,
  useDownloadProgress,
  useDownloadStorage,
  useDownloadSummary,
} from '@/downloads';
import { ScreenHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Label, PixelToggle, Row, SectionHeader, Segmented, styles } from '@/components/ui';

/** "4:02 PM" today, "Oct 21" before that. */
const when = (at: number | null) => {
  if (!at) return 'Never';
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const size = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
const songs = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'song' : 'songs'}`;

/** A pixel title, anything shown `above` the rows, the rows closed by a hairline, then any `problem` in red. */
function Section({
  title,
  above,
  problem,
  children,
}: {
  title: string;
  above?: ReactNode;
  problem?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={title} />
      {above}
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.track }}>{children}</View>
      {problem && <Label style={{ color: colors.red, fontSize: 13 }}>{problem}</Label>}
    </View>
  );
}

/** Big pixel numbers for what the lyrics scan found. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Label pixel style={{ fontSize: 26, lineHeight: 30, fontWeight: '700' }}>
        {value.toLocaleString()}
      </Label>
      <Label muted style={{ fontSize: 12, lineHeight: 16 }}>
        {label}
      </Label>
    </View>
  );
}

/** Row with a right-aligned single-line input that commits when editing ends, like Library search. */
function Field({
  label,
  value,
  placeholder,
  secure = false,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  secure?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Row label={label}>
      <TextInput
        accessibilityLabel={label}
        value={draft}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onChangeText={setDraft}
        onEndEditing={() => onCommit(draft)}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ ...font('body'), flex: 2, color: colors.text, height: 50, fontSize: 15, textAlign: 'right' }}
      />
    </Row>
  );
}

/** Offline mode, whole-library downloads and the pinned download storage. */
function OfflineSection() {
  const offline = settingsStore((state) => state.offlineMode);
  const library = useDownloadSummary({ kind: 'library' }),
    storage = useDownloadStorage(),
    progress = useDownloadProgress();
  const missing = library.eligible - library.done - library.pending;
  return (
    <Section title="Offline">
      <Row label="Offline mode">
        <PixelToggle label="Offline mode" on={offline} onPress={() => setOfflineMode(!offline)} />
      </Row>
      <Row
        label="Downloaded"
        detail={
          progress
            ? `Downloading ${progress.completed} / ${progress.total}`
            : `${storage.songs} of ${songs(library.eligible)}${storage.bytes ? ` · ${size(storage.bytes)}` : ''}`
        }
      />
      {missing > 0 && (
        <Row
          label="Download library"
          detail={songs(missing)}
          disabled={offline}
          color={colors.coral}
          onPress={() => void queueDownloads({ kind: 'library' })}
        />
      )}
      {library.failed > 0 && !progress && (
        <Row
          label="Retry failed downloads"
          detail={songs(library.failed)}
          disabled={offline}
          onPress={() => void retryFailedDownloads()}
        />
      )}
      {(storage.songs > 0 || library.pending > 0) && (
        <Row
          label="Delete downloads"
          color={colors.red}
          onPress={() =>
            Alert.alert('Delete downloads?', 'Songs and artwork saved for offline use will be removed.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void deleteAllDownloads() },
            ])
          }
        />
      )}
    </Section>
  );
}

/** Account, quiz pacing, library upkeep, offline downloads and the song analysis server. */
export default function SettingsScreen() {
  const status = libraryStore((state) => state.translationStatus),
    translationProgress = libraryStore((state) => state.translationProgress),
    translationError = libraryStore((state) => state.translationError);
  const [downloading, setDownloading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false),
    [accountError, setAccountError] = useState<string | null>(null);
  const [refreshingArt, setRefreshingArt] = useState(false),
    [artMessage, setArtMessage] = useState<string | null>(null);
  const answerTime = settingsStore((state) => state.answerTime);
  const hiding = settingsStore((state) => state.hideSongsWithoutSyncedLyrics),
    hidingNonJapanese = settingsStore((state) => state.hideSongsWithoutJapanese),
    lastSync = settingsStore((state) => state.lastSyncAt),
    lastScan = settingsStore((state) => state.lastScanAt);
  const library = libraryStore((state) => state.songs),
    progress = libraryStore((state) => state.progress),
    error = libraryStore((state) => state.error);
  const analysisServerUrl = settingsStore((state) => state.analysisServerUrl),
    analysisToken = settingsStore((state) => state.analysisToken),
    analyzed = libraryStore((state) => Object.values(state.lyrics).filter((lyrics) => lyrics.analysis).length);
  const lyrics = libraryStore((state) => state.lyrics);
  const session = sessionStore((state) => state.session);
  // Ready means synced Japanese lyrics, the same songs Download library counts. Scan and translation ticks don't change these.
  const { synced, ready, unsynced } = useMemo(
    () => ({
      synced: library.filter((song) => song.lyricsStatus === 'synced').length,
      ready: library.filter((song) => hasJapaneseLyrics(song.id)).length,
      unsynced: library.filter((song) => song.lyricsStatus === 'none').length,
    }),
    [library, lyrics],
  );
  const scanning = progress && `${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}`;
  return (
    <View style={styles.page}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 32 }}>
        <Section title="Account" problem={accountError}>
          <Row label={session?.username ?? ''} detail={session ? new URL(session.url).host : ''} />
          <Row
            label={loggingOut ? 'Logging out…' : 'Log out'}
            color={colors.coral}
            disabled={loggingOut}
            onPress={async () => {
              setLoggingOut(true);
              setAccountError(null);
              try {
                await logout();
              } catch (error) {
                setAccountError(error instanceof Error ? error.message : 'Could not log out');
              } finally {
                setLoggingOut(false);
              }
            }}
          />
        </Section>
        <View style={{ gap: 12 }}>
          <SectionHeader title="Answer time" />
          <Segmented
            label="Answer time"
            value={answerTime}
            onChange={(value) => settingsStore.getState().setAnswerTime(value)}
            options={answerTimes.map((value) => ({ value, label: value === null ? 'No limit' : `${value}s` }))}
          />
          <Label muted style={{ fontSize: 13 }}>
            {answerTime === null
              ? 'The song waits at each sentence until you answer.'
              : answerTime === 0
                ? 'The song never stops. Unanswered sentences count as misses.'
                : `The song waits ${answerTime} seconds at each sentence.`}
          </Label>
        </View>
        <Section
          title="Library"
          problem={translationError ?? error}
          above={
            <View style={[styles.row, { paddingBottom: 6 }]}>
              <Stat value={ready} label="Ready to learn" />
              <Stat value={synced - ready} label="Not Japanese" />
              <Stat value={unsynced} label="No synced lyrics" />
            </View>
          }
        >
          <Row label="Hide songs without synced lyrics">
            <PixelToggle
              label="Hide songs without synced lyrics"
              on={hiding}
              onPress={() => settingsStore.getState().toggleHideSongsWithoutSyncedLyrics()}
            />
          </Row>
          <Row label="Hide songs without Japanese">
            <PixelToggle
              label="Hide songs without Japanese lyrics"
              on={hidingNonJapanese}
              onPress={() => settingsStore.getState().toggleHideSongsWithoutJapanese()}
            />
          </Row>
          <Row
            label="Sync library"
            detail={progress?.kind === 'sync' ? `Syncing ${scanning}` : when(lastSync)}
            disabled={!!progress}
            onPress={() => void syncLibrary()}
          >
            <Icon name="refresh" size={18} color={colors.lavender} />
          </Row>
          <Row
            label="Rescan lyrics"
            detail={progress?.kind === 'scan' ? `Checking ${scanning}` : when(lastScan)}
            disabled={!!progress}
            onPress={() => void scanLyrics({ all: true })}
          >
            <Icon name="refresh" size={18} color={colors.lavender} />
          </Row>
          <Row
            label="Refresh album art"
            detail={refreshingArt ? 'Clearing…' : (artMessage ?? undefined)}
            disabled={refreshingArt}
            onPress={async () => {
              setRefreshingArt(true);
              setArtMessage(null);
              try {
                await refreshAlbumArt();
                setArtMessage('Cache cleared');
              } catch {
                setArtMessage('Could not clear');
              } finally {
                setRefreshingArt(false);
              }
            }}
          >
            <Icon name="refresh" size={18} color={colors.lavender} />
          </Row>
          <Row
            label="Japanese translation"
            detail={
              translationProgress
                ? `Translating ${translationProgress.completed} / ${translationProgress.total}`
                : status === 'installed'
                  ? 'Installed'
                  : status === 'unsupported'
                    ? 'Unavailable'
                    : downloading
                      ? 'Downloading…'
                      : 'Download'
            }
            disabled={downloading}
            onPress={
              status === 'supported'
                ? async () => {
                    setDownloading(true);
                    try {
                      await prepareTranslation();
                    } catch {
                      libraryStore.setState({ translationError: 'Could not download Japanese translation' });
                    } finally {
                      setDownloading(false);
                    }
                  }
                : undefined
            }
          />
        </Section>
        <OfflineSection />
        <Section title="Song analyses">
          <Field
            label="Server"
            value={analysisServerUrl}
            placeholder={process.env.EXPO_PUBLIC_KASHI_SERVER_URL || 'https://'}
            onCommit={setAnalysisServerUrl}
          />
          <Field
            key={analysisToken ? 'token' : 'empty'}
            label="Admin token"
            value={analysisToken}
            placeholder="To analyze songs"
            secure
            onCommit={(token) => void setAnalysisToken(token)}
          />
          <Row label="Analyzed" detail={songs(analyzed)} />
        </Section>
      </ScrollView>
    </View>
  );
}
