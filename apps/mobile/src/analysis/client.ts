import { type SongAnalysis, songAnalysisSchema, validateAnalysis } from '@kashi-koi/shared/analysis';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { type Breakdown, breakdownSchema, validateBreakdown } from '@kashi-koi/shared/breakdown';

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
  const { title, about, lines, sentences } = analysis;
  const errors = validateAnalysis({ title, about, lines, sentences }, lineCount ?? lines.length);
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

export type FetchBreakdownResult = { status: 200; breakdown: Breakdown } | { status: 404 };

function readBreakdown(
  value: unknown,
  fp: string,
  start: number,
  sentenceText: string,
  translation: string,
): Breakdown {
  const breakdown = breakdownSchema.parse(value);
  if (breakdown.fingerprint !== fp || breakdown.start !== start) throw new Error('Breakdown target does not match');
  if (validateBreakdown({ chunks: breakdown.chunks }, sentenceText, translation).length)
    throw new Error('Invalid breakdown');
  return breakdown;
}

/** Public cached lookup, validated against the source sentence. */
export async function fetchBreakdown(
  base: string,
  fp: string,
  start: number,
  sentenceText: string,
  translation: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchBreakdownResult> {
  const response = await fetcher(
    `${base.trim().replace(/\/+$/, '')}/v1/analyses/${encodeURIComponent(fp)}/breakdowns/${start}`,
    {
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404) return { status: 404 };
  if (response.status !== 200)
    throw new Error(
      response.status === 503
        ? 'Server busy, try again'
        : response.status === 429
          ? 'Usage limit reached, try later'
          : 'Breakdown failed',
    );
  return { status: 200, breakdown: readBreakdown(await response.json(), fp, start, sentenceText, translation) };
}

// Server: <=120s queued + two 60s attempts. Allow 270s for POST including transport overhead.
export async function requestBreakdown(
  base: string,
  token: string,
  fp: string,
  start: number,
  sentenceText: string,
  translation: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchBreakdownResult> {
  const response = await fetcher(
    `${base.trim().replace(/\/+$/, '')}/v1/analyses/${encodeURIComponent(fp)}/breakdowns/${start}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(270_000),
    },
  );
  if (response.status === 404) return { status: 404 };
  if (response.status !== 200)
    throw new Error(
      response.status === 503
        ? 'Server busy, try again'
        : response.status === 429
          ? 'Usage limit reached, try later'
          : 'Breakdown failed',
    );
  return { status: 200, breakdown: readBreakdown(await response.json(), fp, start, sentenceText, translation) };
}
