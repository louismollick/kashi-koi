import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import {
  dueSentences,
  getAlbum,
  getSentenceText,
  getSong,
  getLyrics,
  isDue,
  libraryStore,
  readyReviewSentences,
} from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { useNow } from '@/hooks/useNow';
import { Header } from '@/components/Header';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Button, IconButton, Label, styles } from '@/components/ui';
import type { ReviewList } from '@/types/domain';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const sectionTitle = { fontSize: 20, lineHeight: 26, fontWeight: '700' } as const;

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
        <Label style={[sectionTitle, { flex: 1 }]}>{title}</Label>
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
  libraryStore((state) => state.lyrics);
  const reviewList = appStore((state) => state.reviewList);
  const now = useNow();
  const due = dueSentences(reviewList, now);
  const fresh = reviewList.filter((line) => line.kind === 'new');
  const later = reviewList.filter((line) => !isDue(line, now));
  const ready = readyReviewSentences(reviewList, now);
  const waiting = due.length + fresh.length - ready.length;
  return (
    <View style={styles.page}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Button
          label="Review lyrics"
          fill={colors.coral}
          border="#ff9aa5"
          disabled={!ready.length}
          contentStyle={{ minHeight: 76 }}
          onPress={() => {
            appStore.getState().startClipReview();
            router.push('/clip-review');
          }}
        >
          <View style={styles.row}>
            <Icon name="play" size={28} color={colors.cream} />
            <Label style={styles.title}>Review Lyrics</Label>
          </View>
          <Label style={{ fontSize: 13, marginTop: 2 }}>~4 min</Label>
        </Button>
        {waiting > 0 && <Label muted>{plural(waiting, 'sentence')} waiting for translations</Label>}
        <Section title="Due today" items={due} />
        <Section title="New from listening" items={fresh} />
        <Section title="Due later" items={later} />
        {!reviewList.length && <Label muted>All caught up</Label>}
      </ScrollView>
    </View>
  );
}
