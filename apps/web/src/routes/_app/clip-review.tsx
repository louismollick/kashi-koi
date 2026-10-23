import { canExplain } from '@kashi-koi/core/analysis/breakdowns';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getSong, libraryStore, sentenceForReview } from '@kashi-koi/core/store/libraryStore';
import type { ClipReview } from '@kashi-koi/core/types/domain';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { ScreenHeader } from '@/components/Header';
import { PlayerBar } from '@/components/PlayerBar';
import { DockScene, QuizColumn, RunResult } from '@/components/QuizLayout';
import { Button, Label, Tag } from '@/components/ui';
import { openBreakdown } from '@/lib/panels';

export const Route = createFileRoute('/_app/clip-review')({ component: ClipReviewScreen });

let stopping: ReturnType<typeof setTimeout> | undefined;

/** Untimed clips in the same layout as quiz mode; each keeps its first answer. */
function ClipReviewScreen() {
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
    // Leaving ends the session. Deferred a tick so React StrictMode's dev-only unmount and remount doesn't end it.
    const pending = stopping;
    if (pending) clearTimeout(pending);
    return () => {
      stopping = setTimeout(() => appStore.getState().stopClipReview(), 0);
    };
  }, []);
  if (clip) last.current = clip;
  const back = () => router.history.back();
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
      <div className="flex min-h-0 flex-1 flex-col bg-bg">
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
          <Button label="Back to review" onPress={back} className="w-full">
            <Label pixel className="text-lg font-bold">
              BACK TO REVIEW
            </Label>
          </Button>
        </DockScene>
      </div>
    );
  }
  const song = getSong(item.songId);
  if (!song) return null;
  const current = sentenceForReview(item),
    answer = clip.answers[item.id];
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <ScreenHeader sheet title={`Sentence ${clip.index + 1} of ${clip.ids.length}`} />
      <QuizColumn
        lines={current?.lines}
        isNew={item.kind === 'new'}
        choices={clip.choices[item.sentenceId] ?? []}
        selected={answer?.choice ?? null}
        nice={answer?.correct === true}
        combo={clip.combo}
        onAnswer={(choice) => appStore.getState().answerClip(choice)}
        onExplain={canExplain(song.id) ? () => openBreakdown(song.id, item.sentenceId) : undefined}
        onContinue={() => appStore.getState().nextClip()}
        continueLabel="NEXT"
      />
      <PlayerBar clipReview />
    </div>
  );
}
