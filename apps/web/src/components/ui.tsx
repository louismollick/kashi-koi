import { colors } from '@kashi-koi/design/tokens';
import type { CSSProperties, ComponentProps, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { PixelFrame } from './PixelFrame';

/**
 * All app text. Rounded body type by default; `pixel` switches to the pixel face for titles, numbers and short
 * labels. Size, weight and spacing come from utilities in `className` (`text-[13px] font-bold`); like iOS the
 * line height stays 21 unless a `leading-*` utility changes it. 600 and up on iOS is the bold face, so use
 * `font-bold`. `lines={1}` truncates the text to one line with an ellipsis.
 */
export function Label({
  children,
  muted = false,
  pixel = false,
  lines,
  className,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  pixel?: boolean;
  lines?: 1;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        'label',
        pixel && 'font-pixel',
        muted && 'text-muted',
        lines === 1 && 'block min-w-0 truncate',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/** Filled pixel button with a 48px minimum height. Pressing dims it slightly; hovering brightens it. */
export function Button({
  children,
  onPress,
  fill = colors.slate,
  border,
  className,
  contentClassName,
  disabled = false,
  label,
  type = 'button',
}: {
  children: ReactNode;
  onPress?: () => void;
  fill?: string;
  border?: string | null;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  label?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        'block text-left transition-[filter] active:opacity-80 enabled:hover:brightness-110 disabled:opacity-45',
        className,
      )}
    >
      <PixelFrame
        fill={fill}
        border={border}
        contentClassName={cn('flex min-h-12 items-center justify-center px-[14px] py-3', contentClassName)}
      >
        {children}
      </PixelFrame>
    </button>
  );
}

/**
 * Square icon control. Framed by default (transport, back, close); `plain` drops the frame for icons that sit
 * directly on a card, like the mini player's pause.
 */
export function IconButton({
  name,
  onPress,
  label,
  fill = colors.panel,
  border,
  color = colors.text,
  size = 44,
  iconScale = 0.55,
  plain = false,
  disabled = false,
}: {
  name: ComponentProps<typeof Icon>['name'];
  /** Receives the click, so a "more" button can anchor a menu to itself. */
  onPress: (event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  fill?: string;
  border?: string | null;
  color?: string;
  size?: number;
  iconScale?: number;
  plain?: boolean;
  disabled?: boolean;
}) {
  const icon = <Icon name={name} color={color} size={size * iconScale} />;
  const box = { width: size, height: size };
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className="block shrink-0 transition-[filter] active:opacity-70 enabled:hover:brightness-125 disabled:opacity-45"
    >
      {plain ? (
        <span className="flex items-center justify-center" style={box}>
          {icon}
        </span>
      ) : (
        <PixelFrame
          fill={fill}
          border={border ?? '#4b4d6a'}
          contentClassName="flex items-center justify-center"
          contentStyle={box}
        >
          {icon}
        </PixelFrame>
      )}
    </button>
  );
}

/** Pill switch used for the quiz toggle and review choices. */
export function PixelToggle({
  on,
  onPress,
  label,
  disabled = false,
}: {
  on: boolean;
  onPress: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className="block shrink-0 transition-[filter] enabled:hover:brightness-110 disabled:opacity-45"
    >
      <PixelFrame
        fill={on ? colors.green : colors.track}
        border={null}
        contentClassName={cn('flex h-[30px] w-[52px] p-1', on ? 'justify-end' : 'justify-start')}
      >
        <PixelFrame fill="#ffffff" border={null} contentClassName="h-[22px] w-[22px]" />
      </PixelFrame>
    </button>
  );
}

/** Compact NEW or rank label with the shared contour. */
export function Tag({ children, fill = colors.coral }: { children: ReactNode; fill?: string }) {
  return (
    <PixelFrame fill={fill} border={null} contentClassName="px-[7px] py-0.5">
      <Label pixel className="text-[11px] leading-[15px] font-bold">
        {children}
      </Label>
    </PixelFrame>
  );
}

/**
 * One full-width menu row: label left, detail or control right, divided by a hairline. Used by Settings and the song
 * menu. Without `onPress` it is a plain row, so the control inside it stays reachable.
 */
export function Row({
  label,
  detail,
  onPress,
  disabled = false,
  color = colors.text,
  children,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
  children?: ReactNode;
}) {
  const row = 'flex min-h-[52px] w-full items-center gap-[10px] border-t border-track text-left';
  const content = (
    <>
      <Label className="flex-1 text-base" style={{ color }}>
        {label}
      </Label>
      {detail && (
        <Label muted lines={1} className="max-w-[55%] text-sm">
          {detail}
        </Label>
      )}
      {children}
    </>
  );
  if (!onPress) return <div className={cn(row, disabled && 'opacity-45')}>{content}</div>;
  return (
    <button
      type="button"
      aria-label={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onClick={onPress}
      className={cn(row, 'transition-[filter] active:opacity-70 enabled:hover:brightness-125 disabled:opacity-45')}
    >
      {content}
    </button>
  );
}

/** Pixel segmented control for a short list of choices, like Settings' answer time. */
export function Segmented<T>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 gap-1 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className="block flex-1 transition-[filter] active:opacity-70 hover:brightness-110"
          >
            <PixelFrame
              fill={on ? colors.coral : colors.panel}
              border={on ? colors.coralBorder : colors.track}
              contentClassName="flex min-h-10 items-center justify-center"
            >
              <Label pixel className="text-[15px] font-bold" style={{ color: on ? colors.text : colors.muted }}>
                {option.label}
              </Label>
            </PixelFrame>
          </button>
        );
      })}
    </fieldset>
  );
}

/** Section title on Home, Settings and artist pages. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <Label pixel className="block text-[21px] leading-[26px] font-bold">
      {title}
    </Label>
  );
}
