import type { Quiz } from '@kashi-koi/shared/analysis';

export type { Decoy, Quiz } from '@kashi-koi/shared/analysis';
export type FogTile = 'fog' | 'half' | 'clear' | 'red';
export type LineFog = { state: 'half'; run: string } | { state: 'clear' } | { state: 'red' };
/** A finished quiz song's summary; `at` is when it ended, so the card expires even if it was never on screen. */
export type RunEnd = {
  songId: string;
  hits: number;
  answered: number;
  bestCombo: number;
  perfect: boolean;
  at: number;
};
export type Combo = number;
export type QuizToggle = boolean;
export type ListenMode = 'listen';
export type QuizMode = 'quiz';
export type Line = { id: string; segments: { text: string; reading?: string }[]; translation?: string };
export type Occurrence = { lineId: string; startMs: number; endMs: number; translation?: string };
export type Sentence = { id: string; lineIds: string[]; translation?: string; quiz?: Quiz | null };
export type Choice = { text: string; parts: { text: string; marked: boolean }[]; correct: boolean; reason?: string };
export type SentenceOccurrence = { sentenceId: string; start: number; end: number };
export type SongLyrics = {
  songId: string;
  fingerprint: string;
  lines: Line[];
  timeline: Occurrence[];
  sentences: Sentence[];
  sentenceTimeline: SentenceOccurrence[];
  analysis?: {
    title: string;
    about: string;
  };
};
export type LyricsStatus = 'unchecked' | 'synced' | 'none' | 'error';
export type Song = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  track?: number;
  disc?: number;
  year?: number;
  duration: number;
  suffix?: string;
  coverArt?: string;
  played?: number;
  lyricsStatus: LyricsStatus;
};
export type Album = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year?: number;
  coverArt?: string;
  songCount: number;
};
export type Artist = { id: string; name: string; coverArt?: string };
type ReviewSentence = { id: string; songId: string; sentenceId: string };
export type NewSentence = ReviewSentence & { kind: 'new' };
export type DueSentence = ReviewSentence & { kind: 'due'; misses: number };
export type LaterSentence = ReviewSentence & { kind: 'later'; step: number; dueAt: number };
export type ReviewList = (NewSentence | DueSentence | LaterSentence)[];
// Compatibility names for the existing screens until their sentence UI lands.
export type NewLine = NewSentence;
export type DueLine = DueSentence;
export type LaterLine = LaterSentence;
export type ClipReview = {
  id: string;
  ids: string[];
  index: number;
  answers: Record<string, { choice: string; correct: boolean }>;
  choices: Record<string, Choice[]>;
  combo: Combo;
};
/** Each sentence keeps its first answer until the next run; null marks an unanswered miss. */
export type Run = {
  id: string;
  choices: Record<string, Choice[]>;
  answers: Record<string, { choice: string | null; correct: boolean }>;
  combo: Combo;
  bestCombo: Combo;
  perfect: boolean;
};
