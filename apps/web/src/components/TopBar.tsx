import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { colors } from '@kashi-koi/design/tokens';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import logo from '@/assets/kashikoi-logo.webp';
import { Icon } from './Icon';
import { PixelFrame } from './PixelFrame';
import { useDueCount } from './TabBar';
import { IconButton, Label, Tag } from './ui';

/**
 * Library search for the whole browse column. On the Library it edits `q` in place; anywhere else (an album, Review)
 * the first key opens the Library with that search.
 */
function Search() {
  const navigate = useNavigate();
  const { onLibrary, query } = useLocation({
    select: (location) => {
      const onLibrary = location.pathname === '/library';
      const q = (location.search as { q?: unknown }).q;
      return { onLibrary, query: onLibrary && typeof q === 'string' ? q : '' };
    },
  });
  const setQuery = (q: string) =>
    navigate({ to: '/library', search: (previous) => ({ ...(onLibrary ? previous : {}), q }), replace: onLibrary });
  return (
    <PixelFrame
      fill={colors.surface}
      className="w-full max-w-[440px]"
      contentClassName="flex items-center gap-[10px] px-3"
    >
      <Icon name="search" size={18} color={colors.muted} />
      <input
        aria-label="Search library"
        placeholder="Search songs, albums, artists"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
      />
      {query && (
        <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="active:opacity-70">
          <Icon name="close" size={18} color={colors.muted} />
        </button>
      )}
    </PixelFrame>
  );
}

/** The way into Review: coral with the due count while lines are due, quiet once caught up. */
function ReviewLink() {
  const count = useDueCount();
  return (
    <Link
      to="/review"
      aria-label={count ? `Review, ${count} due` : 'Review'}
      className="block transition-[filter] hover:brightness-110 active:opacity-80"
    >
      {({ isActive }) => (
        <PixelFrame
          fill={count ? colors.coral : isActive ? colors.slate : colors.bg}
          border={count ? colors.coralBorder : isActive ? '#4b4d6a' : null}
          contentClassName="flex h-10 items-center gap-2 px-3"
        >
          <Icon name="book" size={22} color={count ? colors.cream : isActive ? colors.text : colors.lavender} />
          <Label pixel className="text-[21px]" style={{ color: count || isActive ? colors.text : colors.lavender }}>
            Review
          </Label>
          {count > 0 && (
            <PixelFrame
              fill={colors.cream}
              border={null}
              contentClassName="flex h-6 min-w-6 items-center justify-center px-1.5"
            >
              <Label pixel className="text-[17px]" style={{ color: colors.coralDeep }}>
                {count}
              </Label>
            </PixelFrame>
          )}
        </PixelFrame>
      )}
    </Link>
  );
}

/**
 * The desktop browse column's header, replacing the phone's tab bar: the logo (back to the Library, the desktop's
 * home), search, Review and Settings.
 */
export function TopBar() {
  const navigate = useNavigate();
  const offline = settingsStore((state) => state.offlineMode);
  return (
    <header className="flex h-16 shrink-0 items-center gap-5 px-5">
      <Link to="/library" aria-label="Library" className="block shrink-0 transition-[filter] hover:brightness-110">
        <img
          src={logo}
          alt="Kashi-Koi!"
          width={150}
          height={46}
          className="h-[46px] w-[150px] object-contain object-left"
        />
      </Link>
      <div className="flex min-w-0 flex-1">
        <Search />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ReviewLink />
        {offline && (
          <Link to="/settings" aria-label="Offline mode, open settings" className="block">
            <Tag fill={colors.slate}>OFFLINE</Tag>
          </Link>
        )}
        <IconButton
          plain
          name="settings"
          size={40}
          iconScale={0.62}
          color={colors.lavender}
          label="Settings"
          onPress={() => navigate({ to: '/settings' })}
        />
      </div>
    </header>
  );
}
