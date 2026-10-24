import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { HarborBackdrop } from '@/components/Harbor';
import { TabHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Mascot } from '@/components/Mascot';
import { PixelFrame } from '@/components/PixelFrame';
import { RecentlyPlayed } from '@/components/RecentlyPlayed';
import { Screen } from '@/components/Screen';
import { useDueCount } from '@/components/TabBar';
import { Label } from '@/components/ui';
import { useElementSize } from '@/hooks/useElementSize';
import { useIsDesktop } from '@/hooks/useIsDesktop';

export const Route = createFileRoute('/_app/')({ component: HomeScreen });

/**
 * Phone Home: the harbor hero scrolls away and its review card overlaps the dock's bottom edge. Once nothing is due
 * she holds up her catch. The desktop has no separate Home: the Library, with Recently played on top, is its home,
 * and the harbor lives in the harbor pane.
 */
function HomeScreen() {
  const count = useDueCount();
  const hero = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(hero);
  if (useIsDesktop()) return <Navigate to="/library" replace />;
  return (
    <Screen header={<TabHeader />}>
      <div ref={hero} className="relative h-[250px] overflow-hidden">
        <HarborBackdrop width={width} height={height} />
        <div className="absolute bottom-2 left-[26px]">
          <Mascot size={240} pose={count === 0 ? 'catch' : 'play'} />
        </div>
      </div>
      <div className="relative -mt-[26px] flex flex-col gap-[14px] px-4 pb-5">
        <Link
          to="/review"
          aria-label="Open review list"
          className="block transition-[filter] active:opacity-70 hover:brightness-110"
        >
          {count === 0 ? (
            <PixelFrame fill={colors.surface} border="#363a5e" contentClassName="flex items-center gap-[10px] p-[14px]">
              <Icon name="check" color={colors.green} size={22} />
              <Label className="font-semibold">All caught up</Label>
            </PixelFrame>
          ) : (
            <PixelFrame
              fill={colors.coralDeep}
              border="#ff8f9b"
              contentClassName="flex min-h-[122px] items-center gap-[10px] px-[18px] py-[14px]"
            >
              <Icon name="musicFilled" size={54} color={colors.cream} />
              <span className="flex flex-1 flex-col items-center">
                <Label pixel className="text-[29px] tracking-[1px]">
                  REVIEW
                </Label>
                <Label pixel className="text-[44px]">
                  {count}
                </Label>
                <Label pixel className="text-[29px] tracking-[1px]">
                  LYRICS
                </Label>
              </span>
              <PixelFrame
                fill={colors.coralSoft}
                border={null}
                contentClassName="flex h-[52px] w-[52px] items-center justify-center"
              >
                <Icon name="next" size={40} />
              </PixelFrame>
            </PixelFrame>
          )}
        </Link>
        <RecentlyPlayed rows={2} minTile={100} />
      </div>
    </Screen>
  );
}
