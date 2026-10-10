import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { colors } from '@/constants/theme';
import { loadBreakdown, useBreakdown } from '@/analysis/breakdowns';
import { alignReading } from '@/japanese/text';
import { currentSentence, libraryStore } from '@/store/libraryStore';
import { FuriganaLine } from '@/components/LineCard';
import { Button, IconButton, Label, styles } from '@/components/ui';

/** Chunk colors, matched between the chunk map, the translation and each build-up. Lavender stays for notes. */
const chunkColors = ['#6fb8ff', '#6ee0a8', '#ffa45c', '#ff85b8', '#d4e157', '#ff6b6b', '#d7b899'];
const colorOf = (index: number) => chunkColors[index % chunkColors.length]!;
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

/** The translation with each chunk's matching words in that chunk's color. Overlapping matches keep the first. */
function ColoredTranslation({ translation, chunks }: { translation: string; chunks: Chunk[] }) {
  const spans: { start: number; end: number; color: string }[] = [];
  chunks.forEach((chunk, index) => {
    if (!chunk.english) return;
    for (
      let start = translation.indexOf(chunk.english);
      start >= 0;
      start = translation.indexOf(chunk.english, start + 1)
    ) {
      const end = start + chunk.english.length;
      if (spans.some((span) => start < span.end && span.start < end)) continue;
      spans.push({ start, end, color: colorOf(index) });
      break;
    }
  });
  spans.sort((a, b) => a.start - b.start);
  const parts: { text: string; color?: string }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (cursor < span.start) parts.push({ text: translation.slice(cursor, span.start) });
    parts.push({ text: translation.slice(span.start, span.end), color: span.color });
    cursor = span.end;
  }
  if (cursor < translation.length) parts.push({ text: translation.slice(cursor) });
  return (
    <Label style={{ fontSize: 17, lineHeight: 24 }}>
      {parts.map((part, index) =>
        part.color ? (
          <Label key={index} style={{ fontSize: 17, lineHeight: 24, color: part.color }}>
            {part.text}
          </Label>
        ) : (
          part.text
        ),
      )}
    </Label>
  );
}

/** The sentence as colored chunks, each with its reading above and a short gloss below. */
function ChunkMap({ chunks }: { chunks: Chunk[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 12 }}>
      {chunks.map((chunk, index) => (
        <View
          key={index}
          style={{ borderTopWidth: 3, borderTopColor: colorOf(index), paddingTop: 2, maxWidth: '100%' }}
        >
          <FuriganaLine
            compact
            size={18}
            line={{ id: chunk.text, segments: alignReading(chunk.text, chunk.reading || undefined) }}
          />
          <Label muted style={{ fontSize: 12, lineHeight: 16 }}>
            {chunk.steps.at(-1)?.english}
          </Label>
        </View>
      ))}
    </View>
  );
}

/** One chunk built up from its dictionary form on a rail in the chunk's color, with its grammar note last. */
function ChunkSteps({ chunk, color }: { chunk: Chunk; color: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <FuriganaLine
          compact
          size={19}
          color={color}
          line={{ id: chunk.text, segments: alignReading(chunk.text, chunk.reading || undefined) }}
        />
        <Label style={{ flexShrink: 1, textAlign: 'right', paddingBottom: 2 }}>{chunk.steps.at(-1)?.english}</Label>
      </View>
      {chunk.steps.length > 1 && (
        <View style={{ marginLeft: 4, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: `${color}66`, gap: 4 }}>
          {chunk.steps.map((step, index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                columnGap: 12,
              }}
            >
              <FuriganaLine
                compact
                size={16}
                highlightFrom={addedFrom(chunk.steps[index - 1]?.japanese, step.japanese)}
                line={{ id: `${index}`, segments: alignReading(step.japanese, step.reading || undefined) }}
              />
              <Label
                muted={index < chunk.steps.length - 1}
                style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, lineHeight: 19, paddingBottom: 1 }}
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

/** Drawer explaining one sentence of an analyzed song. Playback keeps going underneath. */
export default function BreakdownScreen() {
  const { songId, sentenceId } = useLocalSearchParams<{ songId: string; sentenceId: string }>();
  libraryStore((state) => state.lyrics[songId]);
  const { target, state } = useBreakdown(songId, sentenceId);
  const sentence = target ? currentSentence(songId, target.start) : undefined;
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Reload whenever the state is cleared, e.g. when a replacement analysis drops cached breakdowns.
  useEffect(() => {
    if (!state) void loadBreakdown(songId, sentenceId);
  }, [songId, sentenceId, state]);

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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 18 }}>
          {state?.status === 'ready' && sentence ? (
            <>
              <View style={{ gap: 14 }}>
                <ChunkMap chunks={state.breakdown.chunks} />
                <ColoredTranslation translation={sentence.sentence.translation ?? ''} chunks={state.breakdown.chunks} />
              </View>
              {state.breakdown.chunks.map((chunk, index) => (
                <View key={index} style={{ borderTopWidth: 1, borderTopColor: colors.track, paddingTop: 18 }}>
                  <ChunkSteps chunk={chunk} color={colorOf(index)} />
                </View>
              ))}
            </>
          ) : (
            sentence && (
              <View style={{ gap: 8 }}>
                {sentence.lines.map((line, index) => (
                  <FuriganaLine key={index} compact line={line} />
                ))}
                <Label style={{ fontSize: 17, lineHeight: 23 }}>{sentence.sentence.translation}</Label>
              </View>
            )
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
