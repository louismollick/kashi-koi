import { Outlet, useLocation } from '@tanstack/react-router';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useShortcuts } from '@/hooks/useShortcuts';
import { closePanel, panelStore } from '@/lib/panels';
import { BreakdownView } from './BreakdownView';
import { EditLineView } from './EditLineView';
import { NowPlayingBar } from './NowPlayingBar';
import { PlayerPane } from './PlayerPane';
import { ReviewScreen } from './ReviewScreen';
import { SongMenuHost } from './SongMenu';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

const fullScreenPaths = ['/player', '/full-player', '/clip-review', '/breakdown', '/edit-line'];

/** A breakdown or the edit line picker, over the whole harbor pane while one is open. */
function PanelOverlay() {
  const panel = panelStore((state) => state.panel);
  if (!panel) return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg">
      {panel.kind === 'breakdown' ? (
        <BreakdownView songId={panel.songId} sentenceId={panel.sentenceId} onClose={closePanel} />
      ) : (
        <EditLineView id={panel.id} onClose={closePanel} />
      )}
    </div>
  );
}

/**
 * The signed-in app frame. Phone: the screen, then the mini player and tab bar, like the iOS tabs. Desktop (1024px
 * and up): the browse column under its top bar, the harbor pane beside it (the one home of the harbor and the
 * mascot: lyrics, the quiz and clip review) and the now playing bar across the bottom. Clip review takes the pane
 * and leaves the review list in the browse column.
 */
export function Shell() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const desktop = useIsDesktop();
  useShortcuts();
  if (desktop) {
    const clipReview = pathname === '/clip-review';
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)_clamp(380px,36vw,560px)] grid-rows-[minmax(0,1fr)_auto] bg-bg">
        <main className="flex min-h-0 min-w-0 flex-col">
          <TopBar />
          {clipReview ? <ReviewScreen /> : <Outlet />}
        </main>
        <aside aria-label="Player" className="relative flex min-h-0 flex-col overflow-hidden border-l border-slate">
          {clipReview ? <Outlet /> : <PlayerPane />}
          <PanelOverlay />
        </aside>
        <NowPlayingBar />
        <SongMenuHost />
      </div>
    );
  }
  // The player screens cover the tab bar, like the iOS player sheets above the tabs.
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      {!fullScreenPaths.includes(pathname) && <TabBar />}
      <SongMenuHost />
    </div>
  );
}
