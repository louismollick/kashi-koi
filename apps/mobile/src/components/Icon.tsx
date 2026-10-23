import Svg, { Path } from 'react-native-svg';
import { icons, type IconName } from '@kashi-koi/design/icons';
import { colors } from '@/constants/theme';

/** Typed pixel icons share the fill color of their surrounding control. */
export function Icon({
  name,
  color = colors.text,
  size = 24,
  accessibilityLabel,
}: {
  name: IconName;
  color?: string;
  size?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={!!accessibilityLabel}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {icons[name].map((d, index) => (
        <Path key={index} d={d} fill={color} />
      ))}
    </Svg>
  );
}
