import { canExplain } from '@kashi-koi/core/analysis/breakdowns';
import { analysisRequests } from '@kashi-koi/core/analysis/fetcher';
import { useSkipTarget } from '@kashi-koi/core/data/skipTarget';
import { appStore } from '@kashi-koi/core/store/appStore';
import {
  currentSentence,
  getLyrics,
  hasTranslations,
  libraryStore,
  sentenceOccurrenceAt,
  songAnalysisInfo,
} from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import type { Line, Song } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { openBreakdown, queueStore, toggleQueue } from '@/lib/panels';
import { openMenuFrom } from '@/lib/songMenu';
import { ScreenHeader } from './Header';
import { LyricRow, CenteredList } from './Lyrics';
import { PixelSpinner } from './PixelSpinner';
import { PlayerBar } from './PlayerBar';
import { HeaderControls, noAnalysis } from './PlayerControls';
import { AddedToast, RunEndToast } from './PlayerToasts';
import { QuizColumn, Stage } from './QuizLayout';
import { SongIntro } from './SongIntro';
import { UpNext } from './UpNext';
import { Button, IconButton, Label } from './ui';

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

/** CONTINUE that jumps to timeline line `index`, with a bar along its bottom draining as the song reaches it. */
function SkipAhead({ songId, index }: { songId: string; index: number }) {
  const targetMs = getLyrics(songId).timeline[index]?.startMs ?? 0;
  const position = appStore((state) => state.positionMs);
  const [from] = useState(() => appStore.getState().positionMs);
  const left = Math.max(0, Math.min(1, (targetMs - position) / (targetMs - from || 1)));
  return (
    <Button
      label="Continue to the next sentence"
      className="flex-1"
      fill={colors.coral}
      border={colors.coralBorder}
      contentClassName="relative"
      onPress={() => appStore.getState().jumpToLine(index)}
    >
      <Label pixel className={bigLabel}>
        CONTINUE
      </Label>
      <span aria-hidden className="absolute inset-x-2 bottom-[5px] h-[3px] bg-[#ffffff40]">
        <span
          className="block h-full origin-left bg-cream transition-transform duration-300 ease-linear"
          style={{ transform: `scaleX(${left})` }}
        />
      </span>
    </Button>
  );
}

/**
 * ListenMode and QuizMode share one body: analysis status, lyrics or the quiz column, and the playback error. On the
 * desktop both modes sit under the same harbor strip (quiz mode's own stage is that strip too), and the sentence count
 * tags the quiz's dialogue box.
 */
function PlayerBody({ song }: { song: Song }) {
  const songId = song.id;
  const desktop = useIsDesktop();
  const count = useSentenceCount(songId);
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
  // Nothing left to answer: the sentence on screen is answered or has no quiz, or no sentence is playing at all.
  const settled =
    quizToggle &&
    !answerWait &&
    !(runEnd && beforeLyrics) &&
    (!current?.sentence.translation || selectedAnswer !== null);
  const skipTo = useSkipTarget(songId, settled);
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
        skip={skipTo === undefined ? undefined : <SkipAhead key={skipTo} songId={songId} index={skipTo} />}
        count={desktop ? count?.toUpperCase() : undefined}
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
        {/* On the desktop the lyrics scroll out from under the harbor strip, so their top edge fades. */}
        <div
          className={desktop ? 'min-h-0 flex-1 [mask-image:linear-gradient(transparent,#000_28px)]' : 'min-h-0 flex-1'}
        >
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
      {desktop && !quizToggle && <Stage strip />}
      {body}
      {playbackError && (
        <Label className="block px-4 pb-2" style={{ color: colors.red }}>
          {playbackError}
        </Label>
      )}
    </>
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

/** Desktop Up next under the harbor strip; the close button on the strip goes back to the lyrics or quiz. */
function PaneQueue() {
  return (
    <>
      <Stage
        strip
        overlay={
          <>
            <span />
            <IconButton name="close" size={40} label="Hide Up next" onPress={toggleQueue} />
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <UpNext />
      </div>
    </>
  );
}

/**
 * The player. The desktop shell mounts it as the harbor pane: the one place the harbor and the mascot live, with
 * lyrics or the quiz (or Up next) under her and playback in the bar along the bottom of the window. With nothing
 * playing she dozes on the same strip. The phone `/player` route mounts it full screen with a down chevron and its own
 * bar, like the iOS player sheet.
 */
export function PlayerPane() {
  const desktop = useIsDesktop();
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const queueOpen = queueStore((state) => state.open);
  const count = useSentenceCount(songId ?? '');
  if (!song)
    return desktop ? (
      <div className="flex min-h-0 flex-1 flex-col bg-bg">
        <Stage strip pose="doze" />
        <Label muted className="block px-4 py-3">
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
  if (desktop)
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg">{queueOpen ? <PaneQueue /> : <PlayerBody song={song} />}</div>
    );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg">
      <ScreenHeader sheet title={count} right={<HeaderControls song={song} />} />
      <PlayerBody song={song} />
      <PlayerBar />
    </div>
  );
}
