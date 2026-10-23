import { canExplain } from '@kashi-koi/core/analysis/breakdowns';
import { analysisRequests } from '@kashi-koi/core/analysis/fetcher';
import { appStore } from '@kashi-koi/core/store/appStore';
import {
  currentSentence,
  hasTranslations,
  libraryStore,
  sentenceOccurrenceAt,
  songAnalysisInfo,
} from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import type { Line, Song } from '@kashi-koi/core/types/domain';
import { cn } from '@/lib/cn';
import { colors } from '@kashi-koi/design/tokens';
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { closePanel, openBreakdown, panelStore } from '@/lib/panels';
import { openMenuFrom } from '@/lib/songMenu';
import { BreakdownView } from './BreakdownView';
import { EditLineView } from './EditLineView';
import { ScreenHeader } from './Header';
import { Mascot } from './Mascot';
import { LyricRow, CenteredList } from './Lyrics';
import { PixelSpinner } from './PixelSpinner';
import { PlayerBar } from './PlayerBar';
import { AddedToast, RunEndToast } from './PlayerToasts';
import { QuizColumn } from './QuizLayout';
import { SongIntro } from './SongIntro';
import { SpeedButton } from './SpeedButton';
import { UpNext } from './UpNext';
import { Button, IconButton, Label, PixelToggle } from './ui';

/** Shown wherever a song has no translations: web has no on-device translation, only song analyses. */
const noAnalysis = 'No song analysis yet';

/** One tappable listen-mode lyric; a click jumps to the line. Takes only primitives so the memo skips untouched rows. */
const ListenRow = memo(function ListenRow({
  line,
  index,
  current,
  furigana,
  translation,
  marked,
}: {
  line: Line;
  index: number;
  current: boolean;
  furigana: boolean;
  translation?: string;
  marked: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`Play line ${index + 1}`}
      onClick={() => appStore.getState().jumpToLine(index)}
      className="block w-full text-left transition-[filter] hover:brightness-125"
    >
      <LyricRow line={line} current={current} furigana={furigana} translation={translation} marked={marked} />
    </button>
  );
});

/** Pixel-font action label on the big player buttons. */
const bigLabel = 'text-[23px] tracking-[0.5px]';

