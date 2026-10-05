import { isJapanese } from '@/japanese/text';
import { translationHint } from '@/japanese/translate';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, Easing, withSpring, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { getLineText, libraryStore, hasTranslations } from '@/store/libraryStore';
import { getReviewMixProgress } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { ScreenHeader } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { LineCard, FuriganaLine } from '@/components/LineCard';
import { Mascot } from '@/components/Mascot';
import { Answers } from '@/components/Answers';
import { PlayerBar } from '@/components/PlayerBar';
import { Button, IconButton, Label, PixelToggle, styles } from '@/components/ui';

/** Sprite and feedback shrink to the space left between the line and answers. */
function ComboRow({ combo, nice }: { combo: number; nice: boolean }) {
  const pop = useSharedValue(0);
  const [size, setSize] = useState(0);
  useEffect(() => { pop.value = nice ? withSpring(1, { damping: 12 }) : withTiming(0, { duration: 140 }); }, [nice, pop]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.75 + pop.value * 0.25 }, { rotate: '-4deg' }] }));
  const note = { position: 'absolute', color: colors.coral, fontSize: Math.min(30, size * 0.14), fontWeight: '900', textShadowColor: colors.cream, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 } as const;
  return <View onLayout={({ nativeEvent: { layout } }) => setSize(Math.max(0, Math.min(250, layout.height - 8, layout.width - 128)))} style={[styles.row, { flex: 1, minHeight: 0, paddingHorizontal: 4 }]}>
    <View>
      <Mascot combo={combo} size={size} />
      {combo >= 3 && <><Text style={[note, { left: 0, top: size * 0.12 }]}>♪</Text><Text style={[note, { right: size * 0.18, top: size * 0.02, fontSize: Math.min(24, size * 0.11) }]}>♪</Text></>}
    </View>
    <View style={{ flex: 1, alignItems: 'flex-end' }}>
      <View style={{ width: 110, height: 140, justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6, transform: [{ scale: Math.min(1, size / 140) }], transformOrigin: 'right center' }}>
        <Animated.View style={animatedStyle}>
          <PixelFrame fill={colors.cream} border={colors.coral} contentStyle={{ paddingHorizontal: 14, paddingVertical: 6 }}>
            <Label style={{ color: colors.coralDeep, fontWeight: '900', fontSize: 22, lineHeight: 26 }}>NICE!</Label>
          </PixelFrame>
          <View style={{ position: 'absolute', bottom: -6, left: 14, width: 12, height: 12, backgroundColor: colors.cream, borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.coral, transform: [{ rotate: '45deg' }] }} />
        </Animated.View>
        <Label style={{ color: colors.combo, fontSize: 15, fontWeight: '800', letterSpacing: 1.5, marginTop: 6 }}>COMBO</Label>
        <Label style={{ color: colors.cream, fontSize: 48, lineHeight: 52, fontWeight: '900', textShadowColor: colors.coralDeep, textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 }}>{combo}</Label>
      </View>
    </View>
  </View>;
}

/** Drain the deadline without adding a scrolling container to quiz mode. */
function AnswerTimeBar({ until }: { until: number }) {
  const remaining = useSharedValue(1);
  useEffect(() => { const ms = Math.max(0, until - Date.now()); remaining.value = 1; remaining.value = withTiming(0, { duration: ms, easing: Easing.linear }); }, [until, remaining]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${remaining.value * 100}%` }));
  return <View style={{ height: 3, marginTop: 6, backgroundColor: colors.track }}><Animated.View style={[{ height: 3, backgroundColor: colors.coral }, animatedStyle]} /></View>;
}

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
    {lines.length > 0 && <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      {lines.map((line, index) => <Pressable key={`${index}:${line.id}`} accessibilityRole="button" accessibilityLabel={`Jump to line ${index + 1}`} onPress={() => appStore.getState().jumpToLine(index)} style={{ flex: 1, paddingVertical: 7 }}>
        <PixelFrame fill={!isJapanese(getLineText(line)) ? colors.track : index === lineIndex ? colors.bg : run.answers[line.id]?.correct === true ? colors.green : run.answers[line.id]?.correct === false ? colors.red : !quizToggle && reviewList.some(item => item.lineId === line.id) ? colors.coral : index < lineIndex ? colors.track : colors.laneEmpty}
          border={index === lineIndex ? colors.text : null} contentStyle={{ height: 14 }} />
      </Pressable>)}
    </View>}
    {!lines.length ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Label muted>No lyrics for this song</Label>
    </View> : quizToggle && currentLine ? <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 16, paddingBottom: 16 }}>
      <LineCard line={currentLine} />
      {answerWait?.until != null && <AnswerTimeBar until={answerWait.until} />}
      <ComboRow combo={run.combo} nice={currentLine ? run.answers[currentLine.id]?.correct === true : false} />
      <Answers compact choices={run.choices[currentLine.id] ?? []} translation={currentLine.translation} selected={selectedAnswer} onAnswer={choice => appStore.getState().answer(choice)} />
    </View> : <>
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
