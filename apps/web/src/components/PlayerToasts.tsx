import { appStore } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { useEffect } from 'react';
import { Koi } from './Fog';
import { PixelFrame } from './PixelFrame';
import { Button, Label } from './ui';

/** Confirms a lost mark or a quiz miss going onto the review list, with a short window to undo it. */
export function AddedToast() {
  return (
    <PixelFrame fill={colors.slate} contentClassName="flex items-center gap-[10px] pl-3">
      <Label className="flex-1 text-[13px]" style={{ color: colors.green }}>
        ✓ Added to review
      </Label>
      <Button
        label="Undo added sentence"
        contentClassName="min-h-10! px-3! py-2!"
        onPress={() => appStore.getState().undoLostMark()}
      >
        <Label pixel className="text-sm font-bold" style={{ color: colors.cream }}>
          UNDO
        </Label>
      </Button>
    </PixelFrame>
  );
}

/** How the run went, shown over the next song for a few seconds after a quiz song ends. */
export function RunEndToast() {
  const runEnd = appStore((state) => state.runEnd);
  const title = libraryStore((state) => (runEnd ? state.bySong[runEnd.songId]?.title : undefined));
  // Shown for 4s after the song ended, so a card nobody saw never appears later over another song.
  const remaining = runEnd ? runEnd.at + 4000 - Date.now() : 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `remaining` is derived from runEnd
  useEffect(() => {
    if (!runEnd) return;
    const timer = setTimeout(() => appStore.getState().dismissRunEnd(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [runEnd]);
  if (!runEnd || remaining <= 0) return null;
  return (
    <button
      type="button"
      aria-label="Dismiss run summary"
      onClick={() => appStore.getState().dismissRunEnd()}
      className="block w-full text-left"
    >
      <PixelFrame
        fill={runEnd.perfect ? colors.maroon : colors.slate}
        border={runEnd.perfect ? colors.combo : undefined}
        contentClassName="flex items-center gap-[10px] p-3"
      >
        {runEnd.perfect && <Koi perfect size={28} />}
        <span className="block min-w-0 flex-1">
          <Label
            lines={1}
            className="text-[13px] font-bold"
            style={{ color: runEnd.perfect ? colors.combo : colors.text }}
          >
            {runEnd.perfect ? 'Perfect' : title}
          </Label>
          <Label muted lines={1} className="text-[13px]">
            {runEnd.perfect && title ? `${title} · ` : ''}
            {runEnd.hits}/{runEnd.answered} right · best combo {runEnd.bestCombo}
          </Label>
        </span>
      </PixelFrame>
    </button>
  );
}
