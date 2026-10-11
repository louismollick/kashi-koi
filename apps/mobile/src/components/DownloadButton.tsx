import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { useDownloadSummary, type DownloadTarget } from '@/downloads';
import { IconButton } from './ui';

type SheetTarget = Exclude<DownloadTarget, { kind: 'library' }>;

/** Route to the download sheet, used by long presses and the page buttons. */
export const downloadSheet = (target: SheetTarget) => ({ pathname: '/download' as const, params: target });

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
