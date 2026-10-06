import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { appStore } from '@/store/appStore';
import { getSong, getLyrics, occurrenceLine, libraryStore } from '@/store/libraryStore';
import { colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/Header';
import { QuizColumn, QuizLane } from '@/components/QuizLayout';
import { PlayerBar } from '@/components/PlayerBar';
import { Button, Label, styles } from '@/components/ui';

/** Untimed clips share the quiz column and keep their first answer when revisited. */
export default function ClipReviewScreen() {
  const router = useRouter();
  const clip = appStore(state => state.clipReview);
  const reviewList = appStore(state => state.reviewList);
  libraryStore(state => state.lyrics);
  const item = reviewList.find(line => line.id === clip?.ids[clip.index]);
  useEffect(() => {
    if (!appStore.getState().clipReview) appStore.getState().setPlaying(false);
    return () => appStore.getState().stopClipReview();
  }, []);
  if (!clip || !item) return <View style={styles.page}><ScreenHeader title="Clip review" close /><View style={styles.content}><Label>All done for now</Label><Button onPress={() => router.back()}><Label>Back to review</Label></Button></View></View>;
  const song = getSong(item.songId);
  if (!song) return null;
  const lyrics = getLyrics(song.id), lineIndex = lyrics.timeline.findIndex(occurrence => occurrence.lineId === item.lineId);
  const line = occurrenceLine(song.id, lineIndex), answer = clip.answers[item.id];
  return <View style={styles.page}>
    <ScreenHeader title={song.title} subtitle={`${song.artist} · clip ${clip.index + 1} of ${clip.ids.length}`} close />
    <QuizLane index={clip.index} label="clip" onJump={index => appStore.getState().jumpToClip(index)} segments={clip.ids.map(id => ({ id, fill: clip.answers[id]?.correct === true ? colors.green : clip.answers[id]?.correct === false ? colors.red : colors.laneEmpty }))} />
    <QuizColumn line={line} isNew={item.kind === 'new'} choices={clip.choices[item.lineId] ?? []} selected={answer?.choice ?? null} nice={answer?.correct === true} combo={clip.combo} onAnswer={choice => appStore.getState().answerClip(choice)} />
    <PlayerBar clipReview />
  </View>;
}
