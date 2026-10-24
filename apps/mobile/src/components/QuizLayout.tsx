import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, Easing, withSpring, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { Choice, Line, RunEnd, SongLyrics } from '@kashi-koi/core/types/domain';
import { PixelFrame } from './PixelFrame';
import { SentenceLines } from './LineCard';
import { SongIntro } from './SongIntro';
import { deckFeet, harborArt } from './Harbor';
import { Mascot, spriteFoot, type Pose } from './Mascot';
import { useNow } from '@/hooks/useNow';
import { Answers, GapSentence } from './Answers';
import { FogStrip, useSongFog } from './Fog';
import { Icon } from './Icon';
import { gapOf } from '@kashi-koi/core/lyrics/choices';
import { Button, Label, Tag, styles } from './ui';

/** A finished run's best combo, shown in place of the live one. */
type Best = { combo: number; perfect: boolean };
// How far the dialogue box rides up over the dock.
const overlap = 24;

/**
 * The harbor behind the quiz: she fishes from the dock, NICE! pops by her head and the combo lands in her bucket as
 * fish. The art and sprite stay pinned to the bottom, so a taller sentence only crops sky. `best` swaps the combo
 * for a finished run's best combo, with a gold koi when it was perfect. `pose` stills her (dozing, holding a koi,
 * looking at an empty hook). Her chair always clears the dialogue box that rides over the deck.
 */
function Stage({ combo, nice, best, pose = 'play' }: { combo: number; nice: boolean; best?: Best; pose?: Pose }) {
  const harbor = harborArt(useNow());
  const pop = useSharedValue(0);
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    pop.value = nice ? withSpring(1, { damping: 12 }) : withTiming(0, { duration: 140 });
  }, [nice, pop]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.75 + pop.value * 0.25 }, { rotate: '-4deg' }],
  }));
  // Zoomed past cover so the art's pixels read at phone size.
  const artWidth = Math.max(width * 1.6, height * harbor.aspect);
  // Her chair legs land on the deck, above the dialogue box riding over its front edge.
  const feet = deckFeet(artWidth, overlap);
  // Her hat sits about 0.7 of her size above her chair legs, so that much has to fit under the top edge.
  const size = Math.max(0, Math.min(260, width * 0.62, (height - 6 - feet) / 0.7));
  const bottom = feet - size * spriteFoot;
  const note = {
    position: 'absolute',
    color: colors.coral,
    fontSize: Math.min(30, size * 0.14),
    fontWeight: '900',
    textShadowColor: colors.cream,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  } as const;
  const count = best ? best.combo : combo;
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}
      style={{ flexGrow: 1, flexBasis: 0, minHeight: 72, overflow: 'hidden' }}
    >
      <Image
        source={harbor.src}
        contentFit="fill"
        style={{
          position: 'absolute',
          bottom: 0,
          left: -(artWidth - width) * 0.3,
          width: artWidth,
          height: artWidth / harbor.aspect,
        }}
      />
      <View style={{ position: 'absolute', left: 4, bottom }}>
        <Mascot combo={combo} size={size} pose={pose} />
        {combo >= 3 && pose === 'play' && (
          <>
            <Text style={[note, { left: 0, top: size * 0.12 }]}>♪</Text>
            <Text style={[note, { right: size * 0.18, top: size * 0.02, fontSize: Math.min(24, size * 0.11) }]}>♪</Text>
          </>
        )}
      </View>
      <Animated.View
        style={[
          { position: 'absolute', left: size * 0.62, top: Math.max(8, height - bottom - size * 0.98) },
          animatedStyle,
        ]}
      >
        <PixelFrame
          fill={colors.cream}
          border={colors.coral}
          contentStyle={{ paddingHorizontal: 12, paddingVertical: 4 }}
        >
          <Label pixel style={{ color: colors.coralDeep, fontSize: 26 }}>
            NICE!
          </Label>
        </PixelFrame>
      </Animated.View>
      <PixelFrame
        fill={colors.night}
        border="#363a5e"
        style={{ position: 'absolute', right: 14, bottom: overlap + 12 }}
        contentStyle={{ alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, minWidth: 92 }}
      >
        <Label pixel style={{ color: colors.combo, fontSize: 18, letterSpacing: 1 }}>
          {best ? 'BEST COMBO' : 'COMBO'}
        </Label>
        <Label
          pixel
          style={{
            color: colors.cream,
            fontSize: 52,
            textShadowColor: colors.coralDeep,
            textShadowOffset: { width: 3, height: 3 },
            textShadowRadius: 0,
          }}
        >
          {count}
        </Label>
        {(best ? best.perfect : combo > 0) && (
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 2 }}>
            {best ? (
              <Icon name="koi" size={24} color={colors.combo} />
            ) : (
              Array.from({ length: Math.min(combo, 5) }, (_, index) => (
                <Icon key={index} name="koi" size={14} color={colors.koi} />
              ))
            )}
          </View>
        )}
      </PixelFrame>
    </View>
  );
}

