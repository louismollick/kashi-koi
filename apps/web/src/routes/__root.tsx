import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { Label } from '@/components/ui';
import { useSessionLifecycle } from '@/useSessionLifecycle';

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => (
    <div className="flex h-dvh flex-col items-center justify-center gap-3">
      <Label pixel className="text-[22px] font-bold">
        Not found
      </Label>
      <Link to="/" className="text-coral">
        Back to Home
      </Link>
    </div>
  ),
});

function Root() {
  useSessionLifecycle();
  return <Outlet />;
}
