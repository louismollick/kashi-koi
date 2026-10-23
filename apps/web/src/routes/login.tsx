import { login } from '@kashi-koi/core/navidrome/session';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { loginError } from '@kashi-koi/core/navidrome/subsonic';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import background from '@/assets/background.webp';
import logo from '@/assets/kashikoi-logo.webp';
import { Mascot } from '@/components/Mascot';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, Label } from '@/components/ui';
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

/** Connect to the user's Navidrome library with token authentication. */
function LoginScreen() {
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
  return (
    <div className="h-dvh overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col pb-6">
        {/* The Home hero, so the first screen already looks like the app. */}
        <div className="relative shrink-0" style={{ height: 'calc(230px + env(safe-area-inset-top))' }}>
          <img src={background} alt="" className="h-full w-full object-cover" />
          <div className="absolute bottom-1.5 left-5">
            <Mascot size={200} />
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-[18px] p-6 pt-5">
          <img
            src={logo}
            alt="Kashi-Koi!"
            width={240}
            height={72}
            className="-ml-1.5 h-[72px] w-[240px] object-contain object-left"
          />
          <Label pixel className="block text-[22px] leading-7 font-bold">
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
            <Label pixel className="text-[17px] font-bold">
              {busy ? 'Connecting…' : 'Log in'}
            </Label>
          </Button>
        </form>
      </div>
    </div>
  );
}
