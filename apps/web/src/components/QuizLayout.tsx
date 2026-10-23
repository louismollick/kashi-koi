import { gapOf } from '@kashi-koi/core/lyrics/choices';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { Choice, Line, RunEnd, SongLyrics } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { type ReactNode, useEffect, useRef } from 'react';
import harbor from '@/assets/background.webp';
import { useElementSize } from '@/hooks/useElementSize';
import { Answers, GapSentence } from './Answers';
import { FogStrip, useSongFog } from './Fog';
import { Icon } from './Icon';
import { SentenceLines } from './LineCard';
import { Mascot } from './Mascot';
import { PixelFrame } from './PixelFrame';
import { SongIntro } from './SongIntro';
import { Button, Label, Tag } from './ui';

/** A finished run's best combo, shown in place of the live one. */
type Best = { combo: number; perfect: boolean };
const harborAspect = 1498 / 1050;
/** How far the dialogue box rides up over the dock. */
const overlap = 24;
/** Springy overshoot for the NICE! pop, the CSS stand-in for the iOS spring. */
const spring = 'cubic-bezier(.2,.9,.3,1.2)';

/**
 * The harbor behind the quiz: she fishes from the dock, NICE! pops by her head and the combo lands in her bucket as
 * fish. The art and sprite stay pinned to the bottom, so a taller sentence only crops sky. `best` swaps the combo
 * for a finished run's best combo, with a gold koi when it was perfect.
 */
function Stage({ combo, nice, best }: { combo: number; nice: boolean; best?: Best }) {
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(box);
  // Zoomed past cover so the art's pixels read at phone size.
  const artWidth = Math.max(width * 1.6, height * harborAspect);
  const size = Math.max(0, Math.min(260, width * 0.62, height - 4));
  const bottom = overlap - size * 0.06;
  const note = {
    position: 'absolute',
    color: colors.coral,
    fontWeight: 900,
    lineHeight: 1,
    textShadow: `2px 2px 0 ${colors.cream}`,
  } as const;
  const count = best ? best.combo : combo;
  return (
    <div ref={box} className="relative min-h-[72px] grow basis-0 overflow-hidden">
      <img
        src={harbor}
        alt=""
        draggable={false}
        className="pixelated absolute bottom-0 max-w-none"
        style={{ left: -(artWidth - width) * 0.3, width: artWidth, height: artWidth / harborAspect }}
      />
      <div className="absolute left-1" style={{ bottom }}>
        <Mascot combo={combo} size={size} />
        {combo >= 3 && (
          <>
            <span aria-hidden style={{ ...note, left: 0, top: size * 0.12, fontSize: Math.min(30, size * 0.14) }}>
              ♪
            </span>
            <span
              aria-hidden
              style={{ ...note, right: size * 0.18, top: size * 0.02, fontSize: Math.min(24, size * 0.11) }}
            >
              ♪
            </span>
          </>
        )}
      </div>
      <div
        className="absolute"
        style={{
          left: size * 0.62,
          top: Math.max(8, height - bottom - size * 0.98),
          opacity: nice ? 1 : 0,
          transform: `scale(${nice ? 1 : 0.75}) rotate(-4deg)`,
          transition: nice ? `opacity 140ms, transform 420ms ${spring}` : 'opacity 140ms',
        }}
      >
        <PixelFrame fill={colors.cream} border={colors.coral} contentClassName="px-3 py-1">
          <Label pixel className="text-[26px]" style={{ color: colors.coralDeep }}>
            NICE!
          </Label>
        </PixelFrame>
      </div>
      <PixelFrame
        fill={colors.night}
        border="#363a5e"
        className="absolute! right-[14px]"
        style={{ bottom: overlap + 12 }}
        contentClassName="flex min-w-[92px] flex-col items-center px-3 pt-1.5 pb-2"
      >
        <Label pixel className="text-[18px] tracking-[1px]" style={{ color: colors.combo }}>
          {best ? 'BEST COMBO' : 'COMBO'}
        </Label>
        <Label
          pixel
          className="text-[52px]"
          style={{ color: colors.cream, textShadow: `3px 3px 0 ${colors.coralDeep}` }}
        >
          {count}
        </Label>
        {(best ? best.perfect : combo > 0) && (
          <span className="mt-0.5 flex gap-[3px]">
            {best ? (
              <Icon name="koi" size={24} color={colors.combo} />
            ) : (
              Array.from({ length: Math.min(combo, 5) }, (_, index) => (
                // The koi are identical; only their count matters.
                // biome-ignore lint/suspicious/noArrayIndexKey: identical icons
                <Icon key={index} name="koi" size={14} color={colors.koi} />
              ))
            )}
          </span>
        )}
      </PixelFrame>
    </div>
  );
}

