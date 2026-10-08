import { isJapanese } from '@/japanese/text';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { appStore } from '@/store/appStore';
import { getLineText, getLyrics, libraryStore } from '@/store/libraryStore';
import { CenteredList, LyricRow } from '@/components/Lyrics';
import { IconButton, Label, styles } from '@/components/ui';

/** Drawer that moves a ReviewList entry to another Japanese line of its song, or removes it. */
export default function EditLineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  libraryStore((state) => state.lyrics);
  const reviewList = appStore((state) => state.reviewList);
  const showTranslations = appStore((state) => state.showTranslations);
  const item = reviewList.find((line) => line.id === id);
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lines = item ? getLyrics(item.songId).lines.filter((line) => isJapanese(getLineText(line))) : [];
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
            Study a different lyric
          </Label>
          {item && (
            <IconButton
              name="trash"
              fill={colors.coral}
              border="#ff9aa5"
              label="Remove from review"
              onPress={() => {
                appStore.getState().removeReviewLine(item.id);
                router.back();
              }}
            />
          )}
        </View>
        {item && (
          <CenteredList index={lines.findIndex((line) => line.id === item.lineId)}>
            {lines.map((line) => {
              const taken = reviewList.some((entry) => entry.id !== item.id && entry.lineId === line.id);
              return (
                <Pressable
                  key={line.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Study ${getLineText(line)}`}
                  disabled={taken}
                  accessibilityState={{ disabled: taken }}
                  onPress={() => appStore.getState().moveReviewLine(item.id, line.id)}
                >
                  <LyricRow
                    line={line}
                    current={line.id === item.lineId}
                    translations={showTranslations}
                    marked={taken}
                  />
                </Pressable>
              );
            })}
          </CenteredList>
        )}
      </View>
    </View>
  );
}
