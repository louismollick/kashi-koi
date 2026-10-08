import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { appStore } from '@/store/appStore';
import { getSong, getLyrics, occurrenceLine, libraryStore } from '@/store/libraryStore';
import { ScreenHeader } from '@/components/Header';
import { QuizColumn } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { Button, Label, styles } from '@/components/ui';

/** Untimed clips in the same sheet as quiz mode; each keeps its first answer. */
export default function ClipReviewScreen() {
  const router = useRouter();
  const clip = appStore((state) => state.clipReview);
  const reviewList = appStore((state) => state.reviewList);
  libraryStore((state) => state.lyrics);
  const item = reviewList.find((line) => line.id === clip?.ids[clip.index]);
  useEffect(() => {
    if (!appStore.getState().clipReview) appStore.getState().setPlaying(false);
    return () => appStore.getState().stopClipReview();
  }, []);
  if (!clip || !item)
    return (
      <View style={styles.page}>
        <ScreenHeader sheet />
        <View style={styles.content}>
          <Label>All done for now</Label>
          <Button onPress={() => router.back()}>
            <Label>Back to review</Label>
          </Button>
        </View>
      </View>
    );
  const song = getSong(item.songId);
  if (!song) return null;
  const lyrics = getLyrics(song.id),
    lineIndex = lyrics.timeline.findIndex((occurrence) => occurrence.lineId === item.sentenceId);
  const line = occurrenceLine(song.id, lineIndex),
    answer = clip.answers[item.id];
  return (
    <View style={styles.page}>
      <ScreenHeader sheet title={`Reviewing lyric ${clip.index + 1} of ${clip.ids.length}`} />
      <QuizColumn
        line={line}
        isNew={item.kind === 'new'}
        choices={clip.choices[item.sentenceId] ?? []}
        selected={answer?.choice ?? null}
        nice={answer?.correct === true}
        combo={clip.combo}
        onAnswer={(choice) => appStore.getState().answerClip(choice)}
      />
      <PlayerBar clipReview />
    </View>
  );
}
