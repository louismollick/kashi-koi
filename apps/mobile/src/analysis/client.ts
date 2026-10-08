import { type SongAnalysis, songAnalysisSchema, validateAnalysis } from '@kashi-koi/shared/analysis';
import { fingerprint } from '@kashi-koi/shared/fingerprint';

export type AnalysisJob = { status: 'queued' | 'running' | 'failed'; error?: string };
export type AnalysisRequest = { title: string; artist?: string; lines: string[]; force?: boolean };
export type FetchAnalysisResult =
  | { status: 200; analysis: SongAnalysis }
  | { status: 202; job: AnalysisJob }
  | { status: 404 };
export type RequestAnalysisResult =
  | { status: 200; analysis: SongAnalysis }
  | { status: 202; fingerprint: string; job: AnalysisJob };

function readAnalysis(value: unknown, expectedFingerprint: string, lineCount?: number): SongAnalysis {
  const analysis = songAnalysisSchema.parse(value);
  if (analysis.fingerprint !== expectedFingerprint) throw new Error('Song analysis fingerprint does not match');
  const { title, summary, speaker, addressee, lines, sentences, notes } = analysis;
  const errors = validateAnalysis(
    { title, summary, speaker, addressee, lines, sentences, notes },
    lineCount ?? lines.length,
  );
  if (errors.length) throw new Error(`Invalid song analysis: ${errors.join('; ')}`);
  return analysis;
}

function readJob(value: unknown): AnalysisJob {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('status' in value) ||
    (value.status !== 'queued' && value.status !== 'running' && value.status !== 'failed')
  )
    throw new Error('Invalid song analysis job');
  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') throw new Error('Invalid song analysis job');
  return { status: value.status, ...(error === undefined ? {} : { error }) };
}

/** Public lookup; missing analyses and unfinished jobs are normal results. */
export async function fetchAnalysis(
  base: string,
  fp: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchAnalysisResult> {
  const response = await fetcher(`${base.trim().replace(/\/+$/, '')}/v1/analyses/${encodeURIComponent(fp)}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return { status: 404 };
  if (response.status === 200) return { status: 200, analysis: readAnalysis(await response.json(), fp) };
  if (response.status === 202) return { status: 202, job: readJob(await response.json()) };
  throw new Error(`Song analysis request failed: HTTP ${response.status}`);
}

/** Queue an owner-authorized analysis, or return an existing validated one. */
export async function requestAnalysis(
  base: string,
  token: string,
  input: AnalysisRequest,
  fetcher: typeof fetch = fetch,
): Promise<RequestAnalysisResult> {
  const fp = fingerprint(input.lines);
  const lineCount = input.lines.length;
  const response = await fetcher(`${base.trim().replace(/\/+$/, '')}/v1/analyses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 200) return { status: 200, analysis: readAnalysis(await response.json(), fp, lineCount) };
  if (response.status === 202) {
    const value: unknown = await response.json();
    const job = readJob(value);
    if (typeof value !== 'object' || value === null || !('fingerprint' in value) || value.fingerprint !== fp)
      throw new Error('Song analysis job fingerprint does not match');
    return { status: 202, fingerprint: fp, job };
  }
  throw new Error(`Song analysis request failed: HTTP ${response.status}`);
}
