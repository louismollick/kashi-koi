import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appStore } from '@/store/appStore';
import { getLineText, getSong, getLyrics, occurrenceLine } from '@/store/libraryStore';
import { colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/Header';
import { LineCard } from '@/components/LineCard';
import { Answers } from '@/components/Answers';
import { Button, IconButton, Label, Tag, styles } from '@/components/ui';

/** Untimed Meaning Match for one review line, with shared editing and Next. */
export default function ClipReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clip = appStore(state => state.clipReview);
  const reviewList = appStore(state => state.reviewList);
  const [replaying, setReplaying] = useState(false);
  const item = reviewList.find(line => line.id === clip?.ids[clip.index]);
  const endMs = item ? getLyrics(item.songId).timeline.find(occurrence => occurrence.lineId === item.lineId)?.endMs : undefined;
  useEffect(() => {
    if (!replaying || endMs === undefined) return;
    let done = false;
    const stop = () => { if (done) return; done = true; appStore.getState().setPlaying(false); setReplaying(false); };
    const unsubscribe = appStore.subscribe(state => { if (state.positionMs >= endMs) stop(); });
    return () => { unsubscribe(); appStore.getState().setPlaying(false); };
  }, [replaying, endMs]);
  if (!clip || !item) return <View style={styles.page}><ScreenHeader title="Clip review" close /><View style={styles.content}><Label>All done for now</Label><Button onPress={() => router.back()}><Label>Back to review</Label></Button></View></View>;
  const song = getSong(item.songId);
  if (!song) return null;
  const lyrics = getLyrics(song.id), lineIndex = lyrics.timeline.findIndex(occurrence => occurrence.lineId === item.lineId);
  const line = occurrenceLine(song.id, lineIndex), occurrence = lyrics.timeline[lineIndex];
  if (!line || !occurrence) return null;
  return <View style={styles.page}>
    <ScreenHeader title={song.title} subtitle={`${song.artist} · clip ${clip.index + 1} of ${clip.ids.length}`} close />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 18 }} showsVerticalScrollIndicator={false}>
      <Label muted style={{ textAlign: 'center', fontSize: 14 }}>{lineIndex > 0 ? getLineText(occurrenceLine(song.id, lineIndex - 1)!) : '♪'}</Label>
      <LineCard line={line} isNew={item.kind === 'new'} />
      <Label muted style={{ textAlign: 'center', fontSize: 14 }}>{lineIndex + 1 < lyrics.timeline.length ? getLineText(occurrenceLine(song.id, lineIndex + 1)!) : '♪'}</Label>
      <Button label="Edit line" onPress={() => router.push({ pathname: '/edit-line', params: { id: item.id } })}><Label>Edit line</Label></Button>
      <View style={styles.row}>
        <IconButton name={replaying ? 'pause' : 'play'} label="Replay clip" fill={colors.coral} size={64} onPress={() => { if (replaying) appStore.getState().setPlaying(false); else { appStore.getState().startSong(song.id); appStore.getState().jumpToLine(lineIndex); } setReplaying(value => !value); }} />
        <View><Label style={{ fontSize: 13 }}>{song.title} · {song.artist}</Label><Label muted style={{ fontSize: 11 }}>{Math.floor(occurrence.startMs / 1000)}s to {Math.floor(occurrence.endMs / 1000)}s · tap to replay</Label></View>
      </View>
      <Answers choices={clip.choices[line.id] ?? []} translation={line.translation} selected={clip.choice} onAnswer={choice => appStore.getState().answerClip(choice)} />
      {clip.answered !== null && <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Tag fill={colors.slate}>{clip.answered ? 'next in 9 days' : 'next tomorrow'}</Tag>
        <Button label="Next clip" fill={colors.coral} onPress={() => { appStore.getState().nextClip(); setReplaying(false); }}><Label>Next ▸</Label></Button>
      </View>}
    </ScrollView>
  </View>;
}
