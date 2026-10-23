import '@fontsource/m-plus-rounded-1c/400.css';
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import './styles/index.css';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { boot } from './boot';
import { router } from './router';

// Sign-in and sign-out re-run the route guards, which redirect between /login and the app.
sessionStore.subscribe((state, previous) => {
  if (state.session !== previous.session) void router.invalidate();
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
// Render nothing (a black page) until the saved state is loaded, like the iOS app holding its splash.
void boot().then(() => {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
