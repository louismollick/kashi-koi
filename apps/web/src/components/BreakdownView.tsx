import { englishSpans, loadBreakdown, useBreakdown } from '@kashi-koi/core/analysis/breakdowns';
import { alignReading } from '@kashi-koi/core/japanese/text';
import { currentSentence } from '@kashi-koi/core/store/libraryStore';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { colors } from '@kashi-koi/design/tokens';
import { useEffect, useRef, useState } from 'react';
import { PixelSpinner } from './PixelSpinner';
import { RubyLine } from './RubyLine';
import { Button, IconButton, Label } from './ui';

/** The one accent for a tapped chunk: the chunk, its English and its explanation. Yellow marks what a step adds. */
const tapped = '#6fb8ff';
type Chunk = Breakdown['chunks'][number];

/**
 * Where `next` stops repeating `previous`, so a step highlights only what it added. A form that shares nothing
 * with the previous step (する → した, ある → ない) is highlighted whole; the first step is never highlighted.
 */
function addedFrom(previous: string | undefined, next: string) {
  if (!previous || previous === next) return undefined;
  let index = 0;
  while (index < previous.length && previous[index] === next[index]) index++;
  return index < next.length ? index : undefined;
}

/** The chunk's text with its reading over the kanji. */
const chunkLine = (chunk: Chunk) => ({
  id: chunk.text,
  segments: alignReading(chunk.text, chunk.reading || undefined),
});

/** The plain translation, with the tapped chunk's English pieces in the accent. */
function Translation({
  translation,
  chunks,
  selected,
}: {
  translation: string;
  chunks: Chunk[];
  selected: number | undefined;
}) {
  const spans = englishSpans(translation, chunks).filter((span) => span.chunk === selected);
  const parts: { at: number; text: string; on?: boolean }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (cursor < span.start) parts.push({ at: cursor, text: translation.slice(cursor, span.start) });
    parts.push({ at: span.start, text: translation.slice(span.start, span.end), on: true });
    cursor = span.end;
  }
  if (cursor < translation.length) parts.push({ at: cursor, text: translation.slice(cursor) });
  return (
    <Label className="block text-[17px] leading-6">
      {parts.map((part) =>
        part.on ? (
          <span key={part.at} style={{ color: tapped }}>
            {part.text}
          </span>
        ) : (
          <span key={part.at}>{part.text}</span>
        ),
      )}
    </Label>
  );
}

/** The sentence as tappable chunks with quiet underlines. */
function ChunkSentence({
  chunks,
  selected,
  onSelect,
}: {
  chunks: Chunk[];
  selected: number | undefined;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-1.5 gap-y-2">
      {chunks.map((chunk, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: chunks never reorder
          key={index}
          type="button"
          aria-label={chunk.text}
          aria-pressed={index === selected}
          onClick={() => onSelect(index)}
          className="max-w-full border-b-2 pb-px text-left transition-[filter] hover:brightness-125"
          style={{ borderBottomColor: index === selected ? tapped : '#3a3a52' }}
        >
          <RubyLine compact size={21} color={index === selected ? tapped : undefined} line={chunkLine(chunk)} />
        </button>
      ))}
    </div>
  );
}

/**
 * One chunk: its reading and its role in the sentence once in the heading, then its build-up on a rail, then its
 * note. A chunk with one step (a plain word) keeps its meaning beside the heading instead of a one-row rail.
 */
