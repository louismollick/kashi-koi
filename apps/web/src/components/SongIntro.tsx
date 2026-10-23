import type { SongLyrics } from '@kashi-koi/core/types/domain';
import { Label } from './ui';

/**
 * The song's translated title and one line on who is speaking and what about. Shown before the first sentence,
 * in lavender and muted type so it never reads as a lyric.
 */
export function SongIntro({ info }: { info: NonNullable<SongLyrics['analysis']> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="block text-xl leading-[26px] font-bold text-lavender">{info.title}</Label>
      <Label muted className="block">
        {info.about}
      </Label>
    </div>
  );
}
