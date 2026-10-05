import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appStore } from '@/store/appStore';
import { getLineText, getSong, getLyrics, occurrenceLine } from '@/store/libraryStore';
import { colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/Header';
import { LineCard } from '@/components/LineCard';
import { Cover } from '@/components/Cover';
import { Answers } from '@/components/Answers';
import { Button, IconButton, Label, Tag, styles } from '@/components/ui';

/** Untimed translation review with bounded audio replay. */
export default function ClipReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clip = appStore(state => state.clipReview);
  const reviewList = appStore(state => state.reviewList);
  const replaying = appStore(state => state.playing && !!state.clipPlayback);
  const item = reviewList.find(line => line.id === clip?.ids[clip.index]);
  useEffect(() => {
    if (!appStore.getState().clipReview) appStore.getState().setPlaying(false);
    return () => appStore.getState().stopClipReview();
  }, []);
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
      <View style={styles.row}>
        <Cover song={song} size={80} />
        <View style={{ flex: 1, gap: 4 }}><Label numberOfLines={2} style={{ fontSize: 14 }}>{song.title}</Label><Label muted numberOfLines={1} style={{ fontSize: 12 }}>{song.artist}</Label><Label muted style={{ fontSize: 11 }}>{Math.floor(occurrence.startMs / 1000)}s to {Math.floor(occurrence.endMs / 1000)}s</Label></View>
        <IconButton name={replaying ? 'pause' : 'play'} label={replaying ? 'Pause clip' : 'Replay clip'} fill={colors.coral} size={64} onPress={() => replaying ? appStore.getState().setPlaying(false) : appStore.getState().playClip(song.id, occurrence.startMs, occurrence.endMs)} />
      </View>
      <Answers choices={clip.choices[line.id] ?? []} translation={line.translation} selected={clip.choice} onAnswer={choice => appStore.getState().answerClip(choice)} />
      {clip.answered !== null && <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Tag fill={colors.slate}>{clip.answered ? 'next in 9 days' : 'next tomorrow'}</Tag>
        <Button label="Next clip" fill={colors.coral} onPress={() => appStore.getState().nextClip()}><Label>Next ▸</Label></Button>
      </View>}
    </ScrollView>
  </View>;
}
