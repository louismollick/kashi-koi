import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

/** Library details push within the tab so its mini player and tabs stay visible. */
export default function LibraryLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
