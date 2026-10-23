import { colors } from '@kashi-koi/design/tokens';

/** One entry per block, lit in this order. */
const blocks = ['first', 'second', 'third'] as const;
const cycle = 750;

/** Three square blocks lit in turn: the pixel stand-in for a spinner. */
export function PixelSpinner({
  color = colors.lavender,
  size = 6,
  label,
}: {
  color?: string;
  size?: number;
  /** Accessible name, "Loading" by default. */
  label?: string;
}) {
  return (
    <span role="progressbar" aria-label={label ?? 'Loading'} className="flex items-center" style={{ gap: size / 2 }}>
      {blocks.map((block, index) => (
        <span
          key={block}
          style={{
            width: size,
            height: size,
            background: color,
            opacity: 0.25,
            animation: `pixel-block ${cycle}ms linear ${(index * cycle) / blocks.length}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}
