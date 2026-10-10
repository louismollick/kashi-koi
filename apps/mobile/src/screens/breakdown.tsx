import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, type ViewStyle, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { colors } from '@/constants/theme';
import { englishSpans, loadBreakdown, useBreakdown } from '@/analysis/breakdowns';
import { alignReading } from '@/japanese/text';
import { currentSentence, libraryStore } from '@/store/libraryStore';
import { FuriganaLine } from '@/components/LineCard';
import { Button, IconButton, Label, styles } from '@/components/ui';

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
  const parts: { text: string; on?: boolean }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (cursor < span.start) parts.push({ text: translation.slice(cursor, span.start) });
    parts.push({ text: translation.slice(span.start, span.end), on: true });
    cursor = span.end;
  }
  if (cursor < translation.length) parts.push({ text: translation.slice(cursor) });
  return (
    <Label style={{ fontSize: 17, lineHeight: 24 }}>
      {parts.map((part, index) =>
        part.on ? (
          <Label key={index} style={{ fontSize: 17, lineHeight: 24, color: tapped }}>
            {part.text}
          </Label>
        ) : (
          part.text
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 8 }}>
      {chunks.map((chunk, index) => (
        <Pressable
          key={index}
          accessibilityRole="button"
          accessibilityLabel={chunk.text}
          accessibilityState={{ selected: index === selected }}
          onPress={() => onSelect(index)}
          style={{
            maxWidth: '100%',
            paddingBottom: 1,
            borderBottomWidth: 2,
            borderBottomColor: index === selected ? tapped : '#3a3a52',
          }}
        >
          <FuriganaLine
            compact
            size={21}
            color={index === selected ? tapped : undefined}
            line={{ id: chunk.text, segments: alignReading(chunk.text, chunk.reading || undefined) }}
          />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * One chunk: its reading once in the heading, then its build-up on a rail, then its note. A chunk with one step
 * (a plain word) keeps its meaning beside the heading instead of a one-row rail.
 */
function Ladder({ chunk, on }: { chunk: Chunk; on: boolean }) {
  const single = chunk.steps.length === 1;
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <FuriganaLine
          compact
          size={19}
          color={on ? tapped : undefined}
          line={{ id: chunk.text, segments: alignReading(chunk.text, chunk.reading || undefined) }}
        />
        {single && (
          <Label style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, lineHeight: 19, paddingBottom: 2 }}>
            {chunk.steps[0]?.english}
          </Label>
        )}
      </View>
      {!single && (
        <View
          style={{ marginLeft: 4, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: on ? tapped : colors.track }}
        >
          {chunk.steps.map((step, index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                columnGap: 12,
                paddingVertical: 2,
              }}
            >
              <FuriganaLine
                compact
                furigana={false}
                size={16}
                highlightFrom={addedFrom(chunk.steps[index - 1]?.japanese, step.japanese)}
                line={{ id: `${index}`, segments: [{ text: step.japanese }] }}
              />
              <Label
                muted={index < chunk.steps.length - 1}
                style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, lineHeight: 19 }}
              >
                {step.english}
              </Label>
            </View>
          ))}
        </View>
      )}
      {!!chunk.note && <Label style={{ color: colors.lavender, fontSize: 14, lineHeight: 20 }}>{chunk.note}</Label>}
    </View>
  );
}

/**
 * Drawer explaining one sentence of an analyzed song. Playback keeps going underneath. The sentence and its
 * translation stay pinned while the chunks scroll; tapping a chunk (or its explanation) lights it everywhere and
 * scrolls to its explanation. The first chunk starts selected so it is clear chunks can be tapped.
 */
export default function BreakdownScreen() {
  const { songId, sentenceId } = useLocalSearchParams<{ songId: string; sentenceId: string }>();
  libraryStore((state) => state.lyrics[songId]);
  const { target, state } = useBreakdown(songId, sentenceId);
  const sentence = target ? currentSentence(songId, target.start) : undefined;
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<number | undefined>(0);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});
  // iOS does not clamp scrollTo, so keep the scrollable range to avoid scrolling past the end.
  const range = useRef({ content: 0, viewport: 0 });
  // Reload whenever the state is cleared, e.g. when a replacement analysis drops cached breakdowns.
  useEffect(() => {
    if (!state) void loadBreakdown(songId, sentenceId);
  }, [songId, sentenceId, state]);

  const chunks = state?.status === 'ready' ? state.breakdown.chunks : [];
  const select = (index: number) => {
    const next = index === selected ? undefined : index;
    setSelected(next);
    const offset = next === undefined ? undefined : offsets.current[next];
    if (offset === undefined) return;
    const end = Math.max(0, range.current.content - range.current.viewport);
    scroll.current?.scrollTo({ y: Math.min(end, Math.max(0, offset - 14)), animated: true });
  };
  // Explanations are direct children of the scroll content, so their layout y is their scroll offset.
  const item = (index: number, child: ReactNode, style?: ViewStyle) => (
    <Pressable
      key={index}
      onPress={() => select(index)}
      onLayout={(event) => {
        offsets.current[index] = event.nativeEvent.layout.y;
      }}
      style={style}
    >
      {child}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#090a1699' }}>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={{ flex: 1 }}
      />
      <View
        style={{
          height: Math.min(height * 0.84, height - insets.top - 12),
          backgroundColor: colors.bg,
          borderTopWidth: 2,
          borderTopColor: colors.track,
        }}
      >
        <View style={[styles.row, { paddingHorizontal: 14, paddingTop: 14 }]}>
          <IconButton name="close" label="Close" onPress={() => router.back()} />
        </View>
        {sentence && (
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 16,
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.track,
            }}
          >
            {chunks.length ? (
              <ChunkSentence chunks={chunks} selected={selected} onSelect={select} />
            ) : (
              sentence.lines.map((line, index) => <FuriganaLine key={index} compact size={21} line={line} />)
            )}
            <Translation translation={sentence.sentence.translation ?? ''} chunks={chunks} selected={selected} />
          </View>
        )}
        <ScrollView
          ref={scroll}
          onLayout={(event) => {
            range.current.viewport = event.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, content) => {
            range.current.content = content;
          }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 24 }}
        >
          {chunks.map((chunk, index) =>
            item(index, <Ladder chunk={chunk} on={index === selected} />, { paddingBottom: 22 }),
          )}
          {state?.status === 'ready' ? null : state?.status === 'failed' ? (
            <View style={{ gap: 12, alignItems: 'flex-start' }}>
              <Label style={{ color: colors.red }}>{state.error}</Label>
              <Button label="Retry breakdown" onPress={() => void loadBreakdown(songId, sentenceId)}>
                <Label style={{ fontWeight: '700' }}>RETRY</Label>
              </Button>
            </View>
          ) : state?.status === 'missing' || !target ? (
            <Label muted>Not explained yet</Label>
          ) : (
            <ActivityIndicator size="small" color={colors.lavender} accessibilityLabel="Explaining sentence" />
          )}
        </ScrollView>
      </View>
    </View>
  );
}
