import { useAvailableReviewList } from '@kashi-koi/core/data/reviewVisibility';
import { isDue } from '@kashi-koi/core/lyrics/review';
import type { IconName } from '@kashi-koi/design/icons';
import { colors } from '@kashi-koi/design/tokens';
import { Link } from '@tanstack/react-router';
import { useNow } from '@/hooks/useNow';
import { Icon } from './Icon';
import { MiniPlayer } from './MiniPlayer';
import { PixelFrame } from './PixelFrame';
import { Label } from './ui';

/** The destinations in the phone tab bar. */
export const tabs = [
  { to: '/', title: 'Home', icon: 'home', activeIcon: 'homeFilled' },
  { to: '/library', title: 'Library', icon: 'musicFilled', activeIcon: 'musicFilled' },
  { to: '/review', title: 'Review', icon: 'book', activeIcon: 'book' },
] as const satisfies readonly { to: string; title: string; icon: IconName; activeIcon: IconName }[];

/** How many review lines are due now. */
export function useDueCount() {
  const reviewList = useAvailableReviewList();
  const now = useNow();
  return reviewList.filter((line) => isDue(line, now)).length;
}

/** Due-count badge on the Review tab and nav item. Pass `absolute!` to float it: the frame itself is `relative`. */
export function DueBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <PixelFrame
      fill={colors.coral}
      border={colors.bg}
      className={className}
      contentClassName="flex h-6 min-w-6 items-center justify-center px-1.5"
    >
      <Label pixel className="text-[16px]">
        {count}
      </Label>
    </PixelFrame>
  );
}

/** Mini player and tabs for the phone layout; they stay mounted while browsing the three main screens. */
export function TabBar() {
  const count = useDueCount();
  return (
    <nav aria-label="Main" className="shrink-0 bg-bg pb-[max(calc(env(safe-area-inset-bottom)-6px),10px)]">
      <MiniPlayer />
      <div className="flex pt-1.5">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.to === '/' }}
            className="flex flex-1 flex-col items-center gap-0.5 transition-[filter] active:opacity-70 hover:brightness-125"
          >
            {({ isActive }) => {
              const color = isActive ? colors.coral : colors.lavender;
              return (
                <>
                  <span className="relative block">
                    <Icon name={isActive ? tab.activeIcon : tab.icon} size={32} color={color} />
                    {tab.title === 'Review' && <DueBadge count={count} className="absolute! -top-2 left-[22px]" />}
                  </span>
                  <Label pixel className="text-[19px]" style={{ color }}>
                    {tab.title}
                  </Label>
                </>
              );
            }}
          </Link>
        ))}
      </div>
    </nav>
  );
}
