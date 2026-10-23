import { gapOf } from '@kashi-koi/core/lyrics/choices';
import type { Choice } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { Icon } from './Icon';
import { PixelFrame } from './PixelFrame';
import { Button, Label } from './ui';

/**
 * Meaning Match choices. When the choices only differ in one phrase (a sentence with a quiz), each button holds
 * just that phrase and the sentence around it is shown once with a gap (see `GapSentence`). Otherwise each button
 * holds a whole translation. After an answer the right choice turns green, and a picked decoy shows its reason.
 * On desktop each button carries the key that picks it (1, 2, 3) until the sentence is answered.
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
    <div className="flex flex-col gap-2">
      {choices.map((choice, index) => {
        const correct = selected !== null && choice.correct;
        const wrong = selected === choice.text && !choice.correct;
        const label = gap ? (choice.parts.find((part) => part.marked)?.text ?? choice.text) : choice.text;
        return (
          <Button
            // Choices have no id; their order is fixed for a sentence.
            // biome-ignore lint/suspicious/noArrayIndexKey: positional list
            key={`${index}:${choice.text}`}
            label={label}
            onPress={() => onAnswer(choice.text)}
            fill={correct ? colors.greenDeep : wrong ? '#5c2632' : colors.maroon}
            border={correct ? colors.green : wrong ? colors.red : '#7a4b56'}
            className={selected !== null && !correct && !wrong ? 'opacity-55' : undefined}
            contentClassName="relative min-h-[52px]! px-3! py-2!"
          >
            {selected === null && (
              <Label
                pixel
                muted
                className="pointer-events-none absolute top-[3px] left-2 hidden text-[11px] leading-[14px] min-[1024px]:block"
              >
                {index + 1}
              </Label>
            )}
            <span className="relative flex w-full items-center self-stretch">
              <span className="flex min-w-0 flex-1 flex-col gap-1 px-[30px]">
                <Label
                  className={`block text-center text-[17px] leading-[23px] ${gap ? 'line-clamp-2' : 'line-clamp-4'}`}
                >
                  {label}
                </Label>
                {wrong && choice.reason && (
                  <Label className="block text-center text-[13px] leading-[18px]" style={{ color: colors.cream }}>
                    {choice.reason}
                  </Label>
                )}
              </span>
              {correct && (
                <PixelFrame
                  fill="#25b36b"
                  border={null}
                  className="absolute right-0"
                  contentClassName="flex h-[30px] w-[30px] items-center justify-center"
                >
                  <Icon name="check" color="#ffffff" size={22} />
                </PixelFrame>
              )}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The right translation with the tested phrase blanked out, shown once above the phrase buttons. After an answer
 * the gap fills with the right phrase.
 */
export function GapSentence({ gap, answer }: { gap: { before: string; after: string }; answer?: string }) {
  return (
    <Label className="block text-[17px] leading-[26px]">
      {gap.before}
      {answer === undefined ? (
        <span
          role="img"
          aria-label="blank"
          className="inline-block h-[1em] w-[110px] border-b-2 border-combo align-bottom"
        />
      ) : (
        <span className="font-bold text-combo underline decoration-combo">{answer}</span>
      )}
      {gap.after}
    </Label>
  );
}
