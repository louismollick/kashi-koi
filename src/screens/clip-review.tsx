import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appStore } from '@/store/appStore';
import { getLineText, getSong } from '@/data/fakeData';
import { colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/Header';
import { LineCard } from '@/components/LineCard';
import { Answers } from '@/components/Answers';
import { Button, IconButton, Label, Tag, styles } from '@/components/ui';

/** Untimed meaning match for one review line, with shared editing and Next. */
export default function ClipReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clip = appStore(state => state.clipReview);
  const reviewList = appStore(state => state.reviewList);
  const [selected, setSelected] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const item = reviewList.find(line => line.id === clip?.ids[clip.index]);
  if (!clip || !item) return <View style={styles.page}><ScreenHeader title="Clip review" close /><View style={styles.content}><Label>All done for now</Label><Button onPress={() => router.back()}><Label>Back to review</Label></Button></View></View>;
  const song = getSong(item.songId);
  const lineIndex = song.lines.findIndex(line => line.id === item.lineId);
  return <View style={styles.page}>
    <ScreenHeader title={song.title} subtitle={`${song.artist} · clip ${clip.index + 1} of ${clip.ids.length}`} close />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 18 }} showsVerticalScrollIndicator={false}>
      <Label muted style={{ textAlign: 'center', fontSize: 14 }}>{lineIndex > 0 ? getLineText(song.lines[lineIndex - 1]!) : '♪'}</Label>
      <LineCard line={song.lines[lineIndex]!} isNew={item.kind === 'new'} />
      <Label muted style={{ textAlign: 'center', fontSize: 14 }}>{lineIndex + 1 < song.lines.length ? getLineText(song.lines[lineIndex + 1]!) : '♪'}</Label>
      <Button label="Edit line" onPress={() => router.push({ pathname: '/edit-line', params: { id: item.id } })}><Label>Edit line</Label></Button>
      <View style={styles.row}>
        <IconButton name={replaying ? 'pause' : 'play'} label="Replay clip" fill={colors.coral} size={64} onPress={() => setReplaying(value => !value)} />
        <View><Label style={{ fontSize: 13 }}>{song.title} · {song.artist}</Label><Label muted style={{ fontSize: 11 }}>clip 1:05 to 1:11 · tap to replay</Label></View>
      </View>
      <Answers song={song} lineIndex={lineIndex} selected={clip.answered === null ? null : selected} onAnswer={choice => { if (clip.answered === null) { setSelected(choice); appStore.getState().answerClip(choice); } }} />
      {clip.answered !== null && <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Tag fill={colors.slate}>{clip.answered ? 'next in 9 days' : 'next tomorrow'}</Tag>
        <Button label="Next clip" fill={colors.coral} onPress={() => { appStore.getState().nextClip(); setSelected(null); setReplaying(false); }}><Label>Next ▸</Label></Button>
      </View>}
    </ScrollView>
  </View>;
}
