import { View } from 'react-native';
import { colors } from '@/constants/theme';
import type { Choice } from '@/types/domain';
import { Icon } from './Icon';
import { Button, Label } from './ui';

/**
 * Meaning Match choices. Marked parts are where the options disagree, so they're underlined on every option.
 * After an answer the right choice turns green, and a picked decoy shows why it's wrong.
 */
export function Answers({
  choices,
  selected,
  onAnswer,
  compact = false,
}: {
  choices: Choice[];
  selected: string | null;
  onAnswer: (choice: string) => void;
  compact?: boolean;
}) {
  return (
    <View style={{ gap: compact ? 8 : 10 }}>
      {choices.map((choice, index) => {
        const correct = selected !== null && choice.correct;
        const wrong = selected === choice.text && !choice.correct;
        return (
          <Button
            key={`${index}:${choice.text}`}
            label={choice.text}
            onPress={() => onAnswer(choice.text)}
            fill={correct ? colors.greenDeep : wrong ? '#5c2632' : colors.maroon}
            border={correct ? colors.green : wrong ? colors.red : '#7a4b56'}
            style={{ opacity: selected !== null && !correct && !wrong ? 0.55 : 1 }}
            contentStyle={{
              minHeight: compact ? 56 : 62,
              paddingHorizontal: compact ? 12 : 18,
              paddingVertical: compact ? 8 : 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <View style={{ flex: 1, paddingHorizontal: compact ? 30 : 28, gap: 4 }}>
                <Label
                  numberOfLines={compact ? 3 : undefined}
                  style={{ textAlign: 'center', fontSize: 17, lineHeight: 23 }}
                >
                  {choice.parts.map((part, i) =>
                    part.marked ? (
                      <Label
                        key={i}
                        style={{
                          fontSize: 17,
                          lineHeight: 23,
                          fontWeight: '700',
                          textDecorationLine: 'underline',
                          textDecorationColor: colors.combo,
                        }}
                      >
                        {part.text}
                      </Label>
                    ) : (
                      part.text
                    ),
                  )}
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
