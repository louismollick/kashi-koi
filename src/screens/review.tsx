import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getLineText, getSong, getLyrics, libraryStore, hasMeanings } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { Header } from '@/components/Header';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, IconButton, Label, SectionHeader, Tag, styles } from '@/components/ui';
import type { ReviewList } from '@/types/domain';

/** Review-list item exposes one Edit action for moving or removing its line. */
function ReviewLineRow({ item }: { item: ReviewList[number] }) {
  const router = useRouter();
  const song = getSong(item.songId);
  const line = getLyrics(item.songId).lines.find(line => line.id === item.lineId);
  if (!song || !line) return null;
  return <PixelFrame fill={colors.surface} border="#2c2f4b" contentStyle={[styles.row, { padding: 10, gap: 12 }]}>
    <Cover song={song} size={64} />
    <View style={{ flex: 1, gap: 3 }}>
      {item.kind === 'new' ? <View style={{ alignSelf: 'flex-start' }}><Tag>NEW</Tag></View>
        : item.kind === 'due' && item.misses > 0 ? <Label style={{ fontSize: 11, fontWeight: '700', color: colors.coralSoft }}>MISSED {item.misses}×</Label> : null}
      <Label numberOfLines={2} style={{ fontSize: 16, lineHeight: 22, fontWeight: '600' }}>{getLineText(line)}</Label>
      <Label muted numberOfLines={1} style={{ fontSize: 12 }}>{song.title} · {song.artist}</Label>
    </View>
    <IconButton name="edit" size={46} fill="#232641" border="#4b4f80" color={colors.lavender} label={`Edit ${getLineText(line)}`} onPress={() => router.push({ pathname: '/edit-line', params: { id: item.id } })} />
  </PixelFrame>;
}

/** New and due lines, with translation-dependent review actions. */
export default function ReviewScreen() {
  const router = useRouter();
  libraryStore(state => state.lyrics);
  const reviewList = appStore(state => state.reviewList);
  const newLines = reviewList.filter(line => line.kind === 'new');
  const dueLines = reviewList.filter(line => line.kind === 'due');
  const count = newLines.length + dueLines.length;
  const songCount = new Set([...newLines, ...dueLines].map(line => line.songId)).size;
  return <View style={styles.page}><Header />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.row, { alignItems: 'stretch' }]}>
        <Button label="Start clip review" fill={colors.coral} border="#ff9aa5" disabled={!count || !reviewList.filter(item => item.kind !== 'later').every(item => hasMeanings(item.songId))} style={{ flex: 1 }} contentStyle={{ minHeight: 84 }} onPress={() => { appStore.getState().startClipReview(); router.push('/clip-review'); }}>
          <View style={styles.row}><Icon name="play" size={30} color={colors.cream} /><Label style={styles.title}>Clips</Label></View>
          <Label style={{ fontSize: 13, marginTop: 2 }}>{count} lines · ~4 min</Label>
        </Button>
        <Button label="Start review mix" fill={colors.slate} border="#4b4f80" disabled={!count || !reviewList.filter(item => item.kind !== 'later').every(item => hasMeanings(item.songId))} style={{ flex: 1 }} contentStyle={{ minHeight: 84 }} onPress={() => { appStore.getState().startReviewMix(); router.push('/player'); }}>
          <View style={styles.row}><Icon name="musicFilled" size={30} color={colors.lavender} /><Label style={styles.title}>Songs</Label></View>
          <Label style={{ fontSize: 13, marginTop: 2, color: '#d6d2ee' }}>{songCount} songs · {songCount * 4} min</Label>
        </Button>
      </View>
      {count > 0 && !reviewList.filter(item => item.kind !== 'later').every(item => hasMeanings(item.songId)) && <Label muted>Needs translations</Label>}
      <SectionHeader title="New from listening" hint="Check the line" />
      {newLines.map(item => <ReviewLineRow key={item.id} item={item} />)}
      <SectionHeader title="Due today" count={dueLines.length} hint="Review these lines" />
      {dueLines.map(item => <ReviewLineRow key={item.id} item={item} />)}
      {!count && <Label muted>All caught up</Label>}
      <PixelFrame fill={colors.surface} border="#2c2f4b" contentStyle={[styles.row, { padding: 14 }]}><Label style={{ flex: 1, fontWeight: '600' }}>Later</Label><Label muted>{reviewList.filter(line => line.kind === 'later').length}</Label><Icon name="next" size={18} /></PixelFrame>
    </ScrollView>
  </View>;
}