/** RPG dialogue box: a cream border inside a dark ring, so it reads over the harbor art. `tag` sits on its top edge. */
function Dialog({ children, tag, style }: { children: ReactNode; tag?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexShrink: 1, minHeight: 0 }, style]}>
      <PixelFrame
        fill={colors.night}
        border={null}
        style={{ flexShrink: 1 }}
        contentStyle={{ padding: 3, flexShrink: 1 }}
      >
        <PixelFrame
          fill={colors.night}
          border={colors.cream}
          style={{ flexShrink: 1 }}
          contentStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, gap: 8, flexShrink: 1 }}
        >
          {children}
        </PixelFrame>
      </PixelFrame>
      {tag && <View style={{ position: 'absolute', top: -8, left: 14 }}>{tag}</View>}
    </View>
  );
}

/** A finished run's score: gold "Perfect" or the hit count, one muted line, then optional tiles below. */
export function RunResult({
  perfect,
  score,
  detail,
  children,
}: {
  perfect: boolean;
  score: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Label pixel style={{ fontSize: 36, color: perfect ? colors.combo : colors.cream }}>
        {perfect ? 'Perfect' : score}
      </Label>
      {(detail || perfect) && (
        <Label muted numberOfLines={1}>
          {[detail, perfect && score].filter(Boolean).join(' · ')}
        </Label>
      )}
      {children && <View style={{ alignSelf: 'stretch', marginTop: 8 }}>{children}</View>}
    </View>
  );
}

/** The song that just finished, shown over the next song's intro, with its fog tiles. */
function RunSummary({ runEnd }: { runEnd: RunEnd }) {
  const title = libraryStore((state) => state.bySong[runEnd.songId]?.title);
  const { tiles } = useSongFog(runEnd.songId);
  return (
    <RunResult perfect={runEnd.perfect} score={`${runEnd.hits} of ${runEnd.answered} right`} detail={title}>
      <FogStrip tiles={tiles} />
    </RunResult>
  );
}

/**
 * The harbor stage with a dialogue box riding over its dock and `children` (answers or actions) below. Quiz mode,
 * clip review and the review's end screen share it.
 */
export function DockScene({
  combo,
  nice,
  best,
  pose,
  tag,
  dialog,
  children,
}: {
  combo: number;
  nice: boolean;
  best?: Best;
  pose?: Pose;
  tag?: ReactNode;
  dialog: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, minHeight: 0, paddingBottom: 16 }}>
      <Stage combo={combo} nice={nice} best={best} pose={pose} />
      <Dialog style={{ marginTop: -overlap, marginHorizontal: 16 }} tag={tag}>
        {dialog}
      </Dialog>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>{children}</View>
    </View>
  );
}

