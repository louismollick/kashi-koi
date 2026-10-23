import { appStore, remoteSkip } from '@kashi-koi/core/store/appStore';
import { currentSentence, getSong } from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { useEffect } from 'react';

export type Shortcut =
  | 'play-pause'
  | 'answer-1'
  | 'answer-2'
  | 'answer-3'
  | 'lost-mark'
  | 'quiz'
  | 'speed'
  | 'previous-line'
  | 'next-line'
  | 'next-song'
  | 'previous-song';

/**
 * Where keyboard focus is. `typing` fields keep every key; `slider` (the scrubber) keeps the arrows; a keyboard-focused
 * `control` (button, link, switch) keeps Space and Enter, because Space presses it.
 */
export type Focus = 'typing' | 'slider' | 'control' | 'none';

const keys: Record<string, Shortcut> = {
  ' ': 'play-pause',
  '1': 'answer-1',
  '2': 'answer-2',
  '3': 'answer-3',
  l: 'lost-mark',
  q: 'quiz',
  s: 'speed',
  ArrowLeft: 'previous-line',
  ArrowRight: 'next-line',
  n: 'next-song',
  p: 'previous-song',
};

/**
 * The shortcut a key press means, or null to leave it alone: with Ctrl, Cmd or Alt held (browser and OS shortcuts), in
 * a text field, or when the focused control already uses the key. Letters match either case.
 */
export function shortcutFor(
  key: string,
  modifiers: { ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  focus: Focus,
): Shortcut | null {
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey || focus === 'typing') return null;
  const shortcut = keys[key.length === 1 ? key.toLowerCase() : key];
  if (!shortcut) return null;
  if (shortcut === 'play-pause' && focus === 'control') return null;
  if ((shortcut === 'previous-line' || shortcut === 'next-line') && focus === 'slider') return null;
  return shortcut;
}

function focusOf(target: EventTarget | null): Focus {
  if (!(target instanceof HTMLElement)) return 'none';
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return 'typing';
  if (target.getAttribute('role') === 'slider') return 'slider';
  if (
    target.matches('button, a[href], summary, [role=button], [role=switch], [role=tab]') &&
    target.matches(':focus-visible')
  )
    return 'control';
  return 'none';
}

/** Pick answer `index` for the sentence on screen: the clip in clip review, otherwise the quiz sentence being played. */
function answer(index: number) {
  const state = appStore.getState(),
    clip = state.clipReview;
  if (clip) {
    const item = state.reviewList.find((item) => item.id === clip.ids[clip.index]);
    const choice = item && !clip.answers[item.id] ? clip.choices[item.sentenceId]?.[index] : undefined;
    if (choice) state.answerClip(choice.text);
    return;
  }
  if (!state.quizToggle || state.clipPlayback) return;
  const sentence = currentSentence(state.songId, state.lineIndex)?.sentence;
  const choice = sentence && !state.run.answers[sentence.id] ? state.run.choices[sentence.id]?.[index] : undefined;
  if (choice) state.answer(choice.text);
}

/** Do what a shortcut means, with the same store calls as the matching buttons. */
export function runShortcut(shortcut: Shortcut) {
  const state = appStore.getState();
  const reviewing = !!state.clipReview;
  switch (shortcut) {
    case 'play-pause':
      if (reviewing) state.setPlaying(!state.playing);
      else if (state.songId) {
        // While a quiz sentence is held, the play button is Replay.
        if (state.answerWait) state.replayLine();
        else state.setPlaying(!(state.playing && !state.clipPlayback));
      }
      break;
    case 'answer-1':
    case 'answer-2':
    case 'answer-3':
      answer(Number(shortcut.slice(-1)) - 1);
      break;
    case 'lost-mark':
      // Quiz mode misses add themselves; the lost mark belongs to listen mode.
      if (!reviewing && state.songId && !state.quizToggle) state.addLostMark();
      break;
    case 'quiz':
      if (!reviewing && getSong(state.songId)) state.setQuizToggle(!state.quizToggle);
      break;
    case 'speed':
      settingsStore.getState().cyclePlaybackRate();
      break;
    case 'previous-line':
      if (!reviewing && state.songId) state.jumpToLine(Math.max(0, state.lineIndex - 1));
      break;
    case 'next-line':
      if (!reviewing && state.songId) state.advanceLine();
      break;
    case 'next-song':
      remoteSkip('next');
      break;
    case 'previous-song':
      remoteSkip('previous');
      break;
  }
}

/** Mount once in the shell: desktop shortcuts (also for a phone with a keyboard). */
export function useShortcuts() {
  useEffect(() => {
    // Space also presses a focused button on key up, so a handled Space swallows its key up too.
    let swallowKeyUp = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      const shortcut = shortcutFor(event.key, event, focusOf(event.target));
      if (!shortcut) return;
      event.preventDefault();
      swallowKeyUp = event.key === ' ';
      runShortcut(shortcut);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !swallowKeyUp) return;
      swallowKeyUp = false;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
