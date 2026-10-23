import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Shell } from '@/components/Shell';

// Everything except /login needs a signed-in session. Signing out invalidates the router, which lands back here.
export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!sessionStore.getState().session) throw redirect({ to: '/login' });
  },
  component: Shell,
});
