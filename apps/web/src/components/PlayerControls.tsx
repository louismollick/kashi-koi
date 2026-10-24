import { appStore } from '@kashi-koi/core/store/appStore';
import { hasTranslations, libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { Song } from '@kashi-koi/core/types/domain';
import { openMenuFrom } from '@/lib/songMenu';
import { SpeedButton } from './SpeedButton';
import { IconButton, Label, PixelToggle } from './ui';

/** Shown wherever a song has no translations: web has no on-device translation, only song analyses. */
export const noAnalysis = 'No song analysis yet';

/** QUIZ and its switch. Off and disabled until the song has an analysis to quiz from. */
export function QuizSwitch({ song }: { song: Song }) {
  const quizToggle = appStore((state) => state.quizToggle);
  // Re-render when the analysis lands, so the switch enables itself.
  libraryStore((state) => state.lyrics[song.id]);
  const quizzable = hasTranslations(song.id);
  return (
    <div className="flex items-center gap-1.5" title="Quiz mode (Q)">
      <Label className="text-xs font-bold">QUIZ</Label>
      <PixelToggle
        disabled={!quizzable}
        label={quizzable ? 'Quiz toggle' : `Quiz toggle, ${noAnalysis.toLowerCase()}`}
        on={quizToggle}
        onPress={() => appStore.getState().setQuizToggle(!quizToggle)}
      />
    </div>
  );
}

/** The song menu button; the menu anchors to it. */
export function SongMenuButton({ song, size = 44 }: { song: Song; size?: number }) {
  return (
    <IconButton
      name="more"
      label="Song menu"
      size={size}
      onPress={(event) => openMenuFrom(event.currentTarget, { kind: 'song', id: song.id })}
    />
  );
}

/** Speed, the quiz switch and the song menu in the phone player's header. */
export function HeaderControls({ song }: { song: Song }) {
  return (
    <div className="flex items-center gap-[14px]">
      <SpeedButton />
      <QuizSwitch song={song} />
      <SongMenuButton song={song} />
    </div>
  );
}
