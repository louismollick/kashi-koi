import { spriteFrames } from '@kashi-koi/design/sprites/metadata';
import { useState } from 'react';
import bobbing from '@/assets/bobbing.webp';
import catchPose from '@/assets/catch.webp';
import doze from '@/assets/doze.webp';
import girl from '@/assets/girl.webp';
import headbang from '@/assets/headbang.webp';

const strips = { bobbing, headbang };
/** Still poses, registered on the sprite frame so swapping one in doesn't move her chair. */
const poses = { doze, catch: catchPose };

/** `play` bobs (or headbangs on a combo of three); `doze` naps while nothing plays; `catch` holds up a koi. */
export type Pose = 'play' | keyof typeof poses;

/**
 * Step the transparent sprite at 6fps idle or 10fps for a combo of three. The frames advance with a CSS steps()
 * animation across the whole strip, so scoring and playback ticks can't make her stutter. A still `pose` replaces
 * the strip.
 */
export function Mascot({ combo = 0, size = 130, pose = 'play' }: { combo?: number; size?: number; pose?: Pose }) {
  const mode = combo >= 3 ? 'headbang' : 'bobbing';
  const [failed, setFailed] = useState(false);
  const width = size * spriteFrames.count;
  if (pose !== 'play')
    return (
      <span role="img" aria-label={`Mascot ${pose === 'doze' ? 'dozing' : 'holding a koi'}`} className="relative block">
        <img src={poses[pose]} alt="" width={size} height={size} draggable={false} className="block" />
        {pose === 'doze' && <Snore size={size} />}
      </span>
    );
  return (
    <span
      role="img"
      aria-label={`Mascot ${mode}`}
      className="block overflow-hidden"
      style={{ width: size, height: size }}
    >
      {failed ? (
        <img src={girl} alt="" width={size} height={size} draggable={false} />
      ) : (
        <span
          className="relative block will-change-transform"
          style={{
            width,
            height: size,
            animation: `mascot-strip ${spriteFrames.count / (mode === 'headbang' ? 10 : 6)}s steps(${spriteFrames.count}) infinite`,
          }}
        >
          {/* Both strips stay mounted so the first combo of three doesn't flash while the headbang loads. */}
          {(['bobbing', 'headbang'] as const).map((strip) => (
            <img
              key={strip}
              src={strips[strip]}
              alt=""
              draggable={false}
              onError={() => setFailed(true)}
              className="absolute top-0 left-0 max-w-none"
              style={{ width, height: size, opacity: strip === mode ? 1 : 0 }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

/** A third z that drifts up from the drawn pair and fades, on a slow loop. Hidden for reduced motion; the drawn pair stays. */
function Snore({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="font-pixel pointer-events-none absolute text-cream motion-reduce:hidden"
      style={{
        left: size * 0.62,
        top: size * 0.16,
        fontSize: Math.max(12, size * 0.075),
        animation: 'snore 2.4s steps(6) infinite',
      }}
    >
      z
    </span>
  );
}
