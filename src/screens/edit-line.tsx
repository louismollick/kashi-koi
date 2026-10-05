import { isJapanese } from '@/japanese/text';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { appStore } from '@/store/appStore';
import { getLineText, getSong, getLyrics, libraryStore } from '@/store/libraryStore';
import { PixelFrame } from '@/components/PixelFrame';
import { IconButton, Button, Label, styles } from '@/components/ui';

/** Sheet edits the selected ReviewList line immediately, including ClipReview. */
export default function EditLineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  libraryStore(state => state.lyrics);
  const reviewList = appStore(state => state.reviewList);
  const item = appStore(state => state.reviewList.find(line => line.id === id));
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!item) return <View style={[styles.page, { justifyContent: 'center', padding: 24 }]}><Label>Line removed from review</Label><Button onPress={() => router.back()}><Label>Done</Label></Button></View>;
  const song = getSong(item.songId);
  if (!song) return null;
  const index = getLyrics(song.id).lines.findIndex(line => line.id === item.lineId);
  return <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#090a1699' }}>
    <Pressable accessibilityLabel="Close edit line" accessibilityRole="button" onPress={() => router.back()} style={{ flex: 1 }} />
    <View style={{ height: height * 0.84, backgroundColor: colors.header, padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 12 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><View><Label style={styles.title}>Edit line</Label><Label muted style={{ fontSize: 12 }}>{song.title} · {song.artist}</Label></View><IconButton name="close" label="Done editing" onPress={() => router.back()} /></View>
      <Label muted style={{ fontSize: 12 }}>Tap a line to move it</Label>
      <ScrollView contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
        {getLyrics(song.id).lines.slice(Math.max(0, index - 4), Math.min(getLyrics(song.id).lines.length, index + 5)).map(line => {
          const inReview = reviewList.some(entry => entry.id !== item.id && entry.lineId === line.id);
          return <PixelFrame key={line.id} fill={line.id === item.lineId ? colors.coralDeep : colors.surface} contentStyle={[styles.row, { padding: 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move to ${getLineText(line)}`} disabled={inReview || !isJapanese(getLineText(line))} accessibilityState={{ disabled: inReview || !isJapanese(getLineText(line)) }} onPress={() => appStore.getState().moveReviewLine(item.id, line.id)} style={{ flex: 1, padding: 4, opacity: inReview ? 0.45 : 1 }}><Label style={{ fontSize: 16, lineHeight: 25 }}>{getLineText(line)}</Label><Label muted style={{ fontSize: 12 }}>{line.translation}</Label>{inReview && <Label muted style={{ fontSize: 10 }}>in review</Label>}</Pressable>
          <IconButton name="play" label={`Preview ${getLineText(line)}`} size={32} fill={colors.slate} onPress={() => { /* Clip preview is intentionally silent in the UI shell. */ }} />
        </PixelFrame>; })}
      </ScrollView>
      <Button label="Remove from review" fill={colors.maroon} onPress={() => { appStore.getState().removeReviewLine(item.id); router.back(); }}><Label style={{ color: colors.coral, fontWeight: '600' }}>Remove from review</Label></Button>
    </View>
  </View>;
}
