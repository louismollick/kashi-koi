import { setTimeout } from 'node:timers/promises';
import { analysisAdvice, dropInvalidQuizzes, songAnalysisDraftSchema, songAnalysisSchema } from '@kashi-koi/shared';
import { type Analyzer, UsageLimitError } from './analyzer/index.ts';
import { validateDraft } from './analyzer/validate.ts';
import type { Store } from './db/index.ts';

const MIN_USAGE_DELAY = 15 * 60 * 1000;
const MAX_USAGE_DELAY = 60 * 60 * 1000;

/** A single worker owns the queue; usage limits pause all jobs rather than spending retries. */
export class Worker {
  private usageDelay = MIN_USAGE_DELAY;
  private pausedUntil = 0;
  private busy = false;

  constructor(
    private readonly store: Store,
    private readonly analyzer: Analyzer,
    private readonly now = Date.now,
  ) {}

  /** Process at most one job. Exposed so queue behavior can be tested without timers or Codex. */
  async runNext(): Promise<boolean> {
    if (this.busy) throw new Error('Worker is already processing a job');
    if (this.now() < this.pausedUntil) return false;
    const job = this.store.claimNext();
    if (!job) return false;
    if (job.exhausted) {
      this.store.fail(job.fingerprint, exhaustedMessage(job.error));
      return true;
    }
    this.busy = true;
    try {
      let feedback: string[] | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const output = await this.analyzer.analyze({
          title: job.title,
          artist: job.artist ?? undefined,
          lines: job.lines,
          feedback,
        });
        const draft = attempt === 0 ? output : dropInvalidQuizzes(output, job.lines);
        const errors = validateDraft(draft, job.lines.length, job.lines);
        const advice = attempt === 0 ? analysisAdvice(draft) : [];
        if (errors.length || advice.length) {
          if (errors.length) console.error('Analysis validation failed');
          if (attempt === 0) {
            feedback = [...errors, ...advice];
            continue;
          }
          this.store.fail(job.fingerprint, 'Analysis validation failed');
          return true;
        }
        const analysis = songAnalysisSchema.parse({
          ...songAnalysisDraftSchema.parse(draft),
          schemaVersion: 3,
          fingerprint: job.fingerprint,
          model: this.analyzer.model,
          createdAt: new Date(this.now()).toISOString(),
        });
        this.store.complete(analysis, job.lines);
        this.usageDelay = MIN_USAGE_DELAY;
        return true;
      }
    } catch (error) {
      const message = errorMessage(error, job.lines);
      console.error(message);
      // Usage limits pause the queue. Other failures keep a bounded message without Japanese script.
      if (error instanceof UsageLimitError) {
        this.store.retry(job.fingerprint, 'Usage limit reached', true);
        this.pausedUntil = this.now() + this.usageDelay;
        this.usageDelay = Math.min(this.usageDelay * 2, MAX_USAGE_DELAY);
      } else if (job.attempts >= 3) {
        this.store.fail(job.fingerprint, exhaustedMessage(message));
      } else {
        this.store.retry(job.fingerprint, message);
      }
    } finally {
      this.busy = false;
    }
    return true;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      if (await this.runNext()) continue;
      try {
        await setTimeout(1000, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  }
}

/** Keep bounded failure details while removing source lines and Japanese text. */
export function errorMessage(error: unknown, lines: string[]) {
  if (!(error instanceof Error)) return 'Unknown analyzer error';
  let message = error.message;
  for (const line of lines) message = message.split(line).join('…');
  return message.replace(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/gu, '…').slice(0, 400);
}

function exhaustedMessage(lastError: string | null) {
  return `Analyzer failed after 3 attempts${lastError ? `: ${lastError}` : ''}`;
}
