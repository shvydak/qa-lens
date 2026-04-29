# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install workspace dependencies
npm install

# Start both backend and frontend in dev mode
npm run dev

# Type-check backend only
npx tsc -p packages/backend/tsconfig.json --noEmit

# Type-check frontend only
npx tsc -p packages/frontend/tsconfig.json --noEmit

# Build for production
npm run build

# Start production backend (after build)
npm start
```

There are currently no repo-level test or lint scripts.

Backend runs on `http://localhost:3001`, frontend on `http://localhost:5173`.  
The SQLite database file is created at `packages/qa-lens.db` on first run.

## Architecture

npm workspaces monorepo with two packages:

- `packages/backend` — Node.js + Express + TypeScript + better-sqlite3
- `packages/frontend` — React + Vite + TypeScript + Tailwind CSS

### Backend

**Entry:** `packages/backend/src/index.ts` — mounts all routers and starts `PollingService`.

**Request flow:** Express router → route handler (inline DB queries via `getDb()`) → service calls for business logic.

**Services:**
- `GitService.ts` — all git operations via `execFile` (never shell string interpolation). Uses `origin/<branch>` for remote HEAD, falls back to local HEAD.
- `AIService.ts` — provider waterfall: Claude CLI → Gemini CLI → Anthropic API. Order controlled by `AI_PROVIDERS` env var. Claude CLI is called with `--add-dir` for each repo path so the model can read files autonomously. Response is always parsed as JSON matching `AIAnalysisOutput`.
- `AnalysisService.ts` — orchestrates the full analysis cycle: gather diffs from all repos in parallel → call AI → persist `TestSet` + `Test` rows in a single transaction. Tracks in-flight jobs in a `Map<projectId, job>` (in-memory, resets on restart). `markTestSetPassed()` updates `last_analyzed_commit_hash` for every repo in the test set's `commit_ranges` in a single transaction.
- `PollingService.ts` — runs `git fetch` for every repo every 60s using `Promise.allSettled` (one failure doesn't block others).
- `prompts/analysis.ts` — the AI prompt template. Edit this to tune analysis quality without touching service logic.

**DB:** Schema is in `src/db/schema.sql` and applied idempotently on startup (`CREATE TABLE IF NOT EXISTS`). No migration runner — re-running schema is safe. `commit_ranges`, `regressions`, and `cross_impacts` columns are stored as JSON strings.

**DB row mapping:** better-sqlite3 returns raw schema keys (`snake_case`); map rows to camelCase domain/API objects (e.g. `repoFromRow`) before using `Repository` types or service logic.

**IDs:** `src/utils/ulid.ts` — custom time-sortable ID generator, no external dependency.

**Route responses** always wrap in `{ data: T }` on success, `{ error: string }` on failure.

**Key constraint:** When `PATCH /api/test-sets/:id` receives `status: 'passed'`, it must call `markTestSetPassed()` (not a plain UPDATE) to advance `last_analyzed_commit_hash` on all linked repos. This is the mechanism that defines "what's new" for the next analysis.

**Analysis cursor:** `commit_ranges` is per repository (`repoId -> { from, to }`); passing or rewinding a test set updates `last_analyzed_commit_hash` independently for each repo.

**Duplicate analysis guard:** `AnalysisService.run()` must reject an existing `active` test set with the same `commit_ranges` before calling AI, returning `active_test_set_exists:<id>`.

**Test set deletion:** Plain `DELETE /api/test-sets/:id` removes history only; `?rewind=true` also recomputes each repo's cursor from the latest remaining `passed` test sets.

### Frontend

**Routing:** Three pages via React Router v6 — `/`, `/projects/:id`, `/test-sets/:id`.

**API calls:** All via `src/api/client.ts` → `apiFetch<T>()` which unwraps `{ data: T }` and throws on error.

**Polling:** `ProjectDetailPage` polls repo unanalyzed counts every 10s via `setInterval`. The analysis status endpoint (`GET /api/projects/:id/analyze/status`) is polled every 2s while a job is running; on completion the page navigates directly to the new test set.

**Analysis status** is held in local component state (`AnalysisStatus`), not in a global store. The backend tracks running jobs in memory; the frontend polls until `running: false`.

**Styling:** Tailwind only — no CSS modules or separate CSS files (except `index.css` for base/scrollbar styles). Design tokens: `gray-950` app background, `gray-900` cards, `indigo-500/600` accent, `emerald` for pass/passed, `red-400` for fail, `amber` for regressions.

**UI language:** English only.

## Environment

Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Backend port |
| `DB_PATH` | `packages/qa-lens.db` | SQLite file location |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin for the backend |
| `VITE_API_URL` | `http://localhost:3001` | Frontend API base URL |
| `AI_PROVIDERS` | `claude,gemini,anthropic` | Provider order for waterfall |
| `ANTHROPIC_API_KEY` | — | Required only if `anthropic` provider is used |

The backend does not load `.env` files itself; provide backend env vars through the shell/process manager unless env loading is added. Vite env vars must be available to the frontend package when running `packages/frontend`.

For Claude CLI provider to work, `claude` must be installed and authenticated on the host machine. Same for `gemini` CLI.
