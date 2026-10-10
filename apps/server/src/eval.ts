import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analysisAdvice,
  dropInvalidQuizzes,
  validateQuizzes,
  type SongAnalysisDraft,
  songAnalysisDraftSchema,
} from '@kashi-koi/shared/analysis';
import { CodexAnalyzer, UsageLimitError } from './analyzer/index.ts';
import { validateDraft } from './analyzer/validate.ts';

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
      let output: unknown;
      let feedback: string[] | undefined;
      let advice: string[] = [];
      let dropped: string[] = [];
      let errors: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const attemptStarted = Date.now();
        const raw = await analyzer.analyze({
          title: fixture.title,
          artist: fixture.artist,
          lines: fixture.lines,
          feedback,
        });
        console.log(`Attempt ${attempt + 1}: ${((Date.now() - attemptStarted) / 1000).toFixed(1)}s`);
        if (attempt === 0) advice = analysisAdvice(raw);
        else dropped = validateQuizzes(raw, fixture.lines);
        output = attempt === 0 ? raw : dropInvalidQuizzes(raw, fixture.lines);
        errors = validateDraft(output, fixture.lines.length, fixture.lines);
        if (!errors.length && (attempt !== 0 || !advice.length)) break;
        if (attempt !== 0) break;
        feedback = [...errors, ...advice];
        console.log('First-attempt feedback', ...feedback.map((item) => `\n  ${item}`), '\n');
      }
      if (errors.length) failures++;
      console.log(report(file, fixture, output, errors, Math.round((Date.now() - started) / 1000), advice, dropped));
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
