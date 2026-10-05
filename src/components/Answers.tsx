import { View } from 'react-native';
import { colors } from '@/constants/theme';
import { getAnswers } from '@/store/libraryStore';
import { Icon } from './Icon';
import { Button, Label } from './ui';
import type { Song } from '@/types/domain';

/** Three same-song meanings; reveal the right choice after a submitted answer. */
export function Answers({ song, lineIndex, selected, onAnswer }: { song: Song; lineIndex: number; selected: number | null; onAnswer: (choice: number) => void }) {
  return <View style={{ gap: 10 }}>
    {getAnswers(song, lineIndex).map((meaning, index) => {
      const correct = selected !== null && index === 1;
      const wrong = selected === index && index !== 1;
      return <Button key={`${lineIndex}-${index}`} label={meaning} onPress={() => onAnswer(index)}
        fill={correct ? colors.greenDeep : wrong ? '#5c2632' : colors.maroon}
        border={correct ? colors.green : wrong ? colors.red : '#7a4b56'}
        style={{ opacity: selected !== null && !correct && !wrong ? 0.55 : 1 }} contentStyle={{ minHeight: 62, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
          <Label style={{ textAlign: 'center', fontSize: 17, lineHeight: 23, flex: 1, paddingHorizontal: 28 }}>{meaning}</Label>
          {correct && <View style={{ position: 'absolute', right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#25b36b', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" color="#ffffff" size={22} />
          </View>}
        </View>
      </Button>;
    })}
  </View>;
}
