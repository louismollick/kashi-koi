import { spriteFrames } from '@kashi-koi/design/sprites/metadata';
import bobbing from '@/assets/bobbing.webp';
import headbang from '@/assets/headbang.webp';
import { useState } from 'react';
import girl from '@/assets/girl.webp';

const strips = { bobbing, headbang };

/**
 * Step the transparent sprite at 6fps idle or 10fps for a combo of three. The frames advance with a CSS steps()
 * animation across the whole strip, so scoring and playback ticks can't make her stutter.
 */
export function Mascot({ combo = 0, size = 130 }: { combo?: number; size?: number }) {
  const mode = combo >= 3 ? 'headbang' : 'bobbing';
  const [failed, setFailed] = useState(false);
  const width = size * spriteFrames.count;
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
