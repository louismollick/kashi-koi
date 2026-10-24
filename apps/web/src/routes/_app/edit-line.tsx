import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EditLineView } from '@/components/EditLineView';
import { closePanel } from '@/lib/panels';

// The phone layout's edit line sheet. On desktop `openEditLine` shows the same view over the harbor pane instead.
export const Route = createFileRoute('/_app/edit-line')({
  validateSearch: z.object({ id: z.string() }),
  component: EditLineScreen,
});

function EditLineScreen() {
  const { id } = Route.useSearch();
  return (
    <div className="min-h-0 flex-1 bg-header pt-[env(safe-area-inset-top)]">
      <EditLineView id={id} onClose={closePanel} />
    </div>
  );
}
