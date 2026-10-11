import { breakdownDraftSchema, breakdownSchema, validateBreakdown, type Breakdown } from '@kashi-koi/shared';
import type { BreakdownAnalyzer } from './analyzer/index.ts';
import type { Store } from './db/index.ts';

export class BreakdownBusyError extends Error {
  name = 'BreakdownBusyError';
}

// Two active + two waiting: at 2 attempts × 60s, a request waits <=120s and runs <=120s.
const MAX_WAITING = 2;

/** Share same-sentence requests and let at most two sentences use the runner at once. */
export function createBreakdownGenerator(store: Store, analyzer: BreakdownAnalyzer) {
  const pending = new Map<string, Promise<Breakdown | undefined>>();
  const waiting: (() => void)[] = [];
  let active = 0;

  async function generate(fingerprint: string, start: number) {
    if (active >= 2) {
      if (waiting.length >= MAX_WAITING) throw new BreakdownBusyError('Server busy');
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else active++;
    try {
      const source = store.getAnalysisSource(fingerprint);
      const sentence = source?.json.sentences.find((sentence) => sentence.start === start);
      if (!source || !sentence) return undefined;
      const cached = store.getBreakdown(fingerprint, start);
      if (cached) return cached;
      const job = store.getJob(fingerprint);
      const input = {
        title: job?.title ?? source.json.title,
        artist: job?.artist ?? undefined,
        lines: source.lines,
        translations: source.json.lines,
        about: source.json.about,
        start,
        end: sentence.end,
        translation: sentence.translation,
      };
      let feedback: string[] | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const output = await analyzer.breakdown({ ...input, feedback });
        feedback = validateBreakdown(
          output,
          source.lines.slice(start, sentence.end + 1).join('\n'),
          sentence.translation,
        );
        if (feedback.length) continue;
        // A forced analysis can finish while this prompt runs. Do not cache an obsolete explanation.
        if (JSON.stringify(store.getAnalysis(fingerprint)) !== JSON.stringify(source.json))
          throw new Error('Song analysis changed during breakdown generation');
        const breakdown = breakdownSchema.parse({
          ...breakdownDraftSchema.parse(output),
          fingerprint,
          start,
          model: analyzer.model,
          createdAt: new Date().toISOString(),
        });
        store.saveBreakdown(breakdown);
        return breakdown;
      }
      throw new Error(`Breakdown validation failed: ${feedback?.join('; ')}`);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }

  return (fingerprint: string, start: number) => {
    const key = `${fingerprint}:${start}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const work = generate(fingerprint, start).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}
