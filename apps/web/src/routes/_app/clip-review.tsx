import { canExplain } from '@kashi-koi/core/analysis/breakdowns';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getSong, libraryStore, sentenceForReview } from '@kashi-koi/core/store/libraryStore';
import type { ClipReview } from '@kashi-koi/core/types/domain';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { ScreenHeader } from '@/components/Header';
import { PlayerBar } from '@/components/PlayerBar';
import { DockScene, QuizColumn, RunResult } from '@/components/QuizLayout';
import { Button, IconButton, Label, Tag } from '@/components/ui';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { openBreakdown } from '@/lib/panels';

export const Route = createFileRoute('/_app/clip-review')({ component: ClipReviewScreen });

let stopping: ReturnType<typeof setTimeout> | undefined;

/**
 * Untimed clips in the same layout as quiz mode; each keeps its first answer. The phone shows it full screen; the
 * desktop shell mounts it in the harbor pane beside the review list, with a close button on the stage, the count as the
 * dialogue box's tag and the clip in the window's now playing bar.
 */
function ClipReviewScreen() {
  const router = useRouter();
  const desktop = useIsDesktop();
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
  const navigate = useNavigate();
  // A tab opened straight on clip review has nothing to go back to, so it lands on the review list.
  const back = () => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/review', replace: true }));
  const close = <IconButton name="close" size={40} label="Close review" onPress={back} />;
  // Close rides the stage's top right on the desktop.
  const overlay = desktop ? (
    <>
      <span />
      {close}
    </>
  ) : undefined;
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
        {!desktop && <ScreenHeader sheet />}
        <DockScene
          combo={0}
          nice={false}
          best={results.length ? { combo: best, perfect } : undefined}
          // She lands a koi when at least one clip was right.
          pose={hits > 0 ? 'catch' : 'play'}
          overlay={overlay}
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
            <Label pixel className="text-[23px]">
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
      {!desktop && <ScreenHeader sheet title={`Sentence ${clip.index + 1} of ${clip.ids.length}`} />}
      <QuizColumn
        overlay={overlay}
        count={desktop ? `${clip.index + 1} OF ${clip.ids.length}` : undefined}
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
      {!desktop && <PlayerBar clipReview />}
    </div>
  );
}
