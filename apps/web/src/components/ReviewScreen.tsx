import { useAvailableReviewList } from '@kashi-koi/core/data/reviewVisibility';
import { dueSentences, isDue, readyReviewSentences } from '@kashi-koi/core/lyrics/review';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getAlbum, getLyrics, getSentenceText, getSong, libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { ReviewList } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Cover } from './Cover';
import { TabHeader } from './Header';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { PixelFrame } from './PixelFrame';
import { Screen } from './Screen';
import { IconButton, Label } from './ui';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useNow } from '@/hooks/useNow';
import { openEditLine } from '@/lib/panels';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One song row, like Library's Songs, with its review sentences below. Clicking the song collapses them. */
function SongGroup({ songId, items }: { songId: string; items: ReviewList }) {
  const [open, setOpen] = useState(true);
  const song = getSong(songId);
  if (!song) return null;
  const sentences = getLyrics(songId).sentences;
  return (
    <div className="border-b border-track" style={{ paddingBottom: open ? 6 : 0 }}>
      <button
        type="button"
        aria-label={song.title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 w-full items-center gap-[10px] py-2 text-left transition-[filter] active:opacity-70 hover:brightness-125"
      >
        <Cover song={getAlbum(song.albumId) ?? song} size={46} />
        <span className="block min-w-0 flex-1">
          <Label lines={1} className="text-base font-bold">
            {song.title}
          </Label>
          <Label muted lines={1} className="text-[13px]">
            {song.artist}
          </Label>
        </span>
      </button>
      {open &&
        items.map((item) => {
          const sentence = sentences.find((sentence) => sentence.id === item.sentenceId);
          if (!sentence) return null;
          const text = getSentenceText(songId, sentence).split('\n').join(' ');
          return (
            <div key={item.id} className="flex min-h-11 items-center gap-[10px] pl-14">
              <Label className="line-clamp-3 min-w-0 flex-1 text-base leading-[22px]">{text}</Label>
              <IconButton
                plain
                name="edit"
                size={40}
                color={colors.lavender}
                label={`Edit ${text}`}
                onPress={() => openEditLine(item.id)}
              />
            </div>
          );
        })}
    </div>
  );
}

/** Hidden when empty. Clicking the header collapses every song in it. */
function Section({ title, items }: { title: string; items: ReviewList }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  const songIds = [...new Set(items.map((item) => item.songId))];
  return (
    <div>
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-[10px] py-1.5 text-left transition-[filter] active:opacity-70 hover:brightness-125"
      >
        <Label pixel className="flex-1 text-[26px]">
          {title}
        </Label>
        <Label muted className="text-[13px]">
          {plural(items.length, 'sentence')} from {plural(songIds.length, 'song')}
        </Label>
      </button>
      {open &&
        songIds.map((songId) => (
          <SongGroup key={songId} songId={songId} items={items.filter((item) => item.songId === songId)} />
        ))}
    </div>
  );
}

/**
 * Due, new and later sentences grouped by song, with clip review on top. The `/review` route on its own; on the
 * desktop it also stays in the browse column while clip review runs in the harbor pane.
 */
export function ReviewScreen() {
  const desktop = useIsDesktop();
  const navigate = useNavigate();
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
    <Screen header={<TabHeader />}>
      <div className="flex flex-col gap-4 p-4">
        {/* Nothing to start once caught up; the empty state below says so instead. */}
        {reviewList.length > 0 && (
          <button
            type="button"
            aria-label="Review lyrics"
            disabled={!ready.length}
            onClick={() => {
              appStore.getState().startClipReview();
              void navigate({ to: '/clip-review' });
            }}
            className="block text-left transition-[filter] active:opacity-80 enabled:hover:brightness-110 disabled:opacity-45"
          >
            <PixelFrame
              fill={colors.coral}
              border={colors.coralBorder}
              contentClassName="flex min-h-[76px] flex-col items-center justify-center px-[14px] py-3"
            >
              <span className="flex items-center gap-[10px]">
                <Icon name="play" size={28} color={colors.cream} />
                <Label pixel className="text-[29px]">
                  Review Lyrics
                </Label>
              </span>
              <Label className="mt-0.5 text-[13px]">~4 min</Label>
            </PixelFrame>
          </button>
        )}
        {waiting > 0 && (
          <Label muted className="block">
            {plural(waiting, 'sentence')} waiting for translations
          </Label>
        )}
        <Section title="Due today" items={due} />
        <Section title="New from listening" items={fresh} />
        <Section title="Due later" items={later} />
        {!reviewList.length && (
          <div className="flex flex-col items-center gap-2 pt-6">
            {/* The desktop's mascot lives in the harbor pane, so only the phone shows her catch here. */}
            {!desktop && <Mascot pose="catch" size={200} />}
            <Label pixel className="text-[29px]">
              All caught up
            </Label>
            <Label muted>Sentences you mark while listening show up here.</Label>
          </div>
        )}
      </div>
    </Screen>
  );
}
