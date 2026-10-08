import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { songAnalysisDraftJsonSchema } from '@kashi-koi/shared/analysis';
import { buildPrompt } from './prompt.ts';

export type AnalyzerInput = { title: string; artist?: string; lines: string[]; feedback?: string[] };

/** Produces an unvalidated song analysis draft. Callers check it with `validateAnalysis`. */
export type Analyzer = { model: string; analyze(input: AnalyzerInput): Promise<unknown> };

/** The subscription hit a usage or rate limit. Retry later rather than failing the job. */
export class UsageLimitError extends Error {
  name = 'UsageLimitError';
}

type CodexOptions = { model?: string; reasoning?: string; command?: string; timeoutMs?: number };

/**
 * Runs `codex exec` on the CODEX_HOME login, one process per analysis, in a fresh empty directory.
 * Error messages never include lyrics, since the worker stores them.
 */
export class CodexAnalyzer implements Analyzer {
  readonly model: string;
  private readonly reasoning: string;
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: CodexOptions = {}) {
    this.model = options.model ?? process.env.KASHI_MODEL ?? 'gpt-6-luna';
    this.reasoning = options.reasoning ?? process.env.KASHI_REASONING ?? 'medium';
    this.command = options.command ?? 'codex';
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000;
  }

  async analyze(input: AnalyzerInput): Promise<unknown> {
    const dir = await mkdtemp(join(tmpdir(), 'kashi-codex-'));
    try {
      const cwd = join(dir, 'work');
      const schemaPath = join(dir, 'schema.json');
      const outPath = join(dir, 'out.json');
      await mkdir(cwd);
      await writeFile(schemaPath, JSON.stringify(songAnalysisDraftJsonSchema));

      const run = await runProcess(
        this.command,
        this.args(schemaPath, outPath),
        cwd,
        buildPrompt(input),
        this.timeoutMs,
      );
      if (run.timedOut) throw new Error(`Codex timed out after ${this.timeoutMs / 1000}s`);
      if (run.code !== 0) throw codexFailure(run.stdout, run.stderr, `exit ${run.signal ?? run.code}`);

      const answer = await readFile(outPath, 'utf8').catch(() => '');
      if (!answer.trim()) throw codexFailure(run.stdout, run.stderr, 'no answer');
      try {
        return JSON.parse(answer);
      } catch {
        throw new Error('Codex answer was not valid JSON');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private args(schemaPath: string, outPath: string) {
    return [
      'exec',
      '-',
      '--json',
      '--output-schema',
      schemaPath,
      '-o',
      outPath,
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      // Host config, MCP servers, exec rules and ChatGPT connectors stay out of analyses.
      '--ignore-user-config',
      '--ignore-rules',
      '--disable',
      'apps',
      '--disable',
      'plugins',
      '-m',
      this.model,
      '-c',
      `model_reasoning_effort=${JSON.stringify(this.reasoning)}`,
      '-c',
      'features.shell_tool=false',
      '-c',
      'web_search="disabled"',
    ];
  }
}

const usageLimit = /usage[ _]limit|rate[ _]limit|too many requests|\b429\b|quota/i;
const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/gu;

/** Classify a failed run from its JSONL events (`turn.failed`, `error`), falling back to stderr. */
export function codexFailure(stdout: string, stderr: string, reason: string): Error {
  const messages = eventMessages(stdout);
  const stderrLine = stderr.trim().split('\n').at(-1)?.trim();
  if (stderrLine) messages.push(stderrLine);
  const message = (messages[0] ?? 'no error message').replace(japanese, '…').slice(0, 300);
  if (messages.some((text) => usageLimit.test(text))) return new UsageLimitError(message);
  return new Error(`Codex failed (${reason}): ${message}`);
}

/** Failure messages, the turn's own failure first, then the last stream error. */
function eventMessages(stdout: string) {
  const failed: string[] = [];
  const errors: string[] = [];
  for (const line of stdout.split('\n')) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(event)) continue;
    if (event.type === 'turn.failed' && isRecord(event.error) && typeof event.error.message === 'string')
      failed.push(event.error.message);
    if (event.type === 'error' && typeof event.message === 'string') errors.push(event.message);
  }
  return [...failed, ...errors.reverse()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type Run = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean };

/** Spawn without a shell, write the prompt to stdin and kill the process at the timeout. */
function runProcess(command: string, args: string[], cwd: string, stdin: string, timeoutMs: number) {
  return new Promise<Run>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    // A process that exits before reading stdin reports its own failure on close.
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Codex: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
    child.stdin.end(stdin);
  });
}
