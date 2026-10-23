import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { canExplain } from '@kashi-koi/core/analysis/breakdowns';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getSong, libraryStore, sentenceForReview } from '@kashi-koi/core/store/libraryStore';
import type { ClipReview } from '@kashi-koi/core/types/domain';
import { ScreenHeader } from '@/components/Header';
import { DockScene, QuizColumn, RunResult } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { Button, Label, Tag, styles } from '@/components/ui';

/** Untimed clips in the same sheet as quiz mode; each keeps its first answer. */
export default function ClipReviewScreen() {
  const router = useRouter();
  const clip = appStore((state) => state.clipReview);
  const reviewList = appStore((state) => state.reviewList);
  const item = reviewList.find((line) => line.id === clip?.ids[clip.index]);
  // Re-render when this song's lyrics change (a translation or analysis lands); the helpers below read the store.
  libraryStore((state) => state.lyrics[item?.songId ?? '']);
  // The last session, so the end screen can score it after the store clears `clipReview`.
  const last = useRef<ClipReview | null>(null);
  useEffect(() => {
    if (!appStore.getState().clipReview) appStore.getState().setPlaying(false);
    return () => appStore.getState().stopClipReview();
  }, []);
  if (clip) last.current = clip;
  if (!clip || !item) {
    const done = last.current,
      results = done ? done.ids.flatMap((id) => done.answers[id] ?? []) : [],
      hits = results.filter((result) => result.correct).length;
    let best = 0,
      streak = 0;
    for (const result of results) {
      streak = result.correct ? streak + 1 : 0;
      best = Math.max(best, streak);
    }
    const perfect = !!done && results.length === done.ids.length && hits === results.length;
    return (
      <View style={styles.page}>
        <ScreenHeader sheet />
        <DockScene
          combo={0}
          nice={false}
          best={results.length ? { combo: best, perfect } : undefined}
          tag={results.length ? <Tag>REVIEW DONE</Tag> : undefined}
          dialog={
            results.length ? (
              <RunResult perfect={perfect} score={`${hits} of ${results.length} right`} />
            ) : (
              <RunResult perfect={false} score="All caught up" />
            )
          }
        >
          <Button label="Back to review" onPress={() => router.back()}>
            <Label pixel style={{ fontSize: 23 }}>
              BACK TO REVIEW
            </Label>
          </Button>
        </DockScene>
      </View>
    );
  }
  const song = getSong(item.songId);
  if (!song) return null;
  const current = sentenceForReview(item),
    answer = clip.answers[item.id];
  return (
    <View style={styles.page}>
      <ScreenHeader sheet title={`Sentence ${clip.index + 1} of ${clip.ids.length}`} />
      <QuizColumn
        lines={current?.lines}
        isNew={item.kind === 'new'}
        choices={clip.choices[item.sentenceId] ?? []}
        selected={answer?.choice ?? null}
        nice={answer?.correct === true}
        combo={clip.combo}
        onAnswer={(choice) => appStore.getState().answerClip(choice)}
        onExplain={
          canExplain(song.id)
            ? () => router.push({ pathname: '/breakdown', params: { songId: song.id, sentenceId: item.sentenceId } })
            : undefined
        }
        onContinue={() => appStore.getState().nextClip()}
        continueLabel="NEXT"
      />
      <PlayerBar clipReview />
    </View>
  );
}
