import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type SongAnalysisDraft, songAnalysisDraftSchema } from '@kashi-koi/shared/analysis';
import { analyzeWithRetry } from './analyzer/attempts.ts';
import { type Analyzer, CodexAnalyzer, UsageLimitError } from './analyzer/index.ts';

/** An eval fixture: original lyrics plus what a reader should look for in the analysis. */
type Fixture = { title: string; artist?: string; lines: string[]; checks: string[] };

const evalDir = fileURLToPath(new URL('../eval/', import.meta.url));

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseFixture(value: unknown, file: string): Fixture {
  const fixture = value as Partial<Fixture> | null;
  const { title, artist, lines, checks = [] } = fixture ?? {};
  if (typeof title !== 'string' || !(artist === undefined || typeof artist === 'string') || !isStrings(lines))
    throw new Error(`${file} needs a title, lines and an optional artist`);
  return { title, artist, lines, checks: isStrings(checks) ? checks : [] };
}

/** Render one result for reading in a terminal. Malformed output is printed as raw JSON. */
function report(
  file: string,
  fixture: Fixture,
  output: unknown,
  errors: string[],
  seconds: number,
  advice: string[],
  dropped: string[],
) {
  const out = [`━━ ${basename(file)}  ${fixture.title}  ${seconds}s`, ''];
  const parsed = songAnalysisDraftSchema.safeParse(output);
  if (parsed.success) out.push(...analysisLines(fixture.lines, parsed.data));
  else out.push('Raw output', JSON.stringify(output, null, 2), '');

  if (advice.length) out.push('Advice from first attempt', ...advice.map((item) => `  ${item}`), '');
  if (dropped.length) out.push('Dropped quizzes on final attempt', ...dropped.map((item) => `  ${item}`), '');
  if (fixture.checks.length) out.push('Look for', ...fixture.checks.map((check) => `  ${check}`), '');
  out.push(errors.length ? 'Invalid' : 'Valid', ...errors.map((error) => `  ${error}`), '');
  return out.join('\n');
}

function analysisLines(lines: string[], analysis: SongAnalysisDraft) {
  const out = [`Title      ${analysis.title}`, `About      ${analysis.about}`, '', 'Sentences'];
  for (const sentence of analysis.sentences) {
    const range = sentence.start === sentence.end ? `${sentence.start}` : `${sentence.start}-${sentence.end}`;
    out.push(`  ${range}  ${sentence.translation}`);
    out.push(
      sentence.quiz
        ? `    ${sentence.quiz.phrase} | ${sentence.quiz.decoys.map((decoy) => `${decoy.phrase} (${decoy.reason})`).join(' | ')}`
        : '    No quiz',
    );
    for (let line = sentence.start; line <= sentence.end && line < lines.length; line++)
      out.push(`    ${String(line).padStart(2)}  ${lines[line]}`, `        ${analysis.lines[line] ?? '(missing)'}`);
    out.push('');
  }

  return out;
}

/** Prints each attempt's duration, and the feedback a retry starts from. */
function timed(analyzer: Analyzer): Analyzer {
  let attempt = 0;
  return {
    model: analyzer.model,
    async analyze(input) {
      if (input.feedback) console.log('First-attempt feedback', ...input.feedback.map((item) => `\n  ${item}`), '\n');
      const started = Date.now();
      try {
        return await analyzer.analyze(input);
      } finally {
        console.log(`Attempt ${++attempt}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    },
  };
}

/** A bare name such as `kaeru` is a fixture in eval/. A path is resolved from where npm or node was called. */
function fixturePath(arg: string) {
  if (!arg.includes('/')) return join(evalDir, arg.endsWith('.json') ? arg : `${arg}.json`);
  return resolve(process.env.INIT_CWD ?? process.cwd(), arg);
}

/** `npm run eval -w @kashi-koi/server [-- kaeru | path/to/fixture.json]`: every fixture in eval/, or one. */
async function main() {
  const arg = process.argv[2];
  const files = arg
    ? [fixturePath(arg)]
    : (await readdir(evalDir))
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => join(evalDir, name));
  const analyzer = new CodexAnalyzer();
  console.log(`Model ${analyzer.model}, ${files.length} fixture${files.length === 1 ? '' : 's'}\n`);

  let failures = 0;
  for (const file of files) {
    const fixture = parseFixture(JSON.parse(await readFile(file, 'utf8')), file);
    const started = Date.now();
    try {
      const { draft, errors, advice, dropped } = await analyzeWithRetry(timed(analyzer), fixture);
      if (errors.length) failures++;
      console.log(report(file, fixture, draft, errors, Math.round((Date.now() - started) / 1000), advice, dropped));
    } catch (error) {
      failures++;
      console.log(`━━ ${basename(file)}  ${fixture.title}\n\n${error instanceof Error ? error.message : error}\n`);
      if (error instanceof UsageLimitError) {
        console.log('Stopped: usage limit reached.');
        break;
      }
    }
  }
  console.log(failures ? `${failures} of ${files.length} failed` : `All ${files.length} valid`);
  if (failures) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Eval failed');
  process.exitCode = 1;
});
