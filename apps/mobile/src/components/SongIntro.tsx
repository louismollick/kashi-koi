import { View } from 'react-native';
import { colors } from '@/constants/theme';
import type { SongLyrics } from '@/types/domain';
import { Label } from './ui';

/**
 * The song's translated title and one line on who is speaking and what about. Shown before the first sentence,
 * in muted italics so it never reads as a lyric.
 */
export function SongIntro({ info }: { info: NonNullable<SongLyrics['analysis']> }) {
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.lavender }}>{info.title}</Label>
      <Label muted style={{ fontStyle: 'italic' }}>
        {info.about}
      </Label>
    </View>
  );
}
