import { login } from '@kashi-koi/core/navidrome/session';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { loginError } from '@kashi-koi/core/navidrome/subsonic';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import logo from '@/assets/kashikoi-logo.webp';
import { HarborScene } from '@/components/Harbor';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, Label } from '@/components/ui';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { mixedContentError } from '@/lib/serverUrl';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (sessionStore.getState().session) throw redirect({ to: '/' });
  },
  component: LoginScreen,
});

const fields = [
  { name: 'url', label: 'Server URL', type: 'url', autoComplete: 'url', inputMode: 'url' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username', inputMode: 'text' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password', inputMode: 'text' },
] as const;

/** The phone's Home hero, so the first screen already looks like the app. */
function Hero() {
  return <HarborScene className="h-[calc(230px+env(safe-area-inset-top))] shrink-0" left={20} size={() => 200} />;
}

/** Desktop: the harbor fills the window, she fishes from the deck and the form floats in an RPG dialogue box. */
function DesktopScene({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh overflow-y-auto bg-bg">
      <HarborScene
        className="pointer-events-none fixed! inset-0"
        left="5vw"
        size={(height) => Math.min(340, height * 0.4)}
      />
      <div className="relative flex min-h-full items-start justify-center px-6 pt-[9vh] pb-6">
        <PixelFrame fill={colors.night} border={null} className="w-full max-w-[440px]" contentStyle={{ padding: 3 }}>
          <PixelFrame fill={colors.night} border={colors.cream}>
            {children}
          </PixelFrame>
        </PixelFrame>
      </div>
    </div>
  );
}

/** Connect to the user's Navidrome library with token authentication. */
function LoginScreen() {
  const desktop = useIsDesktop();
  const [values, setValues] = useState({ url: '', username: '', password: '' });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const blocked = mixedContentError(values.url);
    if (blocked) {
      setError(blocked);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The session store changes on success, which invalidates the router and leaves this page.
      await login(values.url, values.username, values.password);
    } catch (error) {
      setError(loginError(error));
    } finally {
      setBusy(false);
    }
  };
  const form = (
    <form onSubmit={submit} className="flex flex-col gap-[18px] p-6 pt-5">
      <img
        src={logo}
        alt="Kashi-Koi!"
        width={240}
        height={72}
        className="-ml-1.5 h-[72px] w-[240px] object-contain object-left"
      />
      <Label pixel className="block text-[29px]">
        Log in to Navidrome
      </Label>
      {fields.map((field) => (
        <label key={field.name} className="flex flex-col gap-1.5">
          <Label>{field.label}</Label>
          <PixelFrame fill={colors.surface} contentClassName="p-3">
            <input
              name={field.name}
              type={field.type}
              inputMode={field.inputMode}
              autoComplete={field.autoComplete}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={values[field.name]}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              className="block min-h-7 w-full bg-transparent text-[17px] text-text outline-none"
            />
          </PixelFrame>
        </label>
      ))}
      {error && (
        <Label className="block" style={{ color: colors.red }}>
          {error}
        </Label>
      )}
      <Button type="submit" label="Log in" fill={colors.coral} disabled={busy}>
        <Label pixel className="text-[22px]">
          {busy ? 'Connecting…' : 'Log in'}
        </Label>
      </Button>
    </form>
  );
  if (desktop) return <DesktopScene>{form}</DesktopScene>;
  return (
    <div className="h-dvh overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col pb-6">
        <Hero />
        {form}
      </div>
    </div>
  );
}
