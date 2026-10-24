import { useAvailableReviewList } from '@kashi-koi/core/data/reviewVisibility';
import { nextDue, reviewTime } from '@kashi-koi/core/lyrics/review';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import { HarborScene } from '@/components/Harbor';
import { TabHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { PixelFrame } from '@/components/PixelFrame';
import { RecentlyPlayed } from '@/components/RecentlyPlayed';
import { Screen } from '@/components/Screen';
import { useDueCount } from '@/components/TabBar';
import { Label } from '@/components/ui';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useNow } from '@/hooks/useNow';

export const Route = createFileRoute('/_app/')({ component: HomeScreen });

/**
 * Phone Home: the harbor hero scrolls away and its review row overlaps the dock's bottom edge. The row keeps one
 * height either way: red with the count when something is due, quiet with the next due day once nothing is, when she
 * holds up her catch. The desktop has no separate Home: the Library, with Recently played on top, is its home,
 * and the harbor lives in the harbor pane.
 */
function HomeScreen() {
  const count = useDueCount();
  const reviewList = useAvailableReviewList();
  const now = useNow();
  if (useIsDesktop()) return <Navigate to="/library" replace />;
  return (
    <Screen header={<TabHeader />}>
      {/* The review row rides 26px over the hero's bottom edge, so she sits on the deck above it. */}
      <HarborScene
        className="h-[250px]"
        covered={26}
        left={26}
        size={() => 240}
        pose={count === 0 ? 'catch' : 'play'}
      />
      <div className="relative -mt-[26px] flex flex-col gap-[14px] px-4 pb-5">
        <Link
          to="/review"
          aria-label="Open review list"
          className="block transition-[filter] active:opacity-70 hover:brightness-110"
        >
          {count === 0 ? (
            <PixelFrame
              fill={colors.surface}
              border="#363a5e"
              contentClassName="flex h-[56px] items-center gap-[10px] pr-4 pl-[14px]"
            >
              <Icon name="check" color={colors.green} size={24} />
              <Label pixel className="text-[24px] tracking-[0.5px]">
                ALL CAUGHT UP
              </Label>
              <Label muted lines={1} className="ml-auto text-[13px]">
                {nextDue(reviewList, now)}
              </Label>
            </PixelFrame>
          ) : (
            <PixelFrame
              fill={colors.coralDeep}
              border="#ff8f9b"
              contentClassName="flex h-[56px] items-center gap-[10px] pr-[10px] pl-[14px]"
            >
              <Icon name="musicFilled" size={30} color={colors.cream} />
              <Label pixel className="text-[24px] tracking-[0.5px]">
                REVIEW {count} {count === 1 ? 'LYRIC' : 'LYRICS'}
              </Label>
              <Label className="ml-auto text-[13px]">{reviewTime}</Label>
              <PixelFrame
                fill={colors.coralSoft}
                border={null}
                contentClassName="flex h-10 w-10 items-center justify-center"
              >
                <Icon name="next" size={30} />
              </PixelFrame>
            </PixelFrame>
          )}
        </Link>
        <RecentlyPlayed rows={2} minTile={100} />
      </div>
    </Screen>
  );
}
