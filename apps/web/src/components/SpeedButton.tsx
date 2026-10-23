import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { Label } from './ui';

/** Player header control that cycles 1x, 0.75x and 0.5x. A slowed speed shows in lavender so it isn't forgotten. */
export function SpeedButton() {
  const rate = settingsStore((state) => state.playbackRate);
  return (
    <button
      type="button"
      aria-label={`Playback speed ${rate}x`}
      title="Playback speed (S)"
      onClick={() => settingsStore.getState().cyclePlaybackRate()}
      className="flex min-h-11 min-w-11 items-center justify-center transition-[filter] active:opacity-70 hover:brightness-125"
    >
      <Label
        muted={rate === 1}
        className={
          rate === 1 ? 'text-[13px] font-bold tabular-nums' : 'text-[13px] font-bold text-lavender tabular-nums'
        }
      >
        {rate}x
      </Label>
    </button>
  );
}
