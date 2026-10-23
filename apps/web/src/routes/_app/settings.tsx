import { kashiServerUrl, setAnalysisToken } from '@kashi-koi/core/analysis/fetcher';
import { hasJapaneseLyrics } from '@kashi-koi/core/data/libraryVisibility';
import { logout, sessionStore } from '@kashi-koi/core/navidrome/session';
import { scanLyrics, syncLibrary } from '@kashi-koi/core/navidrome/sync';
import { setAnalysisServerUrl } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { answerTimes, settingsStore } from '@kashi-koi/core/store/settingsStore';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScreenHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Label, PixelToggle, Row, Segmented, SectionHeader } from '@/components/ui';

export const Route = createFileRoute('/_app/settings')({ component: SettingsScreen });

/** "4:02 PM" today, "Oct 21" before that. */
const when = (at: number | null) => {
  if (!at) return 'Never';
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
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
    <section className="flex flex-col gap-[10px]">
      <SectionHeader title={title} />
      {above}
      <div className="border-b border-track">{children}</div>
      {problem && (
        <Label className="block text-[13px]" style={{ color: colors.red }}>
          {problem}
        </Label>
      )}
    </section>
  );
}

/** Big pixel numbers for what the lyrics scan found. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <Label pixel className="text-[34px]">
        {value.toLocaleString()}
      </Label>
      <Label muted className="text-xs leading-4">
        {label}
      </Label>
    </div>
  );
}

/** Row with a right-aligned single-line input that commits when editing ends (blur or Enter). */
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
      <input
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        type={secure ? 'password' : 'text'}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        className="h-[50px] min-w-0 flex-[2] bg-transparent text-right text-[15px] text-text outline-none placeholder:text-muted"
      />
    </Row>
  );
}

/** Account, quiz pacing, library upkeep and the song analysis server. */
function SettingsScreen() {
  const [confirmingLogout, setConfirmingLogout] = useState(false),
    [loggingOut, setLoggingOut] = useState(false),
    [accountError, setAccountError] = useState<string | null>(null);
  const answerTime = settingsStore((state) => state.answerTime);
  const hiding = settingsStore((state) => state.hideSongsWithoutSyncedLyrics),
    hidingNonJapanese = settingsStore((state) => state.hideSongsWithoutJapanese),
    lastSync = settingsStore((state) => state.lastSyncAt),
    lastScan = settingsStore((state) => state.lastScanAt);
  const library = libraryStore((state) => state.songs),
    progress = libraryStore((state) => state.progress),
    error = libraryStore((state) => state.error),
    translationError = libraryStore((state) => state.translationError);
  const analysisServerUrl = settingsStore((state) => state.analysisServerUrl),
    analysisToken = settingsStore((state) => state.analysisToken),
    analyzed = libraryStore((state) => Object.values(state.lyrics).filter((lyrics) => lyrics.analysis).length);
  const session = sessionStore((state) => state.session);
  // Ready means synced Japanese lyrics. Translations don't change these.
  const { synced, ready, unsynced } = useMemo(
    () => ({
      synced: library.filter((song) => song.lyricsStatus === 'synced').length,
      ready: library.filter((song) => hasJapaneseLyrics(song.id)).length,
      unsynced: library.filter((song) => song.lyricsStatus === 'none').length,
    }),
    [library],
  );
  const scanning = progress && `${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}`;

  async function logOut() {
    setConfirmingLogout(false);
    setLoggingOut(true);
    setAccountError(null);
    try {
      await logout();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Could not log out');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <div className="flex max-w-[640px] flex-col gap-8 p-4 pb-12">
        <Section title="Account" problem={accountError}>
          <Row label={session?.username ?? ''} detail={session ? new URL(session.url).host : ''} />
          <Row
            label={loggingOut ? 'Logging out…' : 'Log out'}
            color={colors.coral}
            disabled={loggingOut}
            onPress={() => setConfirmingLogout(true)}
          />
        </Section>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Answer time" />
          <Segmented
            label="Answer time"
            value={answerTime}
            onChange={(value) => settingsStore.getState().setAnswerTime(value)}
            options={answerTimes.map((value) => ({ value, label: value === null ? 'No limit' : `${value}s` }))}
          />
          <Label muted className="block text-[13px]">
            {answerTime === null
              ? 'The song waits at each sentence until you answer.'
              : answerTime === 0
                ? 'The song never stops. Unanswered sentences count as misses.'
                : `The song waits ${answerTime} seconds at each sentence.`}
          </Label>
        </section>
        <Section
          title="Library"
          problem={translationError ?? error}
          above={
            <div className="flex items-center gap-[10px] pb-1.5">
              <Stat value={ready} label="Ready to learn" />
              <Stat value={synced - ready} label="Not Japanese" />
              <Stat value={unsynced} label="No synced lyrics" />
            </div>
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
        </Section>
        <Section title="Song analyses">
          <Field
            label="Server"
            value={analysisServerUrl}
            placeholder={kashiServerUrl}
            onCommit={setAnalysisServerUrl}
          />
          <Field
            // The token loads from secret storage after boot; remount so the field shows it.
            key={analysisToken ? 'token' : 'empty'}
            label="Admin token"
            value={analysisToken}
            placeholder="To analyze songs"
            secure
            onCommit={(token) => void setAnalysisToken(token)}
          />
          <Row label="Analyzed" detail={songs(analyzed)} />
        </Section>
      </div>
      {confirmingLogout && (
        <ConfirmDialog
          title="Log out?"
          confirmLabel="Log out"
          onConfirm={() => void logOut()}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </Screen>
  );
}
