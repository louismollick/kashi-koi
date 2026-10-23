import { canExplain } from '@/analysis/breakdowns';
import { analysisRequests } from '@/analysis/fetcher';
import { translationHint } from '@/japanese/translate';
import { isJapanese } from '@/japanese/text';
import { memo, useEffect, useMemo } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { PixelSpinner } from '@/components/PixelSpinner';
import {
  currentSentence,
  getLineText,
  hasTranslations,
  libraryStore,
  sentenceOccurrenceAt,
  songAnalysisInfo,
} from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { settingsStore } from '@/store/settingsStore';
import { ScreenHeader } from '@/components/Header';
import { SpeedButton } from '@/components/SpeedButton';
import { PixelFrame } from '@/components/PixelFrame';
import { CenteredList, LyricRow } from '@/components/Lyrics';
import { QuizColumn } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { SongIntro } from '@/components/SongIntro';
import { Koi } from '@/components/Fog';
import { songMenu } from './song-menu';
import type { Line } from '@/types/domain';
import { Button, IconButton, Label, PixelToggle, styles } from '@/components/ui';

// Listen-mode toasts float just above REVIEW LATER.
const floating = { position: 'absolute', left: 16, right: 16, bottom: '100%' } as const;

/** Confirms a lost mark or a quiz miss going onto the review list, with a short window to undo it. */
function AddedToast({ style }: { style?: ViewStyle }) {
  return (
    <PixelFrame style={style} fill={colors.slate} contentStyle={[styles.row, { paddingLeft: 12 }]}>
      <Label style={{ flex: 1, fontSize: 13, color: colors.green }}>✓ Added to review</Label>
      <Button
        label="Undo added sentence"
        contentStyle={{ minHeight: 40, paddingHorizontal: 12, paddingVertical: 8 }}
        onPress={() => appStore.getState().undoLostMark()}
      >
        <Label pixel style={{ fontSize: 14, color: colors.cream, fontWeight: '700' }}>
          UNDO
        </Label>
      </Button>
    </PixelFrame>
  );
}

