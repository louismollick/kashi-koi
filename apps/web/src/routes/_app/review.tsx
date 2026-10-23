import { createFileRoute } from '@tanstack/react-router';
import { Screen } from '@/components/Screen';
import { TabHeader } from '@/components/Header';
import { Label } from '@/components/ui';

export const Route = createFileRoute('/_app/review')({ component: ReviewScreen });

/** Phase 3 fills this with the review list and clip review. */
function ReviewScreen() {
  return (
    <Screen header={<TabHeader />}>
      <div className="p-4">
        <Label muted>Review is coming to the web app.</Label>
      </div>
    </Screen>
  );
}
