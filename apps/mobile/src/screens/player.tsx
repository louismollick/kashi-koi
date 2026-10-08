import { translationHint } from '@/japanese/translate';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import {
  currentSentence,
  hasTranslations,
  libraryStore,
  sentenceOccurrenceAt,
  songAnalysisInfo,
} from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { ScreenHeader } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { CenteredList, LyricRow } from '@/components/Lyrics';
import { QuizColumn } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { SongIntro } from '@/components/SongIntro';
import { Button, IconButton, Label, PixelToggle, styles } from '@/components/ui';

/** ListenMode and QuizMode share one sheet: header toggles, lyrics or quiz column, and the PlayerBar. */
export default function PlayerScreen() {
  const router = useRouter();
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const lineIndex = appStore((state) => state.lineIndex);
  libraryStore((state) => state.translationSongIds.has(songId ?? ''));
  libraryStore((state) => state.translationStatus);
  const showTranslations = appStore((state) => state.showTranslations);
  const quizToggle = appStore((state) => state.quizToggle);
  const answerWait = appStore((state) => state.answerWait);
  const run = appStore((state) => state.run);
  const reviewList = appStore((state) => state.reviewList);
  const addedId = appStore((state) => state.addedId);
  const addedExpiresAt = appStore((state) => state.addedExpiresAt);
  const lyrics = libraryStore((state) => state.lyrics[songId ?? '']);
  const timeline = lyrics?.timeline ?? [];
  const lines = timeline.map((occurrence) => lyrics!.lines.find((line) => line.id === occurrence.lineId)!);
  const loading = appStore((state) => state.loading);
  const playbackError = appStore((state) => state.playbackError);
  const request = appStore((state) => state.analysisRequests[songId ?? '']);
  const sentences = lyrics?.sentenceTimeline ?? [];
  // While the quiz holds a sentence, it stays current even if playback has moved past its last line.
  const occurrence = answerWait?.occurrence ?? sentenceOccurrenceAt(songId, lineIndex);
  const current = occurrence ? currentSentence(songId, occurrence.start) : undefined;
  const previous = current?.previous ? currentSentence(songId, current.previous.start) : undefined;
  const sentenceId = current?.sentence.id;
  const info = songAnalysisInfo(songId);
  const beforeLyrics = lineIndex < (sentences[0]?.start ?? 0);
  const selectedAnswer = sentenceId ? (run.answers[sentenceId]?.choice ?? null) : null;
  const showToast = addedId !== null && addedExpiresAt !== null && Date.now() < addedExpiresAt;
  const inReview = !!sentenceId && reviewList.some((item) => item.sentenceId === sentenceId);
  const canAdd = !!sentenceId && !inReview;
  const reviewed = new Set(reviewList.filter((item) => item.songId === songId).map((item) => item.sentenceId));
  const sentenceAt = timeline.map((_, index) => sentences.find((item) => item.start <= index && item.end >= index));
  const notes = Object.fromEntries((info?.notes ?? []).map((note) => [note.occurrence, note.text]));

  useEffect(() => {
    if (!addedId || addedExpiresAt === null) return;
    const timer = setTimeout(() => appStore.getState().dismissToast(), Math.max(0, addedExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [addedId, addedExpiresAt]);
  useEffect(() => {
    if (run.finished && quizToggle) router.replace('/results');
  }, [run.finished, quizToggle, router]);

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
          <View style={[styles.row, { gap: 12 }]}>
            {!quizToggle && (
              <IconButton
                name="translate"
                label="Translations"
                selected={showTranslations}
                fill={showTranslations ? colors.lavender : colors.panel}
                border={showTranslations ? colors.lavender : colors.track}
                color={showTranslations ? colors.bg : colors.muted}
                onPress={() => appStore.getState().toggleTranslations()}
              />
            )}
            <View style={[styles.row, { gap: 6 }]}>
              <Label style={{ fontSize: 12, fontWeight: '700' }}>QUIZ</Label>
              <PixelToggle
                disabled={!hasTranslations(songId)}
                label="Quiz toggle"
                on={quizToggle}
                onPress={() => appStore.getState().setQuizToggle(!quizToggle)}
              />
            </View>
          </View>
        }
      />
      {request ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Song info"
          onPress={() => router.push({ pathname: '/song-info', params: { id: song.id } })}
          style={[styles.row, { paddingHorizontal: 16, minHeight: 40 }]}
        >
          {request.status === 'failed' ? (
            <Label numberOfLines={1} style={{ flex: 1, color: colors.red }}>
              Analysis failed
            </Label>
          ) : (
            <>
              <ActivityIndicator size="small" color={colors.lavender} />
              <Label muted style={{ flex: 1 }}>
                {request.status === 'running' ? 'Analyzing song' : 'Analysis queued'}
              </Label>
            </>
          )}
        </Pressable>
      ) : (
        lines.length > 0 &&
        !hasTranslations(songId) && (
          <Label muted style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            {translationHint(song.id)}
          </Label>
        )
      )}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.coral} accessibilityLabel="Loading song" />
        </View>
      ) : quizToggle ? (
        <QuizColumn
          lines={current?.lines ?? (beforeLyrics || !lines[lineIndex] ? undefined : [lines[lineIndex]])}
          current={answerWait || !occurrence ? -1 : lineIndex - occurrence.start}
          previous={previous?.lines}
          translation={current?.sentence.translation}
          intro={beforeLyrics ? info : undefined}
          until={answerWait?.until}
          combo={run.combo}
          nice={!!sentenceId && run.answers[sentenceId]?.correct === true}
          choices={sentenceId ? (run.choices[sentenceId] ?? []) : []}
          selected={selectedAnswer}
          onAnswer={(choice) => appStore.getState().answer(choice)}
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
              gapBefore={(index) => (sentenceAt[index] && sentenceAt[index].start < index ? 4 : 18)}
              header={showTranslations && info ? <SongIntro info={info} /> : undefined}
            >
              {lines.map((line, index) => {
                const sentence = sentenceAt[index];
                // Analysed sentences carry one translation after their last line; other lines keep their own.
                const translation = !showTranslations
                  ? undefined
                  : sentence
                    ? sentence.end === index
                      ? lyrics?.sentences.find((item) => item.id === sentence.sentenceId)?.translation
                      : undefined
                    : (timeline[index]?.translation ?? line.translation);
                return (
                  <Pressable
                    key={`${index}:${line.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Play line ${index + 1}`}
                    onPress={() => appStore.getState().jumpToLine(index)}
                  >
                    <LyricRow
                      line={line}
                      current={sentence && occurrence ? sentence === occurrence : index === lineIndex}
                      furigana={showTranslations}
                      translation={translation}
                      note={showTranslations ? notes[index] : undefined}
                      marked={!!sentence && reviewed.has(sentence.sentenceId)}
                    />
                  </Pressable>
                );
              })}
            </CenteredList>
            <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute' }}>
              <Defs>
                <LinearGradient id="lyricFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.bg} stopOpacity={1} />
                  <Stop offset="0.12" stopColor={colors.bg} stopOpacity={0} />
                  <Stop offset="0.88" stopColor={colors.bg} stopOpacity={0} />
                  <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#lyricFade)" />
            </Svg>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}>
            {showToast && (
              <PixelFrame
                style={{ position: 'absolute', left: 16, right: 16, bottom: '100%' }}
                fill={colors.slate}
                contentStyle={[styles.row, { paddingLeft: 12 }]}
              >
                <Label style={{ flex: 1, fontSize: 13, color: colors.green }}>✓ Added</Label>
                <Button
                  label="Undo added sentence"
                  contentStyle={{ minHeight: 40, paddingHorizontal: 12, paddingVertical: 8 }}
                  onPress={() => appStore.getState().undoLostMark()}
                >
                  <Label style={{ fontSize: 12, color: colors.cream, fontWeight: '700' }}>UNDO</Label>
                </Button>
              </PixelFrame>
            )}
            <Button
              disabled={!canAdd}
              label={inReview ? 'In review' : 'Review this sentence later'}
              fill={colors.coral}
              border="#ff9aa5"
              contentStyle={{ paddingVertical: 14 }}
              onPress={() => appStore.getState().addLostMark()}
            >
              <Label style={{ fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: 0.5 }}>
                {inReview ? 'IN REVIEW' : 'REVIEW LATER'}
              </Label>
            </Button>
          </View>
        </>
      )}
      {playbackError && <Label style={{ color: colors.red, paddingHorizontal: 16 }}>{playbackError}</Label>}
      <PlayerBar />
    </View>
  );
}
