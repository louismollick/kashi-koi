import { View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import { Button, Label } from './ui';

/** Same-song translations; reveal the right choice after a submitted answer. */
export function Answers({ choices, translation, selected, onAnswer }: { choices: string[]; translation?: string; selected: string | null; onAnswer: (choice: string) => void }) {
  return <View style={{ gap: 10 }}>
    {choices.map((choice, index) => {
      const correct = selected !== null && choice === translation;
      const wrong = selected === choice && choice !== translation;
      return <Button key={`${index}:${choice}`} label={choice} onPress={() => onAnswer(choice)}
        fill={correct ? colors.greenDeep : wrong ? '#5c2632' : colors.maroon}
        border={correct ? colors.green : wrong ? colors.red : '#7a4b56'}
        style={{ opacity: selected !== null && !correct && !wrong ? 0.55 : 1 }} contentStyle={{ minHeight: 62, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
          <Label style={{ textAlign: 'center', fontSize: 17, lineHeight: 23, flex: 1, paddingHorizontal: 28 }}>{choice}</Label>
          {correct && <View style={{ position: 'absolute', right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#25b36b', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" color="#ffffff" size={22} />
          </View>}
        </View>
      </Button>;
    })}
  </View>;
}
