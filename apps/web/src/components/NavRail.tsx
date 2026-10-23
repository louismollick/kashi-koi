import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { colors } from '@kashi-koi/design/tokens';
import { Link } from '@tanstack/react-router';
import logo from '@assets/kashikoi-logo.png';
import { Icon } from './Icon';
import { DueBadge, tabs, useDueCount } from './TabBar';
import { Label, Tag } from './ui';

const item = 'flex h-12 items-center gap-3 px-3 transition-[filter] active:opacity-70 hover:brightness-125';

/** Desktop left rail: logo, the three destinations and Settings. Active is coral, like the phone tab bar. */
export function NavRail() {
  const count = useDueCount();
  const offline = settingsStore((state) => state.offlineMode);
  return (
    <nav aria-label="Main" className="flex min-h-0 flex-col gap-1 overflow-y-auto px-3 pt-3 pb-4">
      <img
        src={logo}
        alt="Kashi-Koi!"
        width={196}
        height={60}
        className="mb-3 h-[60px] w-[196px] object-contain object-left"
      />
      {tabs.map((tab) => (
        <Link key={tab.to} to={tab.to} activeOptions={{ exact: tab.to === '/' }} className={item}>
          {({ isActive }) => {
            const color = isActive ? colors.coral : colors.lavender;
            return (
              <>
                <Icon name={isActive ? tab.activeIcon : tab.icon} size={28} color={color} />
                <Label pixel className="text-[18px] font-bold" style={{ color }}>
                  {tab.title}
                </Label>
                {tab.title === 'Review' && <DueBadge count={count} className="ml-auto" />}
              </>
            );
          }}
        </Link>
      ))}
      <Link to="/settings" className={item}>
        {({ isActive }) => {
          const color = isActive ? colors.coral : colors.lavender;
          return (
            <>
              <Icon name="settings" size={28} color={color} />
              <Label pixel className="text-[18px] font-bold" style={{ color }}>
                Settings
              </Label>
              {offline && (
                <span className="ml-auto">
                  <Tag fill={colors.slate}>OFFLINE</Tag>
                </span>
              )}
            </>
          );
        }}
      </Link>
    </nav>
  );
}
