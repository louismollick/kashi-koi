import { isJapanese } from '@/japanese/text';
import { translationHint } from '@/japanese/translate';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getLineText, libraryStore, hasTranslations } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { ScreenHeader } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { CenteredList, LyricRow } from '@/components/Lyrics';
import { QuizColumn } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { Button, IconButton, Label, PixelToggle, styles } from '@/components/ui';

/** ListenMode and QuizMode share one sheet: header toggles, lyrics or quiz column, and the PlayerBar. */
export default function PlayerScreen() {
  const router = useRouter();
  const songId = appStore(state => state.songId);
  const song = libraryStore(state => songId ? state.bySong[songId] : undefined);
  const lineIndex = appStore(state => state.lineIndex);
  libraryStore(state => state.translationSongIds.has(songId ?? ''));
  libraryStore(state => state.translationStatus);
  const showTranslations = appStore(state => state.showTranslations);
  const quizToggle = appStore(state => state.quizToggle);
  const answerWait = appStore(state => state.answerWait);
  const run = appStore(state => state.run);
  const reviewList = appStore(state => state.reviewList);
  const addedId = appStore(state => state.addedId);
  const addedExpiresAt = appStore(state => state.addedExpiresAt);
  const lyrics = libraryStore(state => state.lyrics[songId ?? '']);
  const timeline = lyrics?.timeline ?? [];
  const lines = timeline.map(occurrence => lyrics!.lines.find(line => line.id === occurrence.lineId)!);
  const currentLine = lines[lineIndex];
  const loading = appStore(state => state.loading);
  const playbackError = appStore(state => state.playbackError);
  const selectedAnswer = currentLine ? run.answers[currentLine.id]?.choice ?? null : null;
  const showToast = addedId !== null && addedExpiresAt !== null && Date.now() < addedExpiresAt;
  const inReview = !!currentLine && reviewList.some(line => line.lineId === currentLine.id);
  const canAdd = !!currentLine && isJapanese(getLineText(currentLine)) && !inReview;

  useEffect(() => {
    if (!addedId || addedExpiresAt === null) return;
    const timer = setTimeout(() => appStore.getState().dismissToast(), Math.max(0, addedExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [addedId, addedExpiresAt]);
  useEffect(() => { if (run.finished && quizToggle) router.replace('/results'); }, [run.finished, quizToggle, router]);

  if (!song) return <View style={styles.page}><ScreenHeader sheet /><Label muted style={{ padding: 16 }}>No song playing</Label></View>;
  return <View style={styles.page}>
    <ScreenHeader sheet title={quizToggle && currentLine ? `Line ${lineIndex + 1} of ${lines.length}` : undefined} right={<View style={[styles.row, { gap: 12 }]}>
      {!quizToggle && <IconButton name="translate" label="Translations" selected={showTranslations} fill={showTranslations ? colors.lavender : colors.panel} border={showTranslations ? colors.lavender : colors.track} color={showTranslations ? colors.bg : colors.muted} onPress={() => appStore.getState().toggleTranslations()} />}
      <View style={[styles.row, { gap: 6 }]}><Label style={{ fontSize: 12, fontWeight: '700' }}>QUIZ</Label><PixelToggle disabled={!hasTranslations(songId)} label="Quiz toggle" on={quizToggle} onPress={() => appStore.getState().setQuizToggle(!quizToggle)} /></View>
    </View>} />
    {!hasTranslations(songId) && lines.length > 0 && <Label muted style={{ paddingHorizontal: 16 }}>{translationHint(song.id)}</Label>}
    {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="small" color={colors.coral} accessibilityLabel="Loading song" /></View>
    : quizToggle ? <QuizColumn line={currentLine} until={answerWait?.until} combo={run.combo} nice={!!currentLine && run.answers[currentLine.id]?.correct === true} choices={currentLine ? run.choices[currentLine.id] ?? [] : []} selected={selectedAnswer} onAnswer={choice => appStore.getState().answer(choice)} />
    : !lines.length ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}><Label muted>No lyrics for this song</Label></View> : <>
      <View style={{ flex: 1 }}>
        <CenteredList index={lineIndex}>
          {lines.map((line, index) => <Pressable key={`${index}:${line.id}`} accessibilityRole="button" accessibilityLabel={`Play line ${index + 1}`} onPress={() => appStore.getState().jumpToLine(index)}>
            <LyricRow line={line} current={index === lineIndex} translations={showTranslations} marked={reviewList.some(item => item.lineId === line.id)} />
          </Pressable>)}
        </CenteredList>
        <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute' }}>
          <Defs><LinearGradient id="lyricFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={1} /><Stop offset="0.12" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.88" stopColor={colors.bg} stopOpacity={0} /><Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#lyricFade)" />
        </Svg>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}>
        {showToast && <PixelFrame style={{ position: 'absolute', left: 16, right: 16, bottom: '100%' }} fill={colors.slate} contentStyle={[styles.row, { paddingLeft: 12 }]}>
          <Label style={{ flex: 1, fontSize: 13, color: colors.green }}>✓ Added</Label>
          <Button label="Undo added line" contentStyle={{ minHeight: 40, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => appStore.getState().undoLostMark()}><Label style={{ fontSize: 12, color: colors.cream, fontWeight: '700' }}>UNDO</Label></Button>
        </PixelFrame>}
        <Button disabled={!canAdd} label={inReview ? 'In review' : 'Review this line later'} fill={colors.coral} border="#ff9aa5" contentStyle={{ paddingVertical: 14 }} onPress={() => appStore.getState().addLostMark()}>
          <Label style={{ fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: 0.5 }}>{inReview ? 'IN REVIEW' : 'REVIEW LATER'}</Label>
        </Button>
      </View>
    </>}
    {playbackError && <Label style={{ color: colors.red, paddingHorizontal: 16 }}>{playbackError}</Label>}
    <PlayerBar />
  </View>;
}
