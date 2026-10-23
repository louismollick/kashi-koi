import { type IconName, icons } from '@kashi-koi/design/icons';
import { colors } from '@kashi-koi/design/tokens';

/** Typed pixel icons on a 24-unit grid; they share the fill color of their surrounding control. */
export function Icon({
  name,
  color = colors.text,
  size = 24,
  label,
  className,
}: {
  name: IconName;
  color?: string;
  size?: number;
  /** Accessible name. Without one the icon is decorative. */
  label?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className ?? 'block shrink-0'}
    >
      {icons[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
