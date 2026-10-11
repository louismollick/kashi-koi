import { View } from 'react-native';
import { colors } from '@/constants/theme';
import { gapOf } from '@/lyrics/choices';
import type { Choice } from '@/types/domain';
import { Icon } from './Icon';
import { Button, Label } from './ui';

/**
 * Meaning Match choices. When the choices only differ in one phrase (a sentence with a quiz), each button holds
 * just that phrase and the sentence around it is shown once with a gap (see `GapSentence`). Otherwise each button
 * holds a whole translation. After an answer the right choice turns green, and a picked decoy shows its reason.
 */
export function Answers({
  choices,
  selected,
  onAnswer,
}: {
  choices: Choice[];
  selected: string | null;
  onAnswer: (choice: string) => void;
}) {
  const gap = gapOf(choices);
  return (
    <View style={{ gap: 8 }}>
      {choices.map((choice, index) => {
        const correct = selected !== null && choice.correct;
        const wrong = selected === choice.text && !choice.correct;
        const label = gap ? (choice.parts.find((part) => part.marked)?.text ?? choice.text) : choice.text;
        return (
          <Button
            key={`${index}:${choice.text}`}
            label={label}
            onPress={() => onAnswer(choice.text)}
            fill={correct ? colors.greenDeep : wrong ? '#5c2632' : colors.maroon}
            border={correct ? colors.green : wrong ? colors.red : '#7a4b56'}
            style={{ opacity: selected !== null && !correct && !wrong ? 0.55 : 1 }}
            contentStyle={{ minHeight: 52, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <View style={{ flex: 1, paddingHorizontal: 30, gap: 4 }}>
                <Label numberOfLines={gap ? 2 : 4} style={{ textAlign: 'center', fontSize: 17, lineHeight: 23 }}>
                  {label}
                </Label>
                {wrong && choice.reason && (
                  <Label style={{ textAlign: 'center', fontSize: 13, lineHeight: 18, color: colors.cream }}>
                    {choice.reason}
                  </Label>
                )}
              </View>
              {correct && (
                <View
                  style={{
                    position: 'absolute',
                    right: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: '#25b36b',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" color="#ffffff" size={22} />
                </View>
              )}
            </View>
          </Button>
        );
      })}
    </View>
  );
}

/**
 * The right translation with the tested phrase blanked out, shown once above the phrase buttons. After an answer
 * the gap fills with the right phrase.
 */
export function GapSentence({ gap, answer }: { gap: { before: string; after: string }; answer?: string }) {
  return (
    <Label style={{ fontSize: 17, lineHeight: 26 }}>
      {gap.before}
      <Label
        style={{
          fontSize: 17,
          lineHeight: 26,
          fontWeight: '700',
          color: colors.combo,
          textDecorationLine: 'underline',
          textDecorationColor: colors.combo,
        }}
      >
        {answer ?? ' '.repeat(14)}
      </Label>
      {gap.after}
    </Label>
  );
}