const column = { display: 'flex', flexDirection: 'column', minHeight: 0 } as const;

/** RPG dialogue box: a cream border inside a dark ring, so it reads over the harbor art. `tag` sits on its top edge. */
function Dialog({ children, tag }: { children: ReactNode; tag?: ReactNode }) {
  return (
    <div className="relative mx-4 flex min-h-0 shrink flex-col" style={{ marginTop: -overlap }}>
      <PixelFrame fill={colors.night} border={null} style={column} contentStyle={{ ...column, padding: 3 }}>
        <PixelFrame
          fill={colors.night}
          border={colors.cream}
          style={column}
          contentStyle={{ ...column, gap: 8, padding: '16px 16px 10px' }}
        >
          {children}
        </PixelFrame>
      </PixelFrame>
      {tag && <div className="absolute -top-2 left-[14px]">{tag}</div>}
    </div>
  );
}

/** A finished run's score: gold "Perfect" or the hit count, one muted line, then optional tiles below. */
export function RunResult({
  perfect,
  score,
  detail,
  children,
}: {
  perfect: boolean;
  score: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Label pixel className="text-[36px]" style={{ color: perfect ? colors.combo : colors.cream }}>
        {perfect ? 'Perfect' : score}
      </Label>
      {(detail || perfect) && (
        <Label muted lines={1} className="max-w-full">
          {[detail, perfect && score].filter(Boolean).join(' · ')}
        </Label>
      )}
      {children && <div className="mt-2 self-stretch">{children}</div>}
    </div>
  );
}

/** The song that just finished, shown over the next song's intro, with its fog tiles. */
function RunSummary({ runEnd }: { runEnd: RunEnd }) {
  const title = libraryStore((state) => state.bySong[runEnd.songId]?.title);
  const { tiles } = useSongFog(runEnd.songId);
  return (
    <RunResult perfect={runEnd.perfect} score={`${runEnd.hits} of ${runEnd.answered} right`} detail={title}>
      <FogStrip tiles={tiles} />
    </RunResult>
  );
}

/**
 * The harbor stage with a dialogue box riding over its dock and `children` (answers or actions) below. Quiz mode,
 * clip review and the review's end screen share it.
 */
export function DockScene({
  combo,
  nice,
  best,
  tag,
  dialog,
  children,
}: {
  combo: number;
  nice: boolean;
  best?: Best;
  tag?: ReactNode;
  dialog: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <Stage combo={combo} nice={nice} best={best} />
      <Dialog tag={tag}>{dialog}</Dialog>
      <div className="shrink-0 px-4 pt-4">{children}</div>
    </div>
  );
}

/** Drains the deadline in a 3px bar, restarting full whenever a new deadline arrives. */
function AnswerTimeBar({ until }: { until: number }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const ms = Math.max(0, until - Date.now());
    const animation = fill.current?.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
      duration: ms,
      easing: 'linear',
      fill: 'forwards',
    });
    return () => animation?.cancel();
  }, [until]);
  return (
    <span className="block h-[3px] bg-track">
      <span ref={fill} className="block h-[3px] origin-left bg-coral" />
    </span>
  );
}

