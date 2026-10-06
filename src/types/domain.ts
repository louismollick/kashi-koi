export type Rank = 'S' | 'A' | 'B' | 'C';
export type Combo = number;
export type QuizToggle = boolean;
export type ListenMode = 'listen';
export type QuizMode = 'quiz';
export type Line = { id: string; segments: { text: string; reading?: string }[]; translation?: string };
export type Occurrence = { lineId: string; startMs: number; endMs: number };
export type SongLyrics = { songId: string; lines: Line[]; timeline: Occurrence[] };
export type LyricsStatus = 'unchecked' | 'synced' | 'none' | 'error';
export type Song = {
  id: string; title: string; artist: string; artistId: string; album: string; albumId: string;
  track?: number; disc?: number; year?: number; duration: number; coverArt?: string; played?: number; lyricsStatus: LyricsStatus;
};
export type Album = { id: string; title: string; artist: string; artistId: string; year?: number; coverArt?: string; songCount: number };
export type Artist = { id: string; name: string; coverArt?: string };
type ReviewLine = { id: string; songId: string; lineId: string };
export type NewLine = ReviewLine & { kind: 'new' };
export type DueLine = ReviewLine & { kind: 'due'; misses: number };
export type LaterLine = ReviewLine & { kind: 'later' };
export type ReviewList = (NewLine | DueLine | LaterLine)[];
export type ClipReview = { ids: string[]; index: number; answers: Record<string, { choice: string; correct: boolean }>; choices: Record<string, string[]>; combo: Combo };
export type ReviewMix = { songIds: string[]; index: number; previousQuizToggle: QuizToggle };
/** Each line keeps its first answer until the next run. */
export type Run = {
  choices: Record<string, string[]>; answers: Record<string, { choice: string; correct: boolean }>; combo: Combo; bestCombo: Combo;
  finished: boolean;
};
