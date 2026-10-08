import { AppState, useWindowDimensions } from 'react-native';
import Japanese from '../../modules/kashi-japanese';
import { setTranslator, pauseTranslations, prepareTranslation, setTranslationForeground } from '@/japanese/translate';
import { saveTranslations } from '@/navidrome/db';
import { libraryStore } from '@/store/libraryStore';
import Storage from 'expo-sqlite/kv-store';
import { appStore, hydrateAppState, setTransport } from '@/store/appStore';
import { setupTransport } from '@/audio/transport';
import { loadLibrary, syncLibrary } from '@/navidrome/sync';
import { useEffect, useState } from 'react';
import { loadSession, sessionStore } from '@/navidrome/session';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/constants/theme';

setTranslator(Japanese, saveTranslations);

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.header, text: colors.text },
};

/** Dark, portrait iOS shell. Flow screens sit above the persistent main tabs. */
export default function RootLayout() {
  const session = sessionStore((state) => state.session);
  const [transportReady, setTransportReady] = useState<typeof session>(null);
  const ready = sessionStore((state) => state.ready);
  const { height } = useWindowDimensions();
  useEffect(() => {
    void hydrateAppState({
      getItem: (key) => Storage.getItemSync(key),
      setItem: (key, value) => Storage.setItemSync(key, value),
      removeItem: (key) => {
        Storage.removeItemSync(key);
      },
    })
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
        if (!appStore.getState().translationPrompted && status === 'supported') {
          appStore.setState({ translationPrompted: true });
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
    return () => {
      cancelled = true;
      subscription.remove();
      dispose?.();
      void pauseTranslations();
    };
  }, [session]);
  if (!ready || (session && transportReady !== session)) return null;
  return (
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
          <Stack.Screen name="clip-review" options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
          <Stack.Screen
            name="edit-line"
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="results" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="song-info" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
