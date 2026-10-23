import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { useDownloadSummary } from '@kashi-koi/core/downloads';
import { downloadSheet, type SheetTarget } from '@/routes';
import { IconButton } from './ui';

/** Header button on album and artist pages; green once every eligible song is offline. */
export function DownloadButton({ target }: { target: SheetTarget }) {
  const router = useRouter();
  const { eligible, done } = useDownloadSummary(target);
  if (!eligible) return null;
  const complete = done === eligible;
  return (
    <IconButton
      name={complete ? 'downloaded' : 'download'}
      color={complete ? colors.green : colors.text}
      label={complete ? 'Downloaded' : 'Download'}
      onPress={() => router.push(downloadSheet(target))}
    />
  );
}
