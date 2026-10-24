import { useNavigate } from '@tanstack/react-router';
import { useIsDesktop } from './useIsDesktop';

/**
 * Start playback and show the player: the phone opens the full player screen first (like iOS), the desktop already
 * has the harbor pane beside the browse column.
 */
export function useOpenPlayer() {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  return (start: () => void) => {
    if (!desktop) void navigate({ to: '/player' });
    start();
  };
}
