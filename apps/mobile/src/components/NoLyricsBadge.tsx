import { View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import { PixelFrame } from './PixelFrame';

/** Cover-corner indicator, placed like Home's rank tag. */
export function NoLyricsBadge() {
  return (
    <View style={{ position: 'absolute', right: 6, top: 6 }}>
      <PixelFrame fill={colors.bg} border={null} contentStyle={{ paddingHorizontal: 7, paddingVertical: 2 }}>
        <Icon name="micOff" color={colors.muted} size={18} accessibilityLabel="No synced lyrics" />
      </PixelFrame>
    </View>
  );
}
