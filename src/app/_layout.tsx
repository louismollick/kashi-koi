import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/constants/theme';

const navigationTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.header, text: colors.text } };

/** Dark, portrait iOS shell. Flow screens sit above the persistent main tabs. */
export default function RootLayout() {
  return <ThemeProvider value={navigationTheme}>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="player" options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
      <Stack.Screen name="clip-review" />
      <Stack.Screen name="edit-line" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
      <Stack.Screen name="results" />
      <Stack.Screen name="settings" />
    </Stack>
  </ThemeProvider>;
}
