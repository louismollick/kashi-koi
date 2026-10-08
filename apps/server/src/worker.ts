import { setTimeout } from 'node:timers/promises';
import { songAnalysisDraftSchema, songAnalysisSchema } from '@kashi-koi/shared';
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
        const errors = validateDraft(output, job.lines.length);
        if (errors.length) {
          if (attempt === 0) {
            feedback = errors;
            continue;
          }
          this.store.fail(job.fingerprint, 'Analysis validation failed');
          return true;
        }
        const analysis = songAnalysisSchema.parse({
          ...songAnalysisDraftSchema.parse(output),
          schemaVersion: 1,
          fingerprint: job.fingerprint,
          model: this.analyzer.model,
          createdAt: new Date(this.now()).toISOString(),
        });
        this.store.complete(analysis);
        this.usageDelay = MIN_USAGE_DELAY;
        return true;
      }
    } catch (error) {
      // Usage limits pause the queue. Other failures keep a bounded message without Japanese script.
      if (error instanceof UsageLimitError) {
        this.store.retry(job.fingerprint, 'Usage limit reached', true);
        this.pausedUntil = this.now() + this.usageDelay;
        this.usageDelay = Math.min(this.usageDelay * 2, MAX_USAGE_DELAY);
      } else if (job.attempts >= 3) {
        this.store.fail(job.fingerprint, exhaustedMessage(errorMessage(error)));
      } else {
        this.store.retry(job.fingerprint, errorMessage(error));
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

/** Preserve the last process failure across retries and boot recovery without storing Japanese text. */
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/gu, '…').slice(0, 400)
    : 'Unknown analyzer error';
}

function exhaustedMessage(lastError: string | null) {
  return `Analyzer failed after 3 attempts${lastError ? `: ${lastError}` : ''}`;
}
