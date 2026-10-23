import { colors } from '@kashi-koi/design/tokens';

/** Full-width coral progress line. Display only for now; phase 3 adds seeking by dragging. */
export function ProgressLine({
  progress,
  height = 4,
  track = colors.track,
}: {
  progress: number;
  height?: number;
  track?: string;
}) {
  const value = Math.min(1, Math.max(0, progress));
  return (
    <span className="block" style={{ height, background: track }}>
      <span className="block h-full" style={{ width: `${value * 100}%`, background: colors.coral }} />
    </span>
  );
}
