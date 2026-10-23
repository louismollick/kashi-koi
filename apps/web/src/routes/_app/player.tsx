import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlayerPane } from '@/components/PlayerPane';
import { ScreenHeader } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { desktopQuery } from '@/hooks/useIsDesktop';

// The full player is the phone layout's; the desktop shows the same thing in its right pane.
export const Route = createFileRoute('/_app/player')({
  beforeLoad: () => {
    if (window.matchMedia(desktopQuery).matches) throw redirect({ to: '/' });
  },
  component: PlayerScreen,
});

function PlayerScreen() {
  return (
    <Screen header={<ScreenHeader sheet />}>
      <PlayerPane />
    </Screen>
  );
}
