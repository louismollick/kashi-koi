import { AppState, useWindowDimensions } from 'react-native';
import Japanese from '../../modules/kashi-japanese';
import Remote from '../../modules/kashi-remote';
import {
  setTranslator,
  pauseTranslations,
  prepareTranslation,
  setTranslationForeground,
} from '@kashi-koi/core/japanese/translate';
import { sqliteLibraryDb } from '@/navidrome/db';
import { nativeSecrets } from '@/navidrome/secrets';
import { setDownloadRuntime } from '@kashi-koi/core/downloads/queue';
import { nativeDownloadRuntime } from '@/downloads/native';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { setDefaultAnalysisServer } from '@kashi-koi/core/analysis/fetcher';
import { setLibraryDb } from '@kashi-koi/core/navidrome/libraryDb';
import { setSecrets } from '@kashi-koi/core/navidrome/secrets';
import Storage from 'expo-sqlite/kv-store';
import { appStore, hydrateAppState, remoteSkip, setTransport } from '@kashi-koi/core/store/appStore';
import { hydrateSettings, settingsStore } from '@kashi-koi/core/store/settingsStore';
import { getLibraryFilters, getVisibleLibrary } from '@kashi-koi/core/data/libraryVisibility';
import { prefetchCovers } from '@/components/Cover';
import { setupTransport } from '@/audio/transport';
import { loadLibrary, syncLibrary } from '@kashi-koi/core/navidrome/sync';
import { useEffect, useState } from 'react';
import { loadSession, sessionStore } from '@kashi-koi/core/navidrome/session';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { colors, fontFiles } from '@/constants/theme';

// Install the platform pieces core calls through: library database, secret storage, translator, downloads.
setLibraryDb(sqliteLibraryDb);
setSecrets(nativeSecrets);
setDefaultAnalysisServer(process.env.EXPO_PUBLIC_KASHI_SERVER_URL);
setTranslator(Japanese);
setDownloadRuntime(nativeDownloadRuntime);
// Warm visible album covers on disk whenever a sync or lyrics scan settles.
libraryStore.subscribe((state, previous) => {
  if (previous.progress && !state.progress)
    void prefetchCovers(getVisibleLibrary(getLibraryFilters()).albums.map((album) => album.coverArt));
});

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.header, text: colors.text },
};

/** Sheets that keep the screen below visible behind a scrim. */
const transparentModal = {
  presentation: 'transparentModal',
  animation: 'slide_from_bottom',
  contentStyle: { backgroundColor: 'transparent' },
} as const;

/** Dark, portrait iOS shell. Flow screens sit above the persistent main tabs. */
export default function RootLayout() {
  const session = sessionStore((state) => state.session);
  const [transportReady, setTransportReady] = useState<typeof session>(null);
  const ready = sessionStore((state) => state.ready);
  // A font that fails to load falls back to the system face rather than blocking launch.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const { height } = useWindowDimensions();
  useEffect(() => {
    const storage = {
      getItem: (key: string) => Storage.getItemSync(key),
      setItem: (key: string, value: string) => Storage.setItemSync(key, value),
      removeItem: (key: string) => {
        Storage.removeItemSync(key);
      },
    };
    // Settings first: it seeds itself from the learning blob before that store rewrites it.
    void hydrateSettings(storage)
      .then(() => hydrateAppState(storage))
      .then(loadLibrary)
      .then(loadSession)
      .catch(() => {
        sessionStore.setState({ ready: true, error: 'Could not load the library' });
      });
  }, []);
  useEffect(() => {
    if (!session) return;
    let dispose: (() => void) | undefined,
      cancelled = false;
    void setupTransport(() => !cancelled && sessionStore.getState().session === session)
      .then((cleanup) => {
        if (cancelled) cleanup();
        else {
          dispose = cleanup;
          setTransportReady(session);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const fail = () => appStore.setState({ playbackError: 'Could not set up audio', playing: false });
        fail();
        dispose = setTransport({ load: fail, play: fail, pause() {}, seek() {} });
        setTransportReady(session);
      });
    const start = async () => {
      void setTranslationForeground(AppState.currentState === 'active');
      void syncLibrary();
      try {
        const status = await Japanese.translationStatus();
        if (cancelled) return;
        libraryStore.setState({ translationStatus: status });
        if (!settingsStore.getState().translationPrompted && status === 'supported') {
          settingsStore.setState({ translationPrompted: true });
          await prepareTranslation();
        }
      } catch {
        if (!cancelled) libraryStore.setState({ translationError: 'Could not prepare Japanese translation' });
      }
    };
    void start();
    const subscription = AppState.addEventListener('change', (state) => {
      void setTranslationForeground(state === 'active');
    });
    // Lock screen and headphone next/previous drive the same queue as the in-app buttons.
    Remote.enable();
    const remote = [
      Remote.addListener('onNext', () => remoteSkip('next')),
      Remote.addListener('onPrevious', () => remoteSkip('previous')),
    ];
    return () => {
      cancelled = true;
      subscription.remove();
      for (const listener of remote) listener.remove();
      Remote.disable();
      dispose?.();
      void pauseTranslations();
    };
  }, [session]);
  if (!ready || (!fontsLoaded && !fontError) || (session && transportReady !== session)) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" />
            {/* Swipe-to-dismiss can't start over the PlayerBar, so its scrub line gets horizontal drags. */}
            <Stack.Screen
              name="player"
              dangerouslySingular
              options={{
                animation: 'slide_from_bottom',
                gestureDirection: 'vertical',
                gestureResponseDistance: { bottom: height - 150 },
              }}
            />
            <Stack.Screen
              name="full-player"
              options={{
                animation: 'slide_from_bottom',
                gestureDirection: 'vertical',
                gestureResponseDistance: { bottom: height - 150 },
              }}
            />
            <Stack.Screen
              name="clip-review"
              options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }}
            />
            <Stack.Screen name="edit-line" options={transparentModal} />
            <Stack.Screen name="breakdown" options={transparentModal} />
            <Stack.Screen name="download" options={transparentModal} />
            <Stack.Screen name="song-menu" options={transparentModal} />
            <Stack.Screen name="settings" />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
