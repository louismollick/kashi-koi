import { colors } from '@kashi-koi/design/tokens';
import { useOpenPlayer } from '@/hooks/useOpenPlayer';
import { Icon } from './Icon';
import { Button, Label } from './ui';

/** Play and Shuffle for an album, artist or playlist page. `start` builds the queue; the player opens first. */
export function PlayButtons({
  noun,
  disabled,
  start,
}: {
  noun: 'album' | 'artist' | 'playlist';
  disabled: boolean;
  start: (shuffle: boolean) => void;
}) {
  const openPlayer = useOpenPlayer();
  const play = (shuffle: boolean) => () => openPlayer(() => start(shuffle));
  return (
    <div className="flex max-w-[420px] items-center gap-[10px]">
      <Button
        label={`Play ${noun}`}
        fill={colors.coral}
        border={colors.coralBorder}
        className="flex-1"
        disabled={disabled}
        onPress={play(false)}
      >
        <span className="flex items-center gap-[10px]">
          <Icon name="play" size={22} />
          <Label className="font-bold">Play</Label>
        </span>
      </Button>
      <Button label={`Shuffle ${noun}`} border="#4b4f80" className="flex-1" disabled={disabled} onPress={play(true)}>
        <Label className="font-bold">Shuffle</Label>
      </Button>
    </div>
  );
}
