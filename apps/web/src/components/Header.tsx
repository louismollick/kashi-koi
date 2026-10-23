import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { colors } from '@kashi-koi/design/tokens';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import logo from '@/assets/kashikoi-logo.webp';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { IconButton, Label, Tag } from './ui';

/** Logo band on the three tabs of the phone layout; the desktop nav rail carries the logo instead. */
export function Header() {
  const navigate = useNavigate();
  const offline = settingsStore((state) => state.offlineMode);
  return (
    <header className="shrink-0 bg-header pt-[env(safe-area-inset-top)]">
      <div className="flex h-[60px] items-center gap-[10px] pr-3 pl-2">
        <img
          src={logo}
          alt="Kashi-Koi!"
          width={210}
          height={60}
          className="h-[60px] w-[210px] object-contain object-left"
        />
        {offline && (
          <Link to="/settings" aria-label="Offline mode, open settings" className="mr-1 ml-auto block">
            <Tag fill={colors.slate}>OFFLINE</Tag>
          </Link>
        )}
        <span className={offline ? '' : 'ml-auto'}>
          <IconButton
            plain
            name="settings"
            size={44}
            iconScale={0.68}
            label="Settings"
            onPress={() => navigate({ to: '/settings' })}
          />
        </span>
      </div>
    </header>
  );
}

/** Tab screens show the logo header on the phone and nothing on the desktop, where the nav rail has it. */
export function TabHeader() {
  return useIsDesktop() ? null : <Header />;
}

/** Plain title band on pushed screens. `sheet` shows a down chevron for screens that slide up. */
export function ScreenHeader({ title, sheet = false, right }: { title?: string; sheet?: boolean; right?: ReactNode }) {
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <header className="shrink-0 bg-header pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-[68px] items-center gap-[10px] px-[14px] py-[10px]">
        <IconButton
          name={sheet ? 'down' : 'back'}
          label={sheet ? 'Close' : 'Back'}
          onPress={() => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/', replace: true }))}
        />
        <div className="min-w-0 flex-1">
          {title && (
            <Label pixel lines={1} className="text-xl leading-6 font-bold">
              {title}
            </Label>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
