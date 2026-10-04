export type Rank = 'S' | 'A' | 'B' | 'C';
export type Combo = number;
export type QuizToggle = boolean;
export type ListenMode = 'listen';
export type QuizMode = 'quiz';
export type Line = { id: string; segments: { text: string; reading?: string }[]; meaning: string };
export type Song = {
  id: string; title: string; artist: string; album: string; color: string;
  accent: string; rank: Rank | null; lines: Line[];
  albumId: string; artistId: string; duration: number; hasLyrics: boolean;
};
export type Album = Pick<Song, 'id' | 'title' | 'artist' | 'artistId' | 'color' | 'accent'> & { year: number };
export type Artist = Pick<Song, 'id' | 'color' | 'accent'> & { name: string };
type ReviewLine = { id: string; songId: string; lineId: string };
export type NewLine = ReviewLine & { kind: 'new' };
export type DueLine = ReviewLine & { kind: 'due'; misses: number };
export type LaterLine = ReviewLine & { kind: 'later' };
export type ReviewList = (NewLine | DueLine | LaterLine)[];
export type ClipReview = { ids: string[]; index: number; answered: boolean | null };
export type ReviewMix = { songIds: string[]; index: number; previousQuizToggle: QuizToggle };
/** Each line keeps its first answer until the next run. */
export type Run = {
  answers: Record<string, { choice: number; correct: boolean }>; combo: Combo; bestCombo: Combo;
  finished: boolean;
};
