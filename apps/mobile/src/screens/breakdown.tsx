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

/** One chunk built up from its dictionary form, step by step, with its grammar note last. */
function Chunk({ chunk }: { chunk: Breakdown['chunks'][number] }) {
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontSize: 20, lineHeight: 26, fontWeight: '700' }}>{chunk.text}</Label>
      {chunk.steps.map((step, index) => (
        <View
          key={index}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 12, rowGap: 2 }}
        >
          <FuriganaLine
            compact
            size={17}
            line={{ id: `${index}`, segments: alignReading(step.japanese, step.reading || undefined) }}
          />
          <Label style={{ flexShrink: 1, paddingBottom: 1 }}>{step.english}</Label>
        </View>
      ))}
      {!!chunk.note && <Label style={{ color: colors.lavender }}>{chunk.note}</Label>}
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 26 }}>
          {sentence && (
            <View style={{ gap: 8 }}>
              {sentence.lines.map((line, index) => (
                <FuriganaLine key={index} compact line={line} />
              ))}
              <Label style={{ fontSize: 17, lineHeight: 23 }}>{sentence.sentence.translation}</Label>
            </View>
          )}
          {state?.status === 'ready' ? (
            state.breakdown.chunks.map((chunk, index) => <Chunk key={index} chunk={chunk} />)
          ) : state?.status === 'failed' ? (
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
