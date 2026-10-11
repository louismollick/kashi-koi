import { View } from 'react-native';
import type { SongLyrics } from '@/types/domain';
import { Label } from './ui';

/** The song's translated title and one line on who is speaking and what about. Shown before the first sentence. */
export function SongIntro({ info }: { info: NonNullable<SongLyrics['analysis']> }) {
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontSize: 20, lineHeight: 26, fontWeight: '700' }}>{info.title}</Label>
      <Label>{info.about}</Label>
    </View>
  );
}
