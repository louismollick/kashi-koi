import { Outlet, useLocation } from '@tanstack/react-router';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { NavRail } from './NavRail';
import { PlayerPane } from './PlayerPane';
import { TabBar } from './TabBar';

/**
 * The signed-in app frame. Phone: the screen, then the mini player and tab bar, like the iOS tabs. Desktop (1024px
 * and up): nav rail, browse column and player pane side by side, each scrolling on its own, with hairlines between
 * them and no mini player or tab bar.
 */
export function Shell() {
  // The full player covers the tab bar, like the iOS player screen above the tabs.
  const fullScreen = useLocation({ select: (location) => location.pathname === '/player' });
  if (useIsDesktop())
    return (
      <div className="grid h-dvh grid-cols-[220px_minmax(0,1fr)_clamp(340px,28vw,400px)] bg-bg">
        <NavRail />
        <main className="flex min-h-0 min-w-0 flex-col border-x border-slate">
          <Outlet />
        </main>
        <aside aria-label="Player" className="min-h-0 overflow-y-auto">
          <PlayerPane />
        </aside>
      </div>
    );
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      {!fullScreen && <TabBar />}
    </div>
  );
}