/** ListenMode and QuizMode share one body: analysis status, lyrics or the quiz column, and the playback error. */
function PlayerBody({ song }: { song: Song }) {
  const songId = song.id;
  const lineIndex = appStore((state) => state.lineIndex);
  const showTranslations = settingsStore((state) => state.showTranslations);
  const quizToggle = appStore((state) => state.quizToggle);
  const answerWait = appStore((state) => state.answerWait);
  const run = appStore((state) => state.run);
  const reviewList = appStore((state) => state.reviewList);
  const addedId = appStore((state) => state.addedId);
  const addedExpiresAt = appStore((state) => state.addedExpiresAt);
  const runEnd = appStore((state) => state.runEnd);
  const loading = appStore((state) => state.loading);
  const playbackError = appStore((state) => state.playbackError);
  const lyrics = libraryStore((state) => state.lyrics[songId]);
  const request = analysisRequests((requests) => requests[songId]);
  const timeline = lyrics?.timeline ?? [];
  const lines = useMemo(
    () => lyrics?.timeline.map((occurrence) => lyrics.lines.find((line) => line.id === occurrence.lineId)!) ?? [],
    [lyrics],
  );
  // The sentence each line belongs to, if any.
  const sentenceAt = useMemo(
    () =>
      lyrics?.timeline.map((_, index) =>
        lyrics.sentenceTimeline.find((item) => item.start <= index && item.end >= index),
      ) ?? [],
    [lyrics],
  );
  const translated = hasTranslations(songId);
  const sentences = lyrics?.sentenceTimeline ?? [];
  // While the quiz holds a sentence, it stays current even if playback has moved past its last line.
  const occurrence = answerWait?.occurrence ?? sentenceOccurrenceAt(songId, lineIndex);
  const current = occurrence ? currentSentence(songId, occurrence.start) : undefined;
  const sentenceId = current?.sentence.id;
  const info = songAnalysisInfo(songId);
  const beforeLyrics = lineIndex < (sentences[0]?.start ?? 0);
  const selectedAnswer = sentenceId ? (run.answers[sentenceId]?.choice ?? null) : null;
  const showToast = addedId !== null && addedExpiresAt !== null && Date.now() < addedExpiresAt;
  const inReview = !!sentenceId && reviewList.some((item) => item.sentenceId === sentenceId);
  const canAdd = !!sentenceId && !inReview;
  const reviewed = new Set(reviewList.filter((item) => item.songId === songId).map((item) => item.sentenceId));
  const explainable = canExplain(songId);
  const explain = (id: string) => openBreakdown(songId, id);
  // The toast dismisses itself when its undo window closes.
  useEffect(() => {
    if (!addedId || addedExpiresAt === null) return;
    const timer = setTimeout(() => appStore.getState().dismissToast(), Math.max(0, addedExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [addedId, addedExpiresAt]);
  const status = request ? (
    <button
      type="button"
      aria-label="Song info"
      onClick={(event) => openMenuFrom(event.currentTarget, { kind: 'song', id: songId })}
      className="flex min-h-10 w-full items-center gap-[10px] px-4 text-left"
    >
      {request.status === 'failed' ? (
        <Label lines={1} className="flex-1" style={{ color: colors.red }}>
          Analysis failed
        </Label>
      ) : (
        <>
          <PixelSpinner color={colors.lavender} />
          <Label muted className="flex-1">
            {request.status === 'running' ? 'Analyzing song' : 'Analysis queued'}
          </Label>
        </>
      )}
    </button>
  ) : (
    lines.length > 0 &&
    !translated && (
      <Label muted className="block px-4 py-2.5">
        {noAnalysis}
      </Label>
    )
  );
  let body: ReactNode;
  if (loading)
    body = (
      <div className="flex flex-1 items-center justify-center">
        <PixelSpinner color={colors.coral} label="Loading song" />
      </div>
    );
  else if (quizToggle)
    body = (
      <QuizColumn
        lines={current?.lines ?? (beforeLyrics || !lines[lineIndex] ? undefined : [lines[lineIndex]])}
        current={answerWait || !occurrence ? -1 : lineIndex - occurrence.start}
        intro={beforeLyrics ? info : undefined}
        runEnd={beforeLyrics ? (runEnd ?? undefined) : undefined}
        onReplay={runEnd && runEnd.songId !== songId ? () => appStore.getState().replayRunEnd() : undefined}
        until={answerWait?.until}
        combo={run.combo}
        nice={!!sentenceId && run.answers[sentenceId]?.correct === true}
        choices={sentenceId ? (run.choices[sentenceId] ?? []) : []}
        selected={selectedAnswer}
        onAnswer={(choice) => appStore.getState().answer(choice)}
        onExplain={explainable && sentenceId ? () => explain(sentenceId) : undefined}
        onContinue={answerWait ? () => appStore.getState().continueAfterAnswer() : undefined}
        toast={showToast ? <AddedToast /> : runEnd && !beforeLyrics ? <RunEndToast /> : undefined}
        notice={translated ? undefined : noAnalysis}
      />
    );
  else if (!lines.length)
    body = (
      <div className="flex flex-1 items-center justify-center p-4">
        <Label muted>No lyrics for this song</Label>
      </div>
    );
  else
    body = (
      <>
        <div className="min-h-0 flex-1">
          <CenteredList
            key={songId}
            index={lineIndex}
            gapBefore={(index) => (sentenceAt[index] && sentenceAt[index].start < index ? 4 : 18)}
            header={showTranslations && info ? <SongIntro info={info} /> : undefined}
          >
            {lines.map((line, index) => {
              const sentence = sentenceAt[index];
              // Analyzed translations follow the whole sentence, so they sit under its last line.
              const translation = !showTranslations
                ? undefined
                : sentence
                  ? sentence.end === index
                    ? lyrics?.sentences.find((item) => item.id === sentence.sentenceId)?.translation
                    : undefined
                  : (timeline[index]?.translation ?? line.translation);
              return (
                <ListenRow
                  // A chorus line repeats, so a line's position keeps its key unique.
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional list
                  key={`${index}:${line.id}`}
                  line={line}
                  index={index}
                  current={sentence && occurrence ? sentence === occurrence : index === lineIndex}
                  furigana={showTranslations}
                  translation={translation}
                  marked={!!sentence && reviewed.has(sentence.sentenceId)}
                />
              );
            })}
          </CenteredList>
        </div>
        <div className="relative shrink-0 px-4 pt-2 pb-7">
          {(showToast || runEnd) && (
            <div className="absolute right-4 bottom-full left-4">{showToast ? <AddedToast /> : <RunEndToast />}</div>
          )}
          <div className="flex items-center gap-[10px]">
            {explainable && sentenceId && (
              <Button
                label="Explain this sentence"
                contentClassName="px-4! py-3.5!"
                onPress={() => explain(sentenceId)}
              >
                <Label pixel className={bigLabel}>
                  EXPLAIN
                </Label>
              </Button>
            )}
            <Button
              disabled={!canAdd}
              label={inReview ? 'In review' : 'Review this sentence later'}
              fill={colors.coral}
              border={colors.coralBorder}
              className="flex-1"
              contentClassName="relative py-3.5!"
              onPress={() => appStore.getState().addLostMark()}
            >
              <Label pixel className="text-[29px] tracking-[0.5px]">
                {inReview ? 'IN REVIEW' : 'REVIEW LATER'}
              </Label>
              <Label
                pixel
                className="pointer-events-none absolute top-[3px] left-2 hidden text-[14px] opacity-70 min-[1024px]:block"
              >
                L
              </Label>
            </Button>
          </div>
        </div>
      </>
    );
  return (
    <>
      {status}
      {body}
      {playbackError && (
        <Label className="block px-4 pb-2" style={{ color: colors.red }}>
          {playbackError}
        </Label>
      )}
    </>
  );
}

/** Speed, the quiz toggle and the song menu, shared by the phone and desktop headers. */
function HeaderControls({ song, compact = false }: { song: Song; compact?: boolean }) {
  const quizToggle = appStore((state) => state.quizToggle);
  libraryStore((state) => state.lyrics[song.id]);
  const quizzable = hasTranslations(song.id);
  return (
    <div className={compact ? 'flex items-center gap-1' : 'flex items-center gap-[14px]'}>
      <SpeedButton />
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-bold">QUIZ</Label>
        <PixelToggle
          disabled={!quizzable}
          label={quizzable ? 'Quiz toggle' : `Quiz toggle, ${noAnalysis.toLowerCase()}`}
          on={quizToggle}
          onPress={() => appStore.getState().setQuizToggle(!quizToggle)}
        />
      </div>
      <IconButton
        name="more"
        label="Song menu"
        size={compact ? 40 : 44}
        onPress={(event) => openMenuFrom(event.currentTarget, { kind: 'song', id: song.id })}
      />
    </div>
  );
}

/** "3 of 12" while quizzing, the sentence being played. */
function useSentenceCount(songId: string) {
  const quizToggle = appStore((state) => state.quizToggle);
  const lineIndex = appStore((state) => state.lineIndex);
  const answerWait = appStore((state) => state.answerWait);
  const sentences = libraryStore((state) => state.lyrics[songId]?.sentenceTimeline);
  const occurrence = answerWait?.occurrence ?? sentenceOccurrenceAt(songId, lineIndex);
  return quizToggle && occurrence && sentences
    ? `${sentences.indexOf(occurrence) + 1} of ${sentences.length}`
    : undefined;
}

type Tab = 'player' | 'up-next';

/** Desktop pane header: the two tabs, then the controls. */
function PaneHeader({ song, tab, onTab }: { song: Song; tab: Tab; onTab: (tab: Tab) => void }) {
  const count = useSentenceCount(song.id);
  return (
    <header className="flex shrink-0 items-center gap-2 px-[12px] pt-3 pb-1">
      <div role="tablist" aria-label="Player" className="flex min-w-0 flex-1 items-center gap-2.5">
        {(
          [
            ['player', count ?? 'PLAYER'],
            ['up-next', 'UP NEXT'],
          ] as const
        ).map(([id, title]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={cn(
              'shrink-0 border-b-2 py-1.5 whitespace-nowrap transition-[filter] hover:brightness-125',
              tab === id ? 'border-coral' : 'border-transparent',
            )}
          >
            <Label
              pixel
              className="text-[18px] tracking-[1px]"
              style={{ color: tab === id ? colors.text : colors.muted }}
            >
              {title}
            </Label>
          </button>
        ))}
      </div>
      <HeaderControls song={song} compact />
    </header>
  );
}

/**
 * The player. The desktop shell mounts it as the right pane (tabs for the player and Up next; a breakdown or edit
 * line opens over it) and the phone `/player` route mounts it full screen with a down chevron, like the iOS player
 * sheet. Both share the body, the controls and the bar.
 */
export function PlayerPane() {
  const desktop = useIsDesktop();
  const [tab, setTab] = useState<Tab>('player');
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const panel = panelStore((state) => state.panel);
  const count = useSentenceCount(songId ?? '');
  if (!song)
    return desktop ? (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        <Mascot size={200} />
        <Label pixel className="text-[29px]">
          Nothing playing
        </Label>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col bg-bg">
        <ScreenHeader sheet />
        <Label muted className="block p-4">
          No song playing
        </Label>
      </div>
    );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg">
      {desktop ? (
        <PaneHeader song={song} tab={tab} onTab={setTab} />
      ) : (
        <ScreenHeader sheet title={count} right={<HeaderControls song={song} />} />
      )}
      {desktop && tab === 'up-next' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <UpNext />
        </div>
      ) : (
        <PlayerBody song={song} />
      )}
      <PlayerBar />
      {desktop && panel && (
        <div className="absolute inset-0 z-10 bg-bg">
          {panel.kind === 'breakdown' ? (
            <BreakdownView songId={panel.songId} sentenceId={panel.sentenceId} onClose={closePanel} />
          ) : (
            <EditLineView id={panel.id} onClose={closePanel} />
          )}
        </div>
      )}
    </div>
  );
}
