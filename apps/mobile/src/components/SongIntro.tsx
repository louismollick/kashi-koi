import { View } from 'react-native';
import { colors } from '@/constants/theme';
import type { SongLyrics } from '@/types/domain';
import { Label } from './ui';

/** What the song is about and who's talking, from its song analysis. Shown before the first sentence. */
export function SongIntro({ info, action }: { info: NonNullable<SongLyrics['analysis']>; action?: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ fontSize: 20, lineHeight: 26, fontWeight: '700' }}>{info.title}</Label>
      <Label style={{ color: colors.lavender }}>
        {info.speaker} → {info.addressee}
      </Label>
      <Label muted>{info.summary}</Label>
      {action}
    </View>
  );
}