/** Drain the deadline without adding a scrolling container to quiz mode. */
function AnswerTimeBar({ until }: { until: number }) {
  const remaining = useSharedValue(1);
  useEffect(() => {
    const ms = Math.max(0, until - Date.now());
    remaining.value = 1;
    remaining.value = withTiming(0, { duration: ms, easing: Easing.linear });
  }, [until, remaining]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${remaining.value * 100}%` }));
  return (
    <View style={{ height: 3, backgroundColor: colors.track }}>
      <Animated.View style={[{ height: 3, backgroundColor: colors.coral }, animatedStyle]} />
    </View>
  );
}

/**
 * A fixed quiz column: the harbor stage, the sentence in a dialogue box over the dock, then the answers. `lines` is
 * the current sentence (or a gap line with no choices); before the first sentence an analysed song shows its intro,
 * or `runEnd`, the song that just finished, with PLAY AGAIN (`onReplay`). The sentence scrolls only when it overflows, so
 * the answers and, after a miss, EXPLAIN (`onExplain`) and CONTINUE (`onContinue`, when the song is held) always
 * stay on screen. `toast` sits just above the answers, so it never covers the sentence. After a miss she looks at
 * the empty hook until the next sentence. `skip` (a CONTINUE that jumps ahead) takes the action row once there is
 * nothing left to answer.
 */
export function QuizColumn({
  lines,
  current,
  intro,
  runEnd,
  onReplay,
  choices,
  selected,
  combo,
  nice,
  until,
  isNew = false,
  onAnswer,
  onExplain,
  onContinue,
  continueLabel = 'CONTINUE',
  toast,
  skip,
}: {
  lines?: Line[];
  current?: number;
  intro?: SongLyrics['analysis'];
  runEnd?: RunEnd;
  onReplay?: () => void;
  choices: Choice[];
  selected: string | null;
  combo: number;
  nice: boolean;
  until?: number | null;
  isNew?: boolean;
  onAnswer: (choice: string) => void;
  onExplain?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  toast?: ReactNode;
  skip?: ReactNode;
}) {
  // `nice` is the recorded grade, so the miss actions follow scoring even if cached choices went stale.
  const missed = selected !== null && !nice;
  const gap = gapOf(choices);
  const answer = selected === null ? undefined : choices.find((choice) => choice.correct);
  const summary = lines?.length ? undefined : runEnd;
  return (
    <DockScene
      combo={combo}
      nice={nice}
      best={summary ? { combo: summary.bestCombo, perfect: summary.perfect } : undefined}
      // A perfect run lands a koi; a miss leaves a bare hook until the next sentence.
      pose={summary?.perfect ? 'catch' : missed ? 'miss' : 'play'}
      tag={summary ? <Tag>RUN COMPLETE</Tag> : isNew ? <Tag>NEW</Tag> : undefined}
      dialog={
        <>
          <ScrollView bounces={false} style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 14 }}>
            {summary ? (
              <RunSummary runEnd={summary} />
            ) : !lines?.length && intro ? (
              <SongIntro info={intro} />
            ) : (
              <SentenceLines
                lines={lines?.length ? lines : [{ id: 'gap', segments: [{ text: '♪' }] }]}
                current={current}
              />
            )}
            {gap && <GapSentence gap={gap} answer={answer?.parts.find((part) => part.marked)?.text} />}
          </ScrollView>
          {/* Always reserved, so the deadline appearing doesn't resize the stage. */}
          <View style={{ height: 3 }}>{until != null && <AnswerTimeBar until={until} />}</View>
        </>
      }
    >
      {toast && <View style={{ marginBottom: 12 }}>{toast}</View>}
      {summary && onReplay ? (
        <Button label="Play the finished song again" onPress={onReplay}>
          <Label pixel style={{ fontSize: 23 }}>
            PLAY AGAIN
          </Label>
        </Button>
      ) : (
        <Answers choices={choices} selected={selected} onAnswer={onAnswer} />
      )}
      {((missed && (onExplain || onContinue)) || skip) && (
        <View style={[styles.row, { marginTop: 12 }]}>
          {missed && onExplain && (
            <Button label="Explain this sentence" style={{ flex: 1 }} onPress={onExplain}>
              <Label pixel style={{ fontSize: 23 }}>
                EXPLAIN
              </Label>
            </Button>
          )}
          {/* A held miss continues the song; otherwise CONTINUE skips ahead to the next sentence. */}
          {missed && onContinue ? (
            <Button
              label={continueLabel}
              style={{ flex: 1 }}
              fill={colors.coral}
              border={colors.coralBorder}
              onPress={onContinue}
            >
              <Label pixel style={{ fontSize: 23 }}>
                {continueLabel}
              </Label>
            </Button>
          ) : (
            skip
          )}
        </View>
      )}
    </DockScene>
  );
}
