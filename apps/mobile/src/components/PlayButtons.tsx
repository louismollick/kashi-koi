import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import { Button, Label, styles } from './ui';

/** Play and Shuffle for an album or artist page. `start` builds the queue; the player opens first. */
export function PlayButtons({
  noun,
  disabled,
  start,
}: {
  noun: 'album' | 'artist';
  disabled: boolean;
  start: (shuffle: boolean) => void;
}) {
  const router = useRouter();
  const play = (shuffle: boolean) => () => {
    router.push('/player');
    start(shuffle);
  };
  return (
    <View style={styles.row}>
      <Button
        label={`Play ${noun}`}
        fill={colors.coral}
        border={colors.coralBorder}
        style={{ flex: 1 }}
        disabled={disabled}
        onPress={play(false)}
      >
        <View style={styles.row}>
          <Icon name="play" size={22} />
          <Label style={{ fontWeight: '700' }}>Play</Label>
        </View>
      </Button>
      <Button label={`Shuffle ${noun}`} border="#4b4f80" style={{ flex: 1 }} disabled={disabled} onPress={play(true)}>
        <Label style={{ fontWeight: '700' }}>Shuffle</Label>
      </Button>
    </View>
  );
}
