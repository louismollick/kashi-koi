# Kashi server

Creates and serves song analyses (ADR 0003). One process runs the HTTP API and a worker that analyses one song at a time with `codex exec` on the owner's ChatGPT subscription. Analyses are keyed by a fingerprint of the lyrics and store no Japanese text: the worker rejects output containing Japanese script, and job lines are cleared when a job finishes.

Node 24, port 8787. Commands run from the repository root.

## Environment

| Variable | Default | |
| --- | --- | --- |
| `KASHI_ADMIN_TOKEN` | required | Bearer token for creating analyses |
| `KASHI_DATA_DIR` | `./data` (`/data` in Docker) | SQLite database |
| `KASHI_MODEL` | `gpt-6-luna` | Codex model |
| `KASHI_REASONING` | `medium` | `model_reasoning_effort` |
| `PORT` | `8787` | |
| `CODEX_HOME` | `~/.codex` (`/data/codex` in Docker) | Codex login |
| `NAVIDROME_URL`, `NAVIDROME_USER`, `NAVIDROME_PASSWORD` | | Backfill only |

## Local

```sh
npm ci
codex login
KASHI_ADMIN_TOKEN=dev npm start -w @kashi-koi/server
```

npm runs workspace scripts in `apps/server`, so the database lands in `apps/server/data`.

## Docker

`apps/server/compose.yaml` is the VPS example. Put the environment in `apps/server/.env`, then log in to Codex once. The login is saved in the `/data` volume.

```sh
cd apps/server
docker compose run --rm server codex login --device-auth
docker compose up -d
```

## API

- `GET /health`
- `GET /v1/analyses/:fingerprint`: public, no listing.
  - `202 {status: "queued" | "running"}` while a job is in progress, even when an older analysis exists
  - `202 {status: "failed", error}` when the last job failed, even when an older analysis exists
  - `200` the analysis
  - `404` otherwise
- `POST /v1/analyses` with `Authorization: Bearer $KASHI_ADMIN_TOKEN` and `{title, artist?, lines, force?}`. Returns `200` with the existing analysis, or queues a job and returns `202 {fingerprint, status}`. `force` re-analyses a song that already has one. If that fails, `GET` returns the failure until a forced retry succeeds. The previous analysis stays in the database but isn't served in the meantime.

`lines` are the song's lyric lines as `lyricLines` from `@kashi-koi/shared` returns them, so the fingerprint matches the app's.

## Backfill

Queues every synced Japanese song in the owner's Navidrome library that has no analysis, at low priority, then prints how many songs it queued, skipped or already had.

```sh
npm run backfill -w @kashi-koi/server
docker compose exec server node --import tsx apps/server/src/backfill.ts
```

## Eval

Runs the analyzer on the original lyrics in `apps/server/eval/` and prints each analysis next to its lines, with what to look for and any validation problems. It uses the real Codex login and spends subscription usage. Pass a fixture name to run only that one, or a path (containing `/`) to run any fixture file. Paths are relative to where you run the command.

```sh
npm run eval -w @kashi-koi/server
npm run eval -w @kashi-koi/server -- kaeru
npm run eval -w @kashi-koi/server -- ./my-song.json
docker compose exec server node --import tsx apps/server/src/eval.ts kaeru
```

A fixture is `{title, artist?, lines, checks?}`. `checks` is only printed in the report, never sent to the model.

## Codex

Each analysis runs `codex exec` in a fresh empty temp directory, with the prompt on stdin and a 5 minute timeout. Shell and web search are off and the sandbox is read-only. `--ignore-user-config`, `--ignore-rules`, `--disable apps` and `--disable plugins` keep the host's Codex config, MCP servers, exec rules, ChatGPT connectors and plugins out of analyses, while the login in `CODEX_HOME` still works. A global `AGENTS.md` in `CODEX_HOME` is still read, so a host eval can pick up personal instructions that the container won't.

Usage and rate limits pause the queue instead of failing the job.
