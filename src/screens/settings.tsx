import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { colors } from '@/constants/theme';
import { libraryStore } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { sessionStore, logout } from '@/navidrome/session';
import { syncLibrary, scanLyrics } from '@/navidrome/sync';
import { ScreenHeader } from '@/components/Header';
import { Button, Label, PixelToggle, SectionHeader, styles } from '@/components/ui';

const date = (at: number | null) => at ? new Date(at).toLocaleString() : 'never';
/** Account, library sync and full lyrics scan controls. */
export default function SettingsScreen() {
  const [loggingOut, setLoggingOut] = useState(false), [accountError, setAccountError] = useState<string | null>(null);
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics), lastSync = appStore(state => state.lastSyncAt), lastScan = appStore(state => state.lastScanAt);
  const songs = libraryStore(state => state.songs), progress = libraryStore(state => state.progress), error = libraryStore(state => state.error);
  const session = sessionStore(state => state.session), ready = songs.filter(song => song.lyricsStatus === 'synced').length;
  return <View style={styles.page}><ScreenHeader title="Settings" /><ScrollView contentContainerStyle={styles.content}>
    <SectionHeader title="Account" />
    <Label>{session ? new URL(session.url).host : ''}</Label><Label>{session?.username}</Label>
    <Button label="Log out" disabled={loggingOut} onPress={async () => { setLoggingOut(true); setAccountError(null); try { await logout(); } catch (error) { setAccountError(error instanceof Error ? error.message : 'Could not log out'); } finally { setLoggingOut(false); } }}><Label>Log out</Label></Button>
    {accountError && <Label style={{ color: colors.red }}>{accountError}</Label>}
    <SectionHeader title="Library" />
    <View style={styles.row}><Label style={{ flex: 1 }}>Hide songs without synced lyrics</Label><PixelToggle label="Hide songs without synced lyrics" on={hiding} onPress={() => appStore.getState().toggleHideSongsWithoutSyncedLyrics()} /></View>
    <Button label="Sync library" disabled={!!progress} onPress={() => { void syncLibrary(); }}><Label>Sync library</Label></Button>
    <Label muted>Last sync: {date(lastSync)}</Label>
    <SectionHeader title="Lyrics scan" />
    <Button label="Rescan lyrics" fill={colors.coral} disabled={!!progress} onPress={() => { void scanLyrics({ all: true }); }}><Label>Rescan lyrics</Label></Button>
    <Label>{ready} songs ready to learn · {songs.filter(song => song.lyricsStatus === 'none').length} without synced lyrics</Label>
    <Label muted>Last scan: {date(lastScan)}</Label>
    {progress && <Label>{progress.kind === 'sync' ? 'Syncing library' : 'Checking lyrics'}… {progress.completed} / {progress.total}</Label>}
    {error && <Label style={{ color: colors.red }}>{error}</Label>}
  </ScrollView></View>;
}
