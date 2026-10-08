import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { libraryStore } from '@/store/libraryStore';
import { appStore } from '@/store/appStore';
import { colors } from '@/constants/theme';
import { Cover } from './Cover';
import { Marquee } from './Marquee';
import { IconButton, Label, styles } from './ui';

const time = (ms: number) => { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const INSET = 16;

/**
 * Full-width coral progress line. With `onSeek`, a 28 pt band scrubs the song: x maps from the
 * 16 pt insets, clamped, so dragging into either screen edge reaches the start or end. VoiceOver steps 10 s.
 */
export function ProgressLine({ progress, total = 0, onSeek, height = 4, track = colors.track }: { progress: number; total?: number; onSeek?: (ms: number) => void; height?: number; track?: string }) {
  const { width } = useWindowDimensions();
  const [drag, setDrag] = useState<{ value: number; x: number } | null>(null);
  const at = (x: number) => ({ value: Math.min(1, Math.max(0, (x - INSET) / (width - INSET * 2))), x });
  const value = Math.min(1, Math.max(0, drag?.value ?? progress));
  const line = <View style={{ height: drag ? height + 2 : height, backgroundColor: track }}><View style={{ width: `${value * 100}%`, height: '100%', backgroundColor: colors.coral }} /></View>;
  if (!onSeek) return line;
  return <View accessible accessibilityRole="adjustable" accessibilityLabel="Song position" accessibilityValue={{ text: time(value * total) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={({ nativeEvent }) => onSeek(Math.min(total, Math.max(0, value * total + (nativeEvent.actionName === 'increment' ? 10000 : -10000))))}
    onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
    onResponderGrant={({ nativeEvent }) => setDrag(at(nativeEvent.pageX))} onResponderMove={({ nativeEvent }) => setDrag(at(nativeEvent.pageX))}
    onResponderRelease={() => { if (drag) onSeek(drag.value * total); setDrag(null); }} onResponderTerminate={() => setDrag(null)}
    style={{ height: 28, justifyContent: 'center', marginTop: -12 }}>
    {line}
    {drag && <Label style={{ position: 'absolute', bottom: 26, left: Math.min(width - 56, Math.max(8, drag.x - 24)), width: 48, textAlign: 'center', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{time(drag.value * total)}</Label>}
  </View>;
}

/** Progress, song and play controls. Clip review shows clip progress, can't scrub and keeps only play. */
export function PlayerBar({ clipReview = false }: { clipReview?: boolean }) {
  const insets = useSafeAreaInsets();
  const clip = appStore(state => state.clipPlayback);
  const songId = appStore(state => clipReview ? state.clipPlayback?.songId : state.songId);
  const waiting = appStore(state => !!state.answerWait);
  const loading = appStore(state => state.loading);
  const song = libraryStore(state => songId ? state.bySong[songId] : undefined);
  const playing = appStore(state => state.playing && (clipReview || !state.clipPlayback));
  const position = appStore(state => state.positionMs), duration = appStore(state => state.durationMs);
  if (!song) return null;
  const ended = clipReview ? !!clip?.ended : waiting;
  const elapsed = clipReview && clip ? Math.max(0, clip.positionMs - clip.startMs) : position;
  const total = clipReview && clip ? clip.endMs - clip.startMs : duration;
  return <View style={{ backgroundColor: colors.panel, paddingBottom: Math.max(insets.bottom - 4, 14) }}>
    {clipReview ? <ProgressLine progress={total ? elapsed / total : 0} /> : <ProgressLine progress={total ? elapsed / total : 0} total={total} onSeek={ms => appStore.getState().seek(ms)} />}
    <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 12 }]}>
      <Cover song={song} size={50} />
      <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Marquee key={song.id} style={{ fontWeight: '700', fontSize: 16 }}>{song.title}</Marquee>
        <Label muted numberOfLines={1} style={{ fontSize: 13 }}>{song.artist}</Label>
      </View>
      {!clipReview && <IconButton name="skipPrevious" size={46} label="Previous song" onPress={() => appStore.getState().skipBack()} />}
      <IconButton name={playing ? 'pause' : ended ? 'refresh' : 'play'} fill={colors.coral} size={52} label={playing ? 'Pause' : ended ? 'Replay' : 'Play'} disabled={loading}
        onPress={() => ended && !clipReview ? appStore.getState().replayLine() : appStore.getState().setPlaying(!playing)} />
      {!clipReview && <IconButton name="skipNext" size={46} label="Next song" onPress={() => appStore.getState().nextSong()} />}
    </View>
  </View>;
}
