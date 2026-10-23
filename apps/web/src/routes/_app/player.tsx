import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlayerPane } from '@/components/PlayerPane';
import { desktopQuery } from '@/hooks/useIsDesktop';

// The full-screen player is the phone layout's; the desktop shows the same thing in its right pane.
export const Route = createFileRoute('/_app/player')({
  beforeLoad: () => {
    if (window.matchMedia(desktopQuery).matches) throw redirect({ to: '/' });
  },
  component: PlayerScreen,
});

function PlayerScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <PlayerPane />
    </div>
  );
}
