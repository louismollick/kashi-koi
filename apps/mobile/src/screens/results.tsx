import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canExplain } from '@/analysis/breakdowns';
import { appStore, getRunSummary } from '@/store/appStore';
import { getSentenceText, libraryStore } from '@/store/libraryStore';
import { colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/Header';
import { Cover } from '@/components/Cover';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, Label, PixelToggle, styles } from '@/components/ui';
import type { Rank } from '@/types/domain';

/** Completed Run summarizes tested lines and lets each miss enter ReviewList. */
export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  libraryStore((state) => state.lyrics);
  const run = appStore((state) => state.run);
  const { hits, total, missed, rank } = song
    ? getRunSummary(song, run)
    : { hits: 0, total: 0, missed: [], rank: 'C' as const };
  const [send, setSend] = useState(() => Object.fromEntries(missed.map((line) => [line.id, true])));
  const reviewCount = Object.values(send).filter(Boolean).length;
  const ranks: Rank[] = ['C', 'B', 'A', 'S'];
  const best = appStore((state) => state.ranks[songId ?? '']);
  const improved = !best || ranks.indexOf(rank) > ranks.indexOf(best);
  useEffect(() => {
    missed.forEach((line) => appStore.getState().sendToReview(line.id, true));
  }, [songId, run.answers]);
  // The picked decoy's reason; unanswered and line-by-line misses have none.
  const reasonFor = (id: string) =>
    run.choices[id]?.find((choice) => choice.text === run.answers[id]?.choice && !choice.correct)?.reason;
  if (!song) return null;
  return (
    <View style={styles.page}>
      <ScreenHeader title="Results" close />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: Math.max(insets.bottom, 20) }}>
        <View style={styles.row}>
          <Cover song={song} size={60} />
          <View>
            <Label style={styles.title}>{song.title}</Label>
            <Label muted>{song.artist}</Label>
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Label style={{ fontSize: 100, lineHeight: 115, fontWeight: '900', color: colors.combo }}>{rank}</Label>
          <Label style={{ fontSize: 12, fontWeight: '700', color: colors.combo }}>
            {improved ? `NEW BEST · was ${best ?? 'unranked'}` : `BEST ${best}`}
          </Label>
        </View>
        <PixelFrame fill={colors.surface} contentStyle={[styles.row, { padding: 18, justifyContent: 'space-around' }]}>
          {[
            { value: `${hits} / ${total}`, label: 'hits' },
            { value: run.bestCombo, label: 'best combo' },
            { value: reviewCount, label: reviewCount === 1 ? 'review' : 'reviews' },
          ].map((stat) => (
            <View key={stat.label} style={{ alignItems: 'center' }}>
              <Label style={{ fontSize: 26, fontWeight: '700', lineHeight: 34 }}>{stat.value}</Label>
              <Label muted style={{ fontSize: 11 }}>
                {stat.label}
              </Label>
            </View>
          ))}
        </PixelFrame>
        <Label style={{ fontSize: 18, fontWeight: '600' }}>Missed sentences</Label>
        {!missed.length && <Label muted>No missed sentences</Label>}
        {missed.map((line) => (
          <PixelFrame key={line.id} fill={colors.surface} contentStyle={[styles.row, { padding: 14 }]}>
            <View style={{ flex: 1 }}>
              <Label>{getSentenceText(song.id, line)}</Label>
              <Label muted style={{ marginTop: 4 }}>
                {line.translation}
              </Label>
              {reasonFor(line.id) && (
                <Label style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.cream }}>
                  {reasonFor(line.id)}
                </Label>
              )}
              <Label muted style={{ fontSize: 11, marginTop: 4 }}>
                send to review
              </Label>
              {canExplain(song.id) && (
                <Button
                  label={`Explain ${getSentenceText(song.id, line)}`}
                  style={{ alignSelf: 'flex-start', marginTop: 10 }}
                  contentStyle={{ minHeight: 36, paddingVertical: 6 }}
                  onPress={() =>
                    router.push({ pathname: '/breakdown', params: { songId: song.id, sentenceId: line.id } })
                  }
                >
                  <Label style={{ fontSize: 13, fontWeight: '800' }}>EXPLAIN</Label>
                </Button>
              )}
            </View>
            <PixelToggle
              label={`Send ${getSentenceText(song.id, line)} to review`}
              on={send[line.id] ?? false}
              onPress={() => {
                const enabled = !send[line.id];
                setSend((value) => ({ ...value, [line.id]: enabled }));
                appStore.getState().sendToReview(line.id, enabled);
              }}
            />
          </PixelFrame>
        ))}
        <View style={styles.row}>
          <Button
            style={{ flex: 1 }}
            onPress={() => {
              appStore.getState().restartRun();
              router.replace('/player');
            }}
          >
            <Label>Again</Label>
          </Button>
          <Button
            style={{ flex: 1 }}
            fill={colors.coral}
            onPress={() => {
              appStore.getState().nextSong();
              router.replace('/player');
            }}
          >
            <Label>Next song</Label>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
