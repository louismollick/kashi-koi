import { analysisServerUrl } from '@kashi-koi/core/analysis/fetcher';
import { logout, sessionStore } from '@kashi-koi/core/navidrome/session';
import { createFileRoute } from '@tanstack/react-router';
import { ScreenHeader } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Row } from '@/components/ui';

export const Route = createFileRoute('/_app/settings')({ component: SettingsScreen });

/** Phase 3 adds the real settings (sync, filters, answer time, analysis server). Phase 2 has the account and log out. */
function SettingsScreen() {
  const session = sessionStore((state) => state.session);
  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <div className="p-4">
        <Row label="Navidrome server" detail={session?.url} />
        <Row label="Account" detail={session?.username} />
        <Row label="Analysis server" detail={analysisServerUrl() || 'None'} />
        <Row label="Log out" color="#f95362" onPress={() => void logout()} />
      </div>
    </Screen>
  );
}
