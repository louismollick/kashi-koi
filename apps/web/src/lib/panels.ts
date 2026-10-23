import { create } from 'zustand';
import { desktopQuery } from '@/hooks/useIsDesktop';
import { router } from '@/router';

/**
 * Sheets that iOS presents over the player: a sentence's breakdown and the edit line picker. On the phone layout they
 * are routes (`/breakdown`, `/edit-line`), so Back closes them. On desktop they open inside the player pane, which
 * renders `BreakdownView` or `EditLineView` over the player while `panel` is set.
 */
export type Panel = { kind: 'breakdown'; songId: string; sentenceId: string } | { kind: 'edit-line'; id: string };

export const panelStore = create<{ panel: Panel | null }>(() => ({ panel: null }));

const isDesktop = () => window.matchMedia(desktopQuery).matches;

export function openBreakdown(songId: string, sentenceId: string) {
  if (isDesktop()) panelStore.setState({ panel: { kind: 'breakdown', songId, sentenceId } });
  else void router.navigate({ to: '/breakdown', search: { songId, sentenceId } });
}

export function openEditLine(id: string) {
  if (isDesktop()) panelStore.setState({ panel: { kind: 'edit-line', id } });
  else void router.navigate({ to: '/edit-line', search: { id } });
}

/** Close the open panel: clears it on desktop, goes back on the phone. */
export function closePanel() {
  if (panelStore.getState().panel) panelStore.setState({ panel: null });
  else router.history.back();
}