/** How the run went, shown over the next song for a few seconds after a quiz song ends. */
function RunEndToast({ style }: { style?: ViewStyle }) {
  const runEnd = appStore((state) => state.runEnd);
  const title = libraryStore((state) => (runEnd ? state.bySong[runEnd.songId]?.title : undefined));
  // Shown for 4s after the song ended, so a card nobody saw never appears later over another song.
  const remaining = runEnd ? runEnd.at + 4000 - Date.now() : 0;
  useEffect(() => {
    if (!runEnd) return;
    const timer = setTimeout(() => appStore.getState().dismissRunEnd(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [runEnd]);
  if (!runEnd || remaining <= 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss run summary"
      onPress={() => appStore.getState().dismissRunEnd()}
      style={style}
    >
      <PixelFrame
        fill={runEnd.perfect ? colors.maroon : colors.slate}
        border={runEnd.perfect ? colors.combo : undefined}
        contentStyle={[styles.row, { padding: 12 }]}
      >
        {runEnd.perfect && <Koi perfect size={28} />}
        <View style={{ flex: 1 }}>
          <Label
            numberOfLines={1}
            style={{ fontSize: 13, fontWeight: '700', color: runEnd.perfect ? colors.combo : colors.text }}
          >
            {runEnd.perfect ? 'Perfect' : title}
          </Label>
          <Label muted numberOfLines={1} style={{ fontSize: 13 }}>
            {runEnd.perfect && title ? `${title} · ` : ''}
            {runEnd.hits}/{runEnd.answered} right · best combo {runEnd.bestCombo}
          </Label>
        </View>
      </PixelFrame>
    </Pressable>
  );
}

/**
 * One tappable listen-mode lyric. Tap jumps to the line; long press (when `explainId` is set) opens that sentence's
 * breakdown. It takes only primitives and stable objects and calls the stores itself, so the memo skips every row
 * whose own props did not change when the current line moves.
 */
const ListenRow = memo(function ListenRow({
  line,
  index,
  songId,
  current,
  furigana,
  translation,
  marked,
  explainId,
}: {
  line: Line;
  index: number;
  songId: string;
  current: boolean;
  furigana: boolean;
  translation?: string;
  marked: boolean;
  explainId?: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play line ${index + 1}`}
      onPress={() => appStore.getState().jumpToLine(index)}
      onLongPress={
        explainId ? () => router.push({ pathname: '/breakdown', params: { songId, sentenceId: explainId } }) : undefined
      }
    >
      <LyricRow line={line} current={current} furigana={furigana} translation={translation} marked={marked} />
    </Pressable>
  );
});

/** ListenMode and QuizMode share one sheet: header toggles, lyrics or quiz column, and the PlayerBar. */
export default function PlayerScreen() {
  const router = useRouter();
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const lineIndex = appStore((state) => state.lineIndex);
  libraryStore((state) => state.translationSongIds.has(songId ?? ''));
  libraryStore((state) => state.translationStatus);
  const showTranslations = settingsStore((state) => state.showTranslations);
  const useAnalysis = settingsStore((state) => !state.lineByLineSongIds.includes(songId ?? ''));
  const quizToggle = appStore((state) => state.quizToggle);
  const answerWait = appStore((state) => state.answerWait);
  const run = appStore((state) => state.run);
  const reviewList = appStore((state) => state.reviewList);
  const addedId = appStore((state) => state.addedId);
  const addedExpiresAt = appStore((state) => state.addedExpiresAt);
  const runEnd = appStore((state) => state.runEnd);
  const lyrics = libraryStore((state) => state.lyrics[songId ?? '']);
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
  const translationsReady =
    hasTranslations(songId) &&
    (quizToggle || useAnalysis || lines.every((line) => !isJapanese(getLineText(line)) || !!line.translation));
  const loading = appStore((state) => state.loading);
  const playbackError = appStore((state) => state.playbackError);
  const request = analysisRequests((requests) => requests[songId ?? '']);
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
  // Breakdowns explain song analysis sentences, so they follow the listen-mode translation source.
  const explainable = !!songId && canExplain(songId) && (quizToggle || useAnalysis);
  const explain = (id: string) => songId && router.push({ pathname: '/breakdown', params: { songId, sentenceId: id } });

  useEffect(() => {
    if (!addedId || addedExpiresAt === null) return;
    const timer = setTimeout(() => appStore.getState().dismissToast(), Math.max(0, addedExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [addedId, addedExpiresAt]);

  if (!song)
    return (
      <View style={styles.page}>
        <ScreenHeader sheet />
        <Label muted style={{ padding: 16 }}>
          No song playing
        </Label>
      </View>
    );
  return (
    <View style={styles.page}>
      <ScreenHeader
        sheet
        title={
          quizToggle && occurrence ? `Sentence ${sentences.indexOf(occurrence) + 1} of ${sentences.length}` : undefined
        }
        right={
          <View style={[styles.row, { gap: 14 }]}>
            <SpeedButton />
            <View style={[styles.row, { gap: 6 }]}>
              <Label style={{ fontSize: 12, fontWeight: '700' }}>QUIZ</Label>
              <PixelToggle
                disabled={!hasTranslations(songId)}
                label="Quiz toggle"
                on={quizToggle}
                onPress={() => appStore.getState().setQuizToggle(!quizToggle)}
              />
            </View>
            <IconButton name="more" label="Song menu" onPress={() => router.push(songMenu(song.id))} />
          </View>
        }
      />
      {request ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Song info"
          onPress={() => router.push(songMenu(song.id))}
          style={[styles.row, { paddingHorizontal: 16, minHeight: 40 }]}
        >
          {request.status === 'failed' ? (
            <Label numberOfLines={1} style={{ flex: 1, color: colors.red }}>
              Analysis failed
            </Label>
          ) : (
            <>
              <PixelSpinner color={colors.lavender} />
              <Label muted style={{ flex: 1 }}>
                {request.status === 'running' ? 'Analyzing song' : 'Analysis queued'}
              </Label>
            </>
          )}
        </Pressable>
      ) : (
        lines.length > 0 &&
        !translationsReady && (
          <Label muted style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            {translationHint(song.id)}
          </Label>
        )
      )}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PixelSpinner color={colors.coral} accessibilityLabel="Loading song" />
        </View>
      ) : quizToggle ? (
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
        />
      ) : !lines.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Label muted>No lyrics for this song</Label>
        </View>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            <CenteredList
              index={lineIndex}
              gapBefore={(index) => (useAnalysis && sentenceAt[index] && sentenceAt[index].start < index ? 4 : 18)}
              header={showTranslations && useAnalysis && info ? <SongIntro info={info} /> : undefined}
            >
              {lines.map((line, index) => {
                const sentence = sentenceAt[index];
                // iOS translations stay on each line; analyzed translations follow the whole sentence.
                const translation = !showTranslations
                  ? undefined
                  : !useAnalysis
                    ? line.translation
                    : sentence
                      ? sentence.end === index
                        ? lyrics?.sentences.find((item) => item.id === sentence.sentenceId)?.translation
                        : undefined
                      : (timeline[index]?.translation ?? line.translation);
                return (
                  <ListenRow
                    key={`${index}:${line.id}`}
                    line={line}
                    index={index}
                    songId={song.id}
                    current={useAnalysis && sentence && occurrence ? sentence === occurrence : index === lineIndex}
                    furigana={showTranslations}
                    translation={translation}
                    marked={!!sentence && reviewed.has(sentence.sentenceId)}
                    explainId={explainable && sentence ? sentence.sentenceId : undefined}
                  />
                );
              })}
            </CenteredList>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}>
            {showToast ? <AddedToast style={floating} /> : <RunEndToast style={floating} />}
            <View style={styles.row}>
              {explainable && sentenceId && (
                <Button
                  label="Explain this sentence"
                  contentStyle={{ paddingVertical: 14, paddingHorizontal: 16 }}
                  onPress={() => explain(sentenceId)}
                >
                  <Label pixel style={{ fontSize: 16, lineHeight: 28, fontWeight: '900', letterSpacing: 0.5 }}>
                    EXPLAIN
                  </Label>
                </Button>
              )}
              <Button
                disabled={!canAdd}
                label={inReview ? 'In review' : 'Review this sentence later'}
                fill={colors.coral}
                border={colors.coralBorder}
                style={{ flex: 1 }}
                contentStyle={{ paddingVertical: 14 }}
                onPress={() => appStore.getState().addLostMark()}
              >
                <Label pixel style={{ fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: 0.5 }}>
                  {inReview ? 'IN REVIEW' : 'REVIEW LATER'}
                </Label>
              </Button>
            </View>
          </View>
        </>
      )}
      {playbackError && <Label style={{ color: colors.red, paddingHorizontal: 16 }}>{playbackError}</Label>}
      <PlayerBar />
    </View>
  );
}
