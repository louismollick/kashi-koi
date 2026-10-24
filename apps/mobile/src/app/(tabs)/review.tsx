import { useAvailableReviewList } from '@kashi-koi/core/data/reviewVisibility';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { dueSentences, isDue, nextDue, readyReviewSentences, reviewTime } from '@kashi-koi/core/lyrics/review';
import { getAlbum, getSentenceText, getSong, getLyrics, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { appStore } from '@kashi-koi/core/store/appStore';
import { useNow } from '@/hooks/useNow';
import { Header } from '@/components/Header';
import { Cover } from '@/components/Cover';
import { Mascot } from '@/components/Mascot';
import { Icon } from '@/components/Icon';
import { Button, IconButton, Label, styles } from '@/components/ui';
import type { ReviewList } from '@kashi-koi/core/types/domain';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One song row, like Library's Songs, with its review sentences below. Tapping the song collapses them. */
function SongGroup({ songId, items }: { songId: string; items: ReviewList }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const song = getSong(songId);
  if (!song) return null;
  const sentences = getLyrics(songId).sentences;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.track, paddingBottom: open ? 6 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={song.title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.row, { minHeight: 64, paddingVertical: 8 }]}
      >
        <Cover song={getAlbum(song.albumId) ?? song} size={46} />
        <View style={{ flex: 1 }}>
          <Label numberOfLines={1} style={{ fontWeight: '700', fontSize: 16 }}>
            {song.title}
          </Label>
          <Label muted numberOfLines={1} style={{ fontSize: 13 }}>
            {song.artist}
          </Label>
        </View>
      </Pressable>
      {open &&
        items.map((item) => {
          const sentence = sentences.find((sentence) => sentence.id === item.sentenceId);
          if (!sentence) return null;
          const text = getSentenceText(songId, sentence).split('\n').join(' ');
          return (
            <View key={item.id} style={[styles.row, { paddingLeft: 56, minHeight: 44 }]}>
              <Label numberOfLines={3} style={{ flex: 1, fontSize: 16, lineHeight: 22 }}>
                {text}
              </Label>
              <IconButton
                plain
                name="edit"
                size={40}
                color={colors.lavender}
                label={`Edit ${text}`}
                onPress={() => router.push({ pathname: '/edit-line', params: { id: item.id } })}
              />
            </View>
          );
        })}
    </View>
  );
}

/** Hidden when empty. Tapping the header collapses every song in it. */
function Section({ title, items }: { title: string; items: ReviewList }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  const songIds = [...new Set(items.map((item) => item.songId))];
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.row, { paddingVertical: 6 }]}
      >
        <Label pixel style={{ flex: 1, fontSize: 26 }}>
          {title}
        </Label>
        <Label muted style={{ fontSize: 13 }}>
          {plural(items.length, 'sentence')} from {plural(songIds.length, 'song')}
        </Label>
      </Pressable>
      {open &&
        songIds.map((songId) => (
          <SongGroup key={songId} songId={songId} items={items.filter((item) => item.songId === songId)} />
        ))}
    </View>
  );
}

/** Due, new and later sentences grouped by song, with clip review on top. */
export default function ReviewScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  // Every song in the list renders its sentences and readiness from lyrics, so any lyrics update re-renders.
  libraryStore((state) => state.lyrics);
  const reviewList = useAvailableReviewList();
  const now = useNow();
  const due = dueSentences(reviewList, now);
  const fresh = reviewList.filter((line) => line.kind === 'new');
  const later = reviewList.filter((line) => !isDue(line, now));
  const ready = readyReviewSentences(reviewList, now);
  const waiting = due.length + fresh.length - ready.length;
  return (
    <View style={styles.page}>
      <Header />
      {/* An empty list centers its caught-up message in the screen. */}
      <ScrollView
        contentContainerStyle={
          reviewList.length ? styles.content : [styles.content, { flexGrow: 1, justifyContent: 'center' }]
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Nothing to start once caught up; the empty state below says so instead. */}
        {reviewList.length > 0 && (
          <Button
            label="Review lyrics"
            fill={colors.coral}
            border={colors.coralBorder}
            disabled={!ready.length}
            contentStyle={{ minHeight: 76 }}
            onPress={() => {
              appStore.getState().startClipReview();
              router.push('/clip-review');
            }}
          >
            <View style={styles.row}>
              <Icon name="play" size={28} color={colors.cream} />
              <Label pixel style={{ fontSize: 29 }}>
                Review Lyrics
              </Label>
            </View>
            {/* With nothing ready yet, the button says when there will be. */}
            <Label style={{ fontSize: 13, marginTop: 2 }}>
              {(!ready.length && nextDue(reviewList, now)) || reviewTime}
            </Label>
          </Button>
        )}
        {waiting > 0 && <Label muted>{plural(waiting, 'sentence')} waiting for translations</Label>}
        <Section title="Due today" items={due} />
        <Section title="New from listening" items={fresh} />
        <Section title="Due later" items={later} />
        {!reviewList.length && (
          <View style={{ alignItems: 'center', gap: 8, paddingBottom: height * 0.06 }}>
            <Mascot pose="catch" size={200} />
            <Label pixel style={{ fontSize: 29 }}>
              All caught up
            </Label>
            <Label muted>Sentences you mark while listening show up here.</Label>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