function Ladder({ chunk, on }: { chunk: Chunk; on: boolean }) {
  const single = chunk.steps.length === 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-[10px]">
        <div className="flex shrink items-end gap-[10px]">
          <span className="shrink-0">
            <RubyLine compact size={19} color={on ? tapped : undefined} line={chunkLine(chunk)} />
          </span>
          <Label muted className="pb-[3px] text-[13px] leading-[18px]">
            {chunk.role}
          </Label>
        </div>
        {single && <Label className="shrink pb-0.5 text-right text-sm leading-[19px]">{chunk.steps[0]?.english}</Label>}
      </div>
      {!single && (
        <div className="ml-1 border-l-2 pl-[14px]" style={{ borderLeftColor: on ? tapped : colors.track }}>
          {chunk.steps.map((step, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: steps never reorder
              key={index}
              className="flex flex-wrap items-end justify-between gap-x-3 py-0.5"
            >
              <RubyLine
                compact
                furigana={false}
                size={16}
                highlightFrom={addedFrom(chunk.steps[index - 1]?.japanese, step.japanese)}
                line={{ id: `${index}`, segments: [{ text: step.japanese }] }}
              />
              <Label muted={index < chunk.steps.length - 1} className="shrink text-right text-sm leading-[19px]">
                {step.english}
              </Label>
            </div>
          ))}
        </div>
      )}
      {!!chunk.note && (
        <Label className="block text-sm leading-5" style={{ color: colors.lavender }}>
          {chunk.note}
        </Label>
      )}
    </div>
  );
}

/**
 * Explains one sentence of an analyzed song. Playback keeps going. The sentence and its translation stay pinned while
 * the chunks scroll; selecting a chunk (or its explanation) lights it everywhere and scrolls to its explanation. The
 * first chunk starts selected so it is clear chunks can be tapped. Fills its parent: the desktop player pane or a
 * phone route.
 */
export function BreakdownView({
  songId,
  sentenceId,
  onClose,
}: {
  songId: string;
  sentenceId: string;
  onClose: () => void;
}) {
  const { target, state } = useBreakdown(songId, sentenceId);
  const sentence = target ? currentSentence(songId, target.start) : undefined;
  const [selected, setSelected] = useState<number | undefined>(0);
  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  // Reload whenever the state is cleared, e.g. when a replacement analysis drops cached breakdowns.
  useEffect(() => {
    if (!state) void loadBreakdown(songId, sentenceId);
  }, [songId, sentenceId, state]);

  const chunks = state?.status === 'ready' ? state.breakdown.chunks : [];
  const select = (index: number) => {
    const next = index === selected ? undefined : index;
    setSelected(next);
    const element = next === undefined ? undefined : items.current[next];
    if (!element || !scroller.current) return;
    scroller.current.scrollTo({ top: Math.max(0, element.offsetTop - 14), behavior: 'smooth' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-[10px] px-[14px] pt-[14px]">
        <IconButton name="close" label="Close" onPress={onClose} />
      </div>
      {sentence && (
        <div className="flex shrink-0 flex-col gap-[10px] border-b border-track px-5 pt-3 pb-4">
          {chunks.length ? (
            <ChunkSentence chunks={chunks} selected={selected} onSelect={select} />
          ) : (
            sentence.lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines never reorder
              <RubyLine key={index} compact size={21} line={line} />
            ))
          )}
          <Translation translation={sentence.sentence.translation ?? ''} chunks={chunks} selected={selected} />
        </div>
      )}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-[14px] pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        {chunks.map((chunk, index) => (
          // A click anywhere in an explanation selects it; the chunk buttons above are the keyboard path.
          // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the pinned chunk buttons are the keyboard equivalent
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: chunks never reorder
            key={index}
            ref={(element) => {
              items.current[index] = element;
            }}
            onClick={() => select(index)}
            className="cursor-pointer pb-[22px]"
          >
            <Ladder chunk={chunk} on={index === selected} />
          </div>
        ))}
        {state?.status === 'ready' ? null : state?.status === 'failed' ? (
          <div className="flex flex-col items-start gap-3">
            <Label className="block" style={{ color: colors.red }}>
              {state.error}
            </Label>
            <Button label="Retry breakdown" onPress={() => void loadBreakdown(songId, sentenceId)}>
              <Label className="font-bold">RETRY</Label>
            </Button>
          </div>
        ) : state?.status === 'missing' || !target ? (
          <Label muted>Not explained yet</Label>
        ) : (
          <PixelSpinner color={colors.lavender} label="Explaining sentence" />
        )}
      </div>
    </div>
  );
}