const actionLabel = 'text-[23px]';

/**
 * A fixed quiz column: the harbor stage, the sentence in a dialogue box over the dock, then the answers. `lines` is
 * the current sentence (or a gap line with no choices); before the first sentence an analysed song shows its intro,
 * or `runEnd`, the song that just finished, with PLAY AGAIN (`onReplay`). The sentence scrolls when it is long, so
 * the answers and, after a miss, EXPLAIN (`onExplain`) and CONTINUE (`onContinue`, when the song is held) always
 * stay on screen. `toast` sits just above the answers, so it never covers the sentence. `notice` replaces the
 * sentence with a short explanation, like a song with no analysis.
 */
export function QuizColumn({
  lines,
  current,
  intro,
  runEnd,
  onReplay,
  choices,
  selected,
  combo,
  nice,
  until,
  isNew = false,
  onAnswer,
  onExplain,
  onContinue,
  continueLabel = 'CONTINUE',
  toast,
  notice,
}: {
  lines?: Line[];
  current?: number;
  intro?: SongLyrics['analysis'];
  runEnd?: RunEnd;
  onReplay?: () => void;
  choices: Choice[];
  selected: string | null;
  combo: number;
  nice: boolean;
  until?: number | null;
  isNew?: boolean;
  onAnswer: (choice: string) => void;
  onExplain?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  toast?: ReactNode;
  notice?: string;
}) {
  // `nice` is the recorded grade, so the miss actions follow scoring even if cached choices went stale.
  const missed = selected !== null && !nice;
  const gap = gapOf(choices);
  const answer = selected === null ? undefined : choices.find((choice) => choice.correct);
  const summary = !lines?.length && runEnd;
  return (
    <DockScene
      combo={combo}
      nice={nice}
      best={summary ? { combo: summary.bestCombo, perfect: summary.perfect } : undefined}
      tag={summary ? <Tag>RUN COMPLETE</Tag> : isNew ? <Tag>NEW</Tag> : undefined}
      dialog={
        <>
          <div className="min-h-0 shrink overflow-y-auto">
            <div className="flex flex-col gap-[14px]">
              {notice ? (
                <Label muted className="block">
                  {notice}
                </Label>
              ) : summary ? (
                <RunSummary runEnd={summary} />
              ) : !lines?.length && intro ? (
                <SongIntro info={intro} />
              ) : (
                <SentenceLines
                  lines={lines?.length ? lines : [{ id: 'gap', segments: [{ text: '♪' }] }]}
                  current={current}
                />
              )}
              {gap && <GapSentence gap={gap} answer={answer?.parts.find((part) => part.marked)?.text} />}
            </div>
          </div>
          {/* Always reserved, so the deadline appearing doesn't resize the stage. */}
          <div className="h-[3px] shrink-0">{until != null && <AnswerTimeBar key={until} until={until} />}</div>
        </>
      }
    >
      {toast && <div className="mb-3">{toast}</div>}
      {summary && onReplay ? (
        <Button label="Play the finished song again" onPress={onReplay} className="w-full">
          <Label pixel className={actionLabel}>
            PLAY AGAIN
          </Label>
        </Button>
      ) : (
        <Answers choices={choices} selected={selected} onAnswer={onAnswer} />
      )}
      {missed && (onExplain || onContinue) && (
        <div className="mt-3 flex gap-[10px]">
          {onExplain && (
            <Button label="Explain this sentence" className="flex-1" onPress={onExplain}>
              <Label pixel className={actionLabel}>
                EXPLAIN
              </Label>
            </Button>
          )}
          {onContinue && (
            <Button
              label={continueLabel}
              className="flex-1"
              fill={colors.coral}
              border={colors.coralBorder}
              onPress={onContinue}
            >
              <Label pixel className={actionLabel}>
                {continueLabel}
              </Label>
            </Button>
          )}
        </div>
      )}
    </DockScene>
  );
}
