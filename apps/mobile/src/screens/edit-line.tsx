import { Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { appStore } from '@/store/appStore';
import { currentSentence, getLineText, getLyrics, libraryStore } from '@/store/libraryStore';
import { CenteredList, LyricRow } from '@/components/Lyrics';
import { IconButton, Label, styles } from '@/components/ui';

/** Drawer that moves a ReviewList entry to another sentence of its song, or removes it. */
export default function EditLineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  libraryStore((state) => state.lyrics);
  const reviewList = appStore((state) => state.reviewList);
  const showTranslations = appStore((state) => state.showTranslations);
  const item = reviewList.find((line) => line.id === id);
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Each sentence once, in song order, with the lines of its first occurrence.
  const sentences = item
    ? getLyrics(item.songId)
        .sentenceTimeline.filter(
          (occurrence, index, all) => all.findIndex((other) => other.sentenceId === occurrence.sentenceId) === index,
        )
        .flatMap((occurrence) => currentSentence(item.songId, occurrence.start) ?? [])
    : [];
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
          backgroundColor: colors.header,
          paddingBottom: insets.bottom,
        }}
      >
        <View style={[styles.row, { padding: 14 }]}>
          <IconButton name="close" label="Close" onPress={() => router.back()} />
          <Label numberOfLines={1} style={[styles.title, { flex: 1, fontSize: 19, lineHeight: 24 }]}>
            Study a different sentence
          </Label>
          {item && (
            <IconButton
              name="trash"
              fill={colors.coral}
              border="#ff9aa5"
              label="Remove from review"
              onPress={() => {
                appStore.getState().removeReviewSentence(item.id);
                router.back();
              }}
            />
          )}
        </View>
        {item && (
          <CenteredList index={sentences.findIndex(({ sentence }) => sentence.id === item.sentenceId)}>
            {sentences.map(({ sentence, lines }) => {
              const taken = reviewList.some((entry) => entry.id !== item.id && entry.sentenceId === sentence.id);
              const text = lines.map(getLineText).join(' ');
              return (
                <Pressable
                  key={sentence.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Study ${text}`}
                  disabled={taken}
                  accessibilityState={{ disabled: taken }}
                  onPress={() => appStore.getState().moveReviewSentence(item.id, sentence.id)}
                  style={{ gap: 4 }}
                >
                  {lines.map((line, index) => (
                    <LyricRow
                      key={index}
                      line={line}
                      current={sentence.id === item.sentenceId}
                      furigana={showTranslations}
                      translation={showTranslations && index === lines.length - 1 ? sentence.translation : undefined}
                      marked={taken && index === 0}
                    />
                  ))}
                </Pressable>
              );
            })}
          </CenteredList>
        )}
      </View>
    </View>
  );
}
