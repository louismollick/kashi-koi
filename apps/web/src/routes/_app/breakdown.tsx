import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BreakdownView } from '@/components/BreakdownView';
import { closePanel } from '@/lib/panels';

// The phone layout's breakdown sheet. On desktop `openBreakdown` shows the same view over the harbor pane instead.
export const Route = createFileRoute('/_app/breakdown')({
  validateSearch: z.object({ songId: z.string(), sentenceId: z.string() }),
  component: BreakdownScreen,
});

function BreakdownScreen() {
  const { songId, sentenceId } = Route.useSearch();
  return (
    <div className="min-h-0 flex-1 bg-bg pt-[env(safe-area-inset-top)]">
      <BreakdownView songId={songId} sentenceId={sentenceId} onClose={closePanel} />
    </div>
  );
}
