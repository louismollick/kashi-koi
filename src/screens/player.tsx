import { isJapanese } from '@/japanese/text';
import { translationHint } from '@/japanese/translate';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getLineText, libraryStore, hasTranslations } from '@/store/libraryStore';
import { getReviewMixProgress } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { ScreenHeader } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { LineCard, FuriganaLine } from '@/components/LineCard';
import { QuizColumn, QuizLane } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { Button, IconButton, Label, PixelToggle, styles } from '@/components/ui';

/** ListenMode and QuizMode share one header, tappable line lane, and transport. */
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
  const reviewMix = appStore(state => state.reviewMix);
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const reviewProgress = reviewMix ? getReviewMixProgress(reviewMix, hiding) : null;
  const reviewList = appStore(state => state.reviewList);
  const addedId = appStore(state => state.addedId);
  const addedExpiresAt = appStore(state => state.addedExpiresAt);
  const [confirm, setConfirm] = useState(false);
  const [alreadyInReview, setAlreadyInReview] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<number, number>>({});
  const lyrics = libraryStore(state => state.lyrics[songId ?? '']);
  const timeline = lyrics?.timeline ?? [];
  const lines = timeline.map(occurrence => lyrics!.lines.find(line => line.id === occurrence.lineId)!);
  const currentLine = lines[lineIndex];
  const loading = appStore(state => state.loading);
  const playbackError = appStore(state => state.playbackError);
  const selectedAnswer = currentLine ? run.answers[currentLine.id]?.choice ?? null : null;
  const showToast = addedId !== null && addedExpiresAt !== null && Date.now() < addedExpiresAt;
  const inReview = reviewList.filter(line => line.songId === song?.id).length;
  const followLine = useCallback(() => scroll.current?.scrollTo({ y: Math.max(0, (positions.current[lineIndex] ?? 0) - 125), animated: true }), [lineIndex]);

  useEffect(followLine, [followLine]);
  useEffect(() => {
    if (!addedId || addedExpiresAt === null) return;
    const timer = setTimeout(() => appStore.getState().dismissToast(), Math.max(0, addedExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [addedId, addedExpiresAt]);
  useEffect(() => {
    if (!alreadyInReview) return;
    const timer = setTimeout(() => setAlreadyInReview(false), 3000);
    return () => clearTimeout(timer);
  }, [alreadyInReview]);
  useEffect(() => { if (run.finished && quizToggle) router.replace('/results'); }, [run.finished, quizToggle, router]);

  if (!song) return <View style={styles.page}><ScreenHeader title="Player" /><Label>No song playing</Label></View>;
  return <View style={styles.page}>
    <ScreenHeader title={song?.title} subtitle={reviewProgress ? `Review mix · song ${reviewProgress.position} of ${reviewProgress.total}` : currentLine ? `${song?.artist} · line ${lineIndex + 1} of ${lines.length}` : song?.artist}
      right={<View style={[styles.row, { gap: 6 }]}><Label style={{ fontSize: 12, fontWeight: '700' }}>QUIZ</Label><PixelToggle disabled={!hasTranslations(songId)} label="Quiz toggle" on={quizToggle} onPress={() => quizToggle && reviewMix ? setConfirm(true) : appStore.getState().setQuizToggle(!quizToggle)} /></View>} />
    {!hasTranslations(songId) && lines.length > 0 && <Label muted style={{ paddingHorizontal: 16 }}>{translationHint(song.id)}</Label>}
    {!loading && lines.length > 0 && <QuizLane index={lineIndex} label="line" onJump={index => appStore.getState().jumpToLine(index)} segments={lines.map((line, index) => ({ id: line.id,
      fill: !isJapanese(getLineText(line)) ? colors.track : run.answers[line.id]?.correct === true ? colors.green : run.answers[line.id]?.correct === false ? colors.red : !quizToggle && reviewList.some(item => item.lineId === line.id) ? colors.coral : index < lineIndex ? colors.track : colors.laneEmpty,
    }))} />}
    {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="small" color={colors.coral} accessibilityLabel="Loading song" /></View>
    : quizToggle ? <QuizColumn line={currentLine} until={answerWait?.until} combo={run.combo} nice={!!currentLine && run.answers[currentLine.id]?.correct === true} choices={currentLine ? run.choices[currentLine.id] ?? [] : []} selected={selectedAnswer} onAnswer={choice => appStore.getState().answer(choice)} />
    : !lines.length ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}><Label muted>No lyrics for this song</Label></View> : <>
      <View style={{ flex: 1 }}>
        <ScrollView ref={scroll} onContentSizeChange={followLine} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 18 }}>
          {lines.map((line, index) => {
            const color = index < lineIndex ? colors.muted : colors.text;
            return <View key={`${index}:${line.id}`} onLayout={({ nativeEvent }) => { positions.current[index] = nativeEvent.layout.y; if (index === lineIndex) followLine(); }}>
            {index === lineIndex ? <LineCard line={line} furigana={showTranslations} translation={showTranslations} /> : <Pressable accessibilityRole="button" accessibilityLabel={`Play line ${index + 1}`} onPress={() => appStore.getState().jumpToLine(index)}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <View style={{ flexShrink: 1 }}>{showTranslations ? <FuriganaLine line={line} compact color={color} /> : <Label style={{ fontSize: 20, lineHeight: 30, color }}>{getLineText(line)}</Label>}</View>
                {reviewList.some(item => item.lineId === line.id) && <Label style={{ color: colors.coral, lineHeight: 30 }}> ●</Label>}
              </View>
              {showTranslations && <Label muted style={{ marginTop: 4 }}>{line.translation}</Label>}
            </Pressable>}
          </View>;
          })}
        </ScrollView>
        <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute' }}>
          <Defs><LinearGradient id="lyricFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={1} /><Stop offset="0.12" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.88" stopColor={colors.bg} stopOpacity={0} /><Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#lyricFade)" />
        </Svg>
      </View>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={[styles.row, { minHeight: 44 }]}>
          {showToast ? <PixelFrame style={{ flex: 1 }} fill={colors.slate} contentStyle={[styles.row, { paddingHorizontal: 10 }]}>
            <Label numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.green }}>✓ Added · {inReview} in review</Label>
            <Button label="Undo added line" contentStyle={{ minHeight: 44, paddingHorizontal: 10, paddingVertical: 8 }} onPress={() => appStore.getState().undoLostMark()}><Label style={{ fontSize: 12, color: colors.cream, fontWeight: '700' }}>UNDO</Label></Button>
          </PixelFrame> : <Label numberOfLines={1} muted={!alreadyInReview} style={{ flex: 1, fontSize: 12, color: alreadyInReview ? colors.green : colors.muted }}>{alreadyInReview ? '✓ Already in review' : `● ${inReview} lines from this song in review`}</Label>}
          <IconButton name="translate" label="Translations" selected={showTranslations} fill={showTranslations ? colors.lavender : colors.panel} border={showTranslations ? colors.lavender : colors.track} color={showTranslations ? colors.bg : colors.muted} onPress={() => appStore.getState().toggleTranslations()} />
        </View>
        <Button disabled={!currentLine} label="Didn't understand, add this line to review" fill={colors.coral} border="#ff9aa5" contentStyle={{ paddingVertical: 16 }} onPress={() => {
          if (reviewList.some(line => line.lineId === currentLine?.id)) setAlreadyInReview(true);
          else { setAlreadyInReview(false); appStore.getState().addLostMark(); }
        }}>
          <Label style={{ fontSize: 26, lineHeight: 30, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 }}>DIDN'T{'\n'}UNDERSTAND</Label>
          <Label style={{ fontSize: 12, marginTop: 5 }}>adds this line to review</Label>
        </Button>
      </View>
    </>}
    {playbackError && <Label style={{ color: colors.red, paddingHorizontal: 16 }}>{playbackError}</Label>}
    <PlayerBar />
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
      <View style={{ flex: 1, backgroundColor: '#090a16bb', justifyContent: 'center', padding: 28 }}>
        <PixelFrame fill={colors.surface} contentStyle={{ padding: 20, gap: 14 }}>
          <Label style={styles.title}>Turn off quiz?</Label>
          <Label>You're in a review mix. The songs keep playing as a normal playlist, and lines you haven't answered yet stay due.</Label>
          <View style={styles.row}>
            <Button label="Keep quiz" style={{ flex: 1 }} onPress={() => setConfirm(false)}><Label style={{ fontWeight: '600' }}>Keep quiz</Label></Button>
            <Button label="Turn off" style={{ flex: 1 }} fill={colors.coral} onPress={() => { appStore.getState().setQuizToggle(false); setConfirm(false); }}><Label style={{ fontWeight: '600' }}>Turn off</Label></Button>
          </View>
        </PixelFrame>
      </View>
    </Modal>
  </View>;
}
