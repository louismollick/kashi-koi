import { prepareTranslation } from '@/japanese/translate';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { colors } from '@/constants/theme';
import { libraryStore } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { refreshAlbumArt } from '@/store/artStore';
import { sessionStore, logout } from '@/navidrome/session';
import { syncLibrary, scanLyrics } from '@/navidrome/sync';
import { ScreenHeader } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, Label, PixelToggle, SectionHeader, styles } from '@/components/ui';

const date = (at: number | null) => (at ? new Date(at).toLocaleString() : 'never');

/** Framed single-line field that commits when editing ends, like Library search. */
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
    <View style={{ gap: 6 }}>
      <Label muted style={{ fontSize: 13 }}>
        {label}
      </Label>
      <PixelFrame fill={colors.panel} border={colors.track} contentStyle={{ paddingHorizontal: 12 }}>
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
          style={{ color: colors.text, height: 46, fontSize: 15 }}
        />
      </PixelFrame>
    </View>
  );
}

/** Account, library sync, artwork refresh and lyrics scan controls. */
export default function SettingsScreen() {
  const status = libraryStore((state) => state.translationStatus),
    translationProgress = libraryStore((state) => state.translationProgress),
    translationError = libraryStore((state) => state.translationError);
  const [downloading, setDownloading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false),
    [accountError, setAccountError] = useState<string | null>(null);
  const [refreshingArt, setRefreshingArt] = useState(false),
    [artMessage, setArtMessage] = useState<string | null>(null);
  const answerTime = appStore((state) => state.answerTime);
  const hiding = appStore((state) => state.hideSongsWithoutSyncedLyrics),
    hidingNonJapanese = appStore((state) => state.hideSongsWithoutJapanese),
    lastSync = appStore((state) => state.lastSyncAt),
    lastScan = appStore((state) => state.lastScanAt);
  const songs = libraryStore((state) => state.songs),
    progress = libraryStore((state) => state.progress),
    error = libraryStore((state) => state.error);
  const analysisServerUrl = appStore((state) => state.analysisServerUrl),
    analysisToken = appStore((state) => state.analysisToken),
    analyzed = libraryStore((state) => Object.values(state.lyrics).filter((lyrics) => lyrics.analysis).length);
  const session = sessionStore((state) => state.session),
    ready = songs.filter((song) => song.lyricsStatus === 'synced').length;
  return (
    <View style={styles.page}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Account" />
        <Label>{session ? new URL(session.url).host : ''}</Label>
        <Label>{session?.username}</Label>
        <Button
          label="Log out"
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
        >
          <Label>Log out</Label>
        </Button>
        {accountError && <Label style={{ color: colors.red }}>{accountError}</Label>}
        <SectionHeader title="Quiz" />
        <View style={styles.row}>
          <Label style={{ flex: 1 }}>Answer time</Label>
          <Button label="Answer time" onPress={() => appStore.getState().cycleAnswerTime()}>
            <Label>{answerTime === null ? 'No limit' : `${answerTime}s`}</Label>
          </Button>
        </View>
        <SectionHeader title="Song analyses" />
        <Field
          label="Server"
          value={analysisServerUrl}
          placeholder={process.env.EXPO_PUBLIC_KASHI_SERVER_URL || 'https://'}
          onCommit={(url) => appStore.getState().setAnalysisServerUrl(url)}
        />
        <Field
          key={analysisToken ? 'token' : 'empty'}
          label="Admin token"
          value={analysisToken}
          placeholder="Only needed to analyze songs"
          secure
          onCommit={(token) => void appStore.getState().setAnalysisToken(token)}
        />
        <Label muted>{analyzed} songs analyzed</Label>
        <SectionHeader title="Library" />
        <View style={styles.row}>
          <Label style={{ flex: 1 }}>Hide songs without synced lyrics</Label>
          <PixelToggle
            label="Hide songs without synced lyrics"
            on={hiding}
            onPress={() => appStore.getState().toggleHideSongsWithoutSyncedLyrics()}
          />
        </View>
        <View style={styles.row}>
          <Label style={{ flex: 1 }}>Hide songs without Japanese lyrics</Label>
          <PixelToggle
            label="Hide songs without Japanese lyrics"
            on={hidingNonJapanese}
            onPress={() => appStore.getState().toggleHideSongsWithoutJapanese()}
          />
        </View>
        <Button
          label="Sync library"
          disabled={!!progress}
          onPress={() => {
            void syncLibrary();
          }}
        >
          <Label>Sync library</Label>
        </Button>
        <Label muted>Last sync: {date(lastSync)}</Label>
        <Button
          label="Refresh album art"
          disabled={refreshingArt}
          onPress={async () => {
            setRefreshingArt(true);
            setArtMessage(null);
            try {
              await refreshAlbumArt();
              setArtMessage('Album art cache cleared');
            } catch {
              setArtMessage('Could not clear album art cache');
            } finally {
              setRefreshingArt(false);
            }
          }}
        >
          <Label>Refresh album art</Label>
        </Button>
        {artMessage && <Label>{artMessage}</Label>}
        <SectionHeader title="Lyrics scan" />
        <Button
          label="Rescan lyrics"
          fill={colors.coral}
          disabled={!!progress}
          onPress={() => {
            void scanLyrics({ all: true });
          }}
        >
          <Label>Rescan lyrics</Label>
        </Button>
        <Label>
          {ready} songs ready to learn · {songs.filter((song) => song.lyricsStatus === 'none').length} without synced
          lyrics
        </Label>
        <Label muted>Last scan: {date(lastScan)}</Label>
        {progress && (
          <Label>
            {progress.kind === 'sync' ? 'Syncing library' : 'Checking lyrics'}… {progress.completed} / {progress.total}
          </Label>
        )}
        <View style={styles.row}>
          <Label style={{ flex: 1 }}>
            Japanese translation:{' '}
            {status === 'installed' ? 'Installed' : status === 'unsupported' ? 'Unavailable' : 'Not installed'}
          </Label>
          {status === 'supported' && (
            <Button
              label="Download Japanese translation"
              disabled={downloading}
              onPress={async () => {
                setDownloading(true);
                try {
                  await prepareTranslation();
                } catch {
                  libraryStore.setState({ translationError: 'Could not download Japanese translation' });
                } finally {
                  setDownloading(false);
                }
              }}
            >
              <Label>Download</Label>
            </Button>
          )}
        </View>
        {translationProgress && (
          <Label>
            Translating… {translationProgress.completed} / {translationProgress.total}
          </Label>
        )}
        {translationError && <Label style={{ color: colors.red }}>{translationError}</Label>}
        {error && <Label style={{ color: colors.red }}>{error}</Label>}
      </ScrollView>
    </View>
  );
}
