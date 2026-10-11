import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, Easing, withSpring, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import type { Choice, Line, SongLyrics } from '@/types/domain';
import { PixelFrame } from './PixelFrame';
import { SentenceCard } from './LineCard';
import { SongIntro } from './SongIntro';
import { Mascot } from './Mascot';
import { Answers, GapSentence } from './Answers';
import { gapOf } from '@/lyrics/choices';
import { Button, Label, styles } from './ui';

/** Sprite and feedback fill the space left between the sentence and answers, never shorter than an answer button. */
function ComboRow({ combo, nice }: { combo: number; nice: boolean }) {
  const pop = useSharedValue(0);
  const [size, setSize] = useState(0);
  useEffect(() => {
    pop.value = nice ? withSpring(1, { damping: 12 }) : withTiming(0, { duration: 140 });
  }, [nice, pop]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.75 + pop.value * 0.25 }, { rotate: '-4deg' }],
  }));
  const note = {
    position: 'absolute',
    color: colors.coral,
    fontSize: Math.min(30, size * 0.14),
    fontWeight: '900',
    textShadowColor: colors.cream,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  } as const;
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) =>
        setSize(Math.max(0, Math.min(250, layout.height - 8, layout.width - 128)))
      }
      style={[styles.row, { flex: 1, minHeight: 72, paddingHorizontal: 4 }]}
    >
      <View>
        <Mascot combo={combo} size={size} />
        {combo >= 3 && (
          <>
            <Text style={[note, { left: 0, top: size * 0.12 }]}>♪</Text>
            <Text style={[note, { right: size * 0.18, top: size * 0.02, fontSize: Math.min(24, size * 0.11) }]}>♪</Text>
          </>
        )}
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <View
          style={{
            width: 110,
            height: 140,
            justifyContent: 'flex-end',
            alignItems: 'flex-end',
            gap: 6,
            transform: [{ scale: Math.min(1, size / 140) }],
            transformOrigin: 'right center',
          }}
        >
          <Animated.View style={animatedStyle}>
            <PixelFrame
              fill={colors.cream}
              border={colors.coral}
              contentStyle={{ paddingHorizontal: 14, paddingVertical: 6 }}
            >
              <Label style={{ color: colors.coralDeep, fontWeight: '900', fontSize: 22, lineHeight: 26 }}>NICE!</Label>
            </PixelFrame>
            <View
              style={{
                position: 'absolute',
                bottom: -6,
                left: 14,
                width: 12,
                height: 12,
                backgroundColor: colors.cream,
                borderRightWidth: 2,
                borderBottomWidth: 2,
                borderColor: colors.coral,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </Animated.View>
          <Label style={{ color: colors.combo, fontSize: 15, fontWeight: '800', letterSpacing: 1.5, marginTop: 6 }}>
            COMBO
          </Label>
          <Label
            style={{
              color: colors.cream,
              fontSize: 48,
              lineHeight: 52,
              fontWeight: '900',
              textShadowColor: colors.coralDeep,
              textShadowOffset: { width: 3, height: 3 },
              textShadowRadius: 0,
            }}
          >
            {combo}
          </Label>
        </View>
      </View>
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
    <View style={{ height: 3, marginTop: 6, backgroundColor: colors.track }}>
      <Animated.View style={[{ height: 3, backgroundColor: colors.coral }, animatedStyle]} />
    </View>
  );
}

/**
 * A fixed quiz column. `lines` is the current sentence (or a gap line with no choices); before the first sentence
 * an analysed song shows its intro instead. The sentence scrolls when it is long, so the answers and, after a miss,
 * EXPLAIN (`onExplain`) and CONTINUE (`onContinue`, when the song is held) always stay on screen.
 */
export function QuizColumn({
  lines,
  current,
  intro,
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
}: {
  lines?: Line[];
  current?: number;
  intro?: SongLyrics['analysis'];
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
}) {
  // `nice` is the recorded grade, so the miss actions follow scoring even if cached choices went stale.
  const missed = selected !== null && !nice;
  const gap = gapOf(choices);
  const answer = selected === null ? undefined : choices.find((choice) => choice.correct);
  return (
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 16, paddingBottom: 16 }}>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 18 }}>
        {!lines?.length && intro ? (
          <SongIntro info={intro} />
        ) : (
          <SentenceCard
            lines={lines?.length ? lines : [{ id: 'gap', segments: [{ text: '♪' }] }]}
            current={current}
            isNew={isNew}
          />
        )}
        {gap && <GapSentence gap={gap} answer={answer?.parts.find((part) => part.marked)?.text} />}
      </ScrollView>
      {until != null && <AnswerTimeBar until={until} />}
      <ComboRow combo={combo} nice={nice} />
      <Answers choices={choices} selected={selected} onAnswer={onAnswer} />
      {missed && (onExplain || onContinue) && (
        <View style={[styles.row, { marginTop: 12 }]}>
          {onExplain && (
            <Button label="Explain this sentence" style={{ flex: 1 }} onPress={onExplain}>
              <Label style={{ fontWeight: '800' }}>EXPLAIN</Label>
            </Button>
          )}
          {onContinue && (
            <Button label={continueLabel} style={{ flex: 1 }} fill={colors.coral} border="#ff9aa5" onPress={onContinue}>
              <Label style={{ fontWeight: '800' }}>{continueLabel}</Label>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
