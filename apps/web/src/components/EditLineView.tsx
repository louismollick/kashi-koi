import { appStore } from '@kashi-koi/core/store/appStore';
import { currentSentence, getLineText, getLyrics, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { colors } from '@kashi-koi/design/tokens';
import { useEffect, useRef } from 'react';
import { RubyLine } from './RubyLine';
import { IconButton, Label } from './ui';

/**
 * Moves a review list entry to another sentence of its song, or removes it. Every sentence of the song is listed in
 * song order with the entry's current one centered; sentences already in the review list are marked and disabled.
 * Fills its parent: the desktop player pane or a phone route.
 */
export function EditLineView({ id, onClose }: { id: string; onClose: () => void }) {
  const reviewList = appStore((state) => state.reviewList);
  const showTranslations = settingsStore((state) => state.showTranslations);
  const item = reviewList.find((line) => line.id === id);
  // Re-render when this song's lyrics change; the helpers below read the store.
  libraryStore((state) => state.lyrics[item?.songId ?? '']);
  // Each sentence once, in song order, with the lines of its first occurrence.
  const sentences = item
    ? getLyrics(item.songId)
        .sentenceTimeline.filter(
          (occurrence, index, all) => all.findIndex((other) => other.sentenceId === occurrence.sentenceId) === index,
        )
        .flatMap((occurrence) => currentSentence(item.songId, occurrence.start) ?? [])
    : [];
  const index = item ? sentences.findIndex(({ sentence }) => sentence.id === item.sentenceId) : -1;

  // Keep the entry's sentence in the middle of the list; half a viewport of padding lets the ends reach it.
  const scroller = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const placed = useRef(false);
  useEffect(() => {
    const row = rows.current[index],
      list = scroller.current;
    if (!row || !list) return;
    list.scrollTo({
      top: row.offsetTop + row.offsetHeight / 2 - list.clientHeight / 2,
      // The first placement is instant so the sheet opens already centered.
      behavior: placed.current ? 'smooth' : 'instant',
    });
    placed.current = true;
  }, [index]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-header">
      <div className="flex shrink-0 items-center gap-[10px] p-[14px]">
        <IconButton name="close" label="Close" onPress={onClose} />
        <Label lines={1} className="flex-1 text-[19px] leading-6 font-bold">
          Study a different sentence
        </Label>
        {item && (
          <IconButton
            name="trash"
            fill={colors.coral}
            border={colors.coralBorder}
            label="Remove from review"
            onPress={() => {
              appStore.getState().removeReviewSentence(item.id);
              onClose();
            }}
          />
        )}
      </div>
      {item && (
        <div
          ref={scroller}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [container-type:size]"
        >
          <div className="flex flex-col gap-[18px] px-[22px] py-[50cqh]">
            {sentences.map(({ sentence, lines }, at) => {
              const taken = reviewList.some((entry) => entry.id !== item.id && entry.sentenceId === sentence.id);
              const current = sentence.id === item.sentenceId;
              const color = current ? colors.text : colors.muted;
              return (
                <button
                  key={sentence.id}
                  ref={(element) => {
                    rows.current[at] = element;
                  }}
                  type="button"
                  aria-label={`Study ${lines.map(getLineText).join(' ')}`}
                  aria-disabled={taken}
                  disabled={taken}
                  onClick={() => appStore.getState().moveReviewSentence(item.id, sentence.id)}
                  className="relative flex w-full flex-col gap-1 text-left enabled:transition-[filter] enabled:hover:brightness-125 enabled:active:opacity-70"
                >
                  {lines.map((line, lineIndex) => {
                    const translation =
                      showTranslations && lineIndex === lines.length - 1 ? sentence.translation : undefined;
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: lines never reorder
                      <span key={lineIndex} className="relative block">
                        {taken && lineIndex === 0 && (
                          <span
                            aria-hidden
                            className="absolute size-1.5"
                            style={{ left: -11, top: showTranslations ? 21 : 10, background: colors.coral }}
                          />
                        )}
                        {showTranslations ? (
                          <RubyLine line={line} compact color={color} />
                        ) : (
                          <Label className="block text-xl leading-[26px]" style={{ color }}>
                            {getLineText(line)}
                          </Label>
                        )}
                        {translation && (
                          <Label className="mt-1 block" style={{ color }}>
                            {translation}
                          </Label>
                        )}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
