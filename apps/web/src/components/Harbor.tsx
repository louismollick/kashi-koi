import classicDay from '@/assets/background.webp';
import classicNight from '@/assets/background-night.webp';
import wideDay from '@/assets/harbor-wide.webp';
import wideNight from '@/assets/harbor-wide-night.webp';
import { cn } from '@/lib/cn';

/** The harbor in two cuts: the classic 10:7 scene and a 3:1 panorama with the dock running the whole bottom edge. */
const art = {
  classic: { day: classicDay, night: classicNight, aspect: 1498 / 1050 },
  wide: { day: wideDay, night: wideNight, aspect: 2172 / 724 },
} as const;

/** Moonlit harbor from 7pm to 6am, local time. Read at render, so it flips the next time a scene re-renders. */
export const isNight = (date = new Date()) => date.getHours() >= 19 || date.getHours() < 6;

export type Cut = keyof typeof art;

/** One cut of the harbor at the current time of day, with its aspect ratio (width over height). */
export function harborArt(cut: Cut) {
  return { src: isNight() ? art[cut].night : art[cut].day, aspect: art[cut].aspect };
}

/** The cut that crops least at this box shape: the panorama once the box is twice as wide as it is tall. */
export const cutFor = (width: number, height: number): Cut => (height > 0 && width / height > 2 ? 'wide' : 'classic');

/**
 * The harbor filling its box, anchored to the bottom so the dock always shows under the mascot. For fixed-size boxes
 * (heroes, the login backdrop); the quiz stage sizes and zooms the art itself.
 */
export function HarborBackdrop({ width, height, className }: { width: number; height: number; className?: string }) {
  return (
    <img
      src={harborArt(cutFor(width, height)).src}
      alt=""
      fetchPriority="high"
      draggable={false}
      className={cn('h-full w-full object-cover object-bottom', className)}
    />
  );
}
