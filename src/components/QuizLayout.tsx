import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, Easing, withSpring, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import type { Line } from '@/types/domain';
import { PixelFrame } from './PixelFrame';
import { LineCard } from './LineCard';
import { Mascot } from './Mascot';
import { Answers } from './Answers';
import { Label, styles } from './ui';

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

/** Tappable progress segments share the current outline and answer colors. */
export function QuizLane({ segments, index, label, onJump }: { segments: { id: string; fill: string }[]; index: number; label: string; onJump: (index: number) => void }) {
  return <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
    {segments.map((segment, i) => <Pressable key={`${i}:${segment.id}`} accessibilityRole="button" accessibilityLabel={`Jump to ${label} ${i + 1}`} onPress={() => onJump(i)} style={{ flex: 1, paddingVertical: 7 }}>
      <PixelFrame fill={i === index ? colors.bg : segment.fill} border={i === index ? colors.text : null} contentStyle={{ height: 14 }} />
    </Pressable>)}
  </View>;
}

/** A fixed quiz column keeps the instrumental gap in quiz mode with no choices. */
export function QuizColumn({ line, choices, selected, combo, nice, until, isNew = false, onAnswer }: { line?: Line; choices: string[]; selected: string | null; combo: number; nice: boolean; until?: number | null; isNew?: boolean; onAnswer: (choice: string) => void }) {
  return <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 16, paddingBottom: 16 }}>
    <LineCard line={line ?? { id: 'gap', segments: [{ text: '♪' }] }} isNew={isNew} />
    {until != null && <AnswerTimeBar until={until} />}
    <ComboRow combo={combo} nice={nice} />
    <Answers compact choices={choices} translation={line?.translation} selected={selected} onAnswer={onAnswer} />
  </View>;
}
