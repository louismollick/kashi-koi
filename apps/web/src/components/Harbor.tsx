import { useRef } from 'react';
import classicDay from '@/assets/harbor.webp';
import classicNight from '@/assets/harbor-night.webp';
import wideDay from '@/assets/harbor-wide.webp';
import wideNight from '@/assets/harbor-wide-night.webp';
import { useElementSize } from '@/hooks/useElementSize';
import { cn } from '@/lib/cn';
import { Mascot, type Pose, spriteFoot } from './Mascot';

/**
 * The harbor in two cuts, each with a solid boardwalk across its bottom: the classic 3:2 scene and a 3:1 panorama.
 * `deckTop` is where the deck meets the water, as a fraction of the art's height (the same by day and by night).
 */
const art = {
  classic: { day: classicDay, night: classicNight, aspect: 1536 / 1024, deckTop: 0.785 },
  wide: { day: wideDay, night: wideNight, aspect: 2172 / 724, deckTop: 0.775 },
} as const;

export type Cut = keyof typeof art;

/** Moonlit harbor from 7pm to 6am, local time. Read at render, so it flips the next time a scene re-renders. */
export const isNight = (date = new Date()) => date.getHours() >= 19 || date.getHours() < 6;

/** One cut of the harbor at the current time of day, with its aspect ratio (width over height). */
export function harborArt(cut: Cut) {
  return { src: isNight() ? art[cut].night : art[cut].day, aspect: art[cut].aspect };
}

/** The cut that crops least at this box shape: the panorama once the box is twice as wide as it is tall. */
export const cutFor = (width: number, height: number): Cut => (height > 0 && width / height > 2 ? 'wide' : 'classic');

/**
 * Where her chair legs land, in px above the bottom of bottom-anchored art drawn `artWidth` wide: a little behind
 * the front of the deck, and above the bottom `covered` px that something rides over (a card, a dialogue box).
 */
export function deckFeet(cut: Cut, artWidth: number, covered = 0) {
  const band = (artWidth / art[cut].aspect) * (1 - art[cut].deckTop);
  return covered + Math.max(0, band - covered) * 0.45;
}

/**
 * The harbor filling its box (cover, anchored to the bottom) with the mascot sitting on the deck, for fixed scenes
 * like the phone Home hero and the login. `covered` is how much of the bottom edge something overlaps; `size` gets
 * the box height and returns the mascot's size. The quiz stage zooms and places the art itself.
 */
export function HarborScene({
  className,
  covered = 0,
  left,
  size,
  pose,
}: {
  className?: string;
  covered?: number;
  left: number | string;
  size: (height: number) => number;
  pose?: Pose;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(box);
  const cut = cutFor(width, height);
  const mascot = Math.round(size(height));
  const feet = deckFeet(cut, Math.max(width, height * art[cut].aspect), covered);
  return (
    <div ref={box} className={cn('relative overflow-hidden', className)}>
      <img
        src={harborArt(cut).src}
        alt=""
        fetchPriority="high"
        draggable={false}
        className="h-full w-full object-cover object-bottom"
      />
      {height > 0 && (
        <div className="absolute" style={{ left, bottom: feet - mascot * spriteFoot }}>
          <Mascot size={mascot} pose={pose} />
        </div>
      )}
    </div>
  );
}
