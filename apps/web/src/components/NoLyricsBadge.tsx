import { colors } from '@kashi-koi/design/tokens';
import { Icon } from './Icon';
import { PixelFrame } from './PixelFrame';

/** Cover-corner indicator, placed like Home's rank tag. */
export function NoLyricsBadge() {
  return (
    <span className="absolute top-1.5 right-1.5 block">
      <PixelFrame fill={colors.bg} border={null} contentClassName="px-[7px] py-0.5">
        <Icon name="micOff" color={colors.muted} size={18} label="No synced lyrics" />
      </PixelFrame>
    </span>
  );
}
