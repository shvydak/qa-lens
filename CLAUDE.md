# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install workspace dependencies
npm install

# Start both backend and frontend in dev mode
npm run dev

# Run tests (backend)
npm test

# Type-check all packages
npm run type-check

# Lint all packages
npm run lint

# Format all files
npm run format

# Build for production
npm run build

# Start production backend (after build)
npm start
```

**Linting:** Use root `npm run lint`; `packages/backend` has no standalone `lint` script.

**Git hooks (husky):** pre-commit runs format + lint + type-check; pre-push also runs tests.
Set `SKIP_PRECOMMIT=1` or `SKIP_PREPUSH=1` to bypass. Set `SKIP_TESTS=1` to skip tests on push.

## Testing

Backend tests: **vitest** + real in-memory SQLite (no DB mocks — real `better-sqlite3`).
Test files: `packages/backend/src/__tests__/`

**Helpers** (`src/__tests__/helpers/`):

- `createTestDb()` — fresh in-memory DB with schema applied
- `seedProject / seedRepo / seedTestSet` — fixture insertion
- `createTestApp()` — Express app without server/polling, for supertest route tests

**Pattern for mocking `getDb`** in service/route tests:

```ts
let testDb: Database.Database
vi.mock('../../db/index.js', () => ({getDb: () => testDb}))
beforeEach(() => {
  testDb = createTestDb()
})
```

Use `vi.hoisted(() => vi.fn())` for mocks referenced inside `vi.mock` factory functions.

Targeted backend tests: `cd packages/backend && npm test -- src/__tests__/routes/repositories.test.ts`.

Managed repo deletion tests: cover folder cleanup on repo/project delete, shared-path preservation, outside-`MANAGED_REPOS_PATH` guard, unknown repo `404`, and failed clone/setup cleanup.

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

**DB:** Schema is in `src/db/schema.sql` and applied idempotently on startup (`CREATE TABLE IF NOT EXISTS`). No migration runner — re-running schema is safe. `commit_ranges`, `regressions`, and `cross_impacts` columns are stored as JSON strings. `repositories` has `UNIQUE(project_id, local_path)` — use distinct `localPath` per repo when seeding tests.

**Managed GitHub repos:** Repositories can be `source_type='managed_clone'`; QA Lens clones GitHub repos into `MANAGED_REPOS_PATH` and must not touch user working directories.

**Managed clone lifecycle:** Repository creation is GitHub-only (`githubUrl` required); do not accept user `localPath`. Delete managed clone folders via `ManagedRepoStorage` only when no DB rows still reference the path, and only inside `MANAGED_REPOS_PATH`.

**Repository branches:** `repository_branches` is the analysis target layer; each branch has its own `status`, `is_active`, `last_fetched_at`, and `last_analyzed_commit_hash`.

**GitHub credentials:** `github_credentials` stores reusable project-level PATs; repository responses must expose only `hasAuthToken`/`githubCredentialId`, never token values.

**DB row mapping:** better-sqlite3 returns raw schema keys (`snake_case`); map rows to camelCase domain/API objects (e.g. `repoFromRow`) before using `Repository` types or service logic.

**IDs:** `src/utils/ulid.ts` — custom time-sortable ID generator, no external dependency.

**Route responses** always wrap in `{ data: T }` on success, `{ error: string }` on failure.

**Key constraint:** When `PATCH /api/test-sets/:id` receives `status: 'passed'`, it must call `markTestSetPassed()` (not a plain UPDATE) to advance `last_analyzed_commit_hash` on all linked repos. This is the mechanism that defines "what's new" for the next analysis.

**Analysis cursor:** `commit_ranges` is keyed by `repositoryBranchId` for new analyses; keep legacy `repoId` fallback only for old data. Passing or rewinding a test set updates `last_analyzed_commit_hash` independently for each tracked branch.

**Analysis contexts:** `analysis_contexts` represents a project branch-combination (`branch_signature`); active test sets are scoped by `projectId + analysis_context_id`, not just project.

**Analysis runs:** Each initial/update analysis inserts an `analysis_runs` row; AI-created tests store `analysis_run_id` so the UI can group tests by update while still sorting by priority.

**Read-only Git:** GitHub operations must remain read-only (`ls-remote`, `clone`, `fetch`, `log`, `diff`, `rev-parse`); never add `push`, `commit`, `merge`, `rebase`, `reset`, or remote delete flows.

**GitHub tokens:** PATs are stored locally for MVP and passed to Git-over-HTTPS via Basic auth (`x-access-token:<token>`); API responses expose only `hasAuthToken`, never the token.

**Branch sync:** `POST /api/repos/:repoId/sync-branches` marks tracked branches `active`/`missing` and returns untracked remote branches; old analysis history must remain even when a remote branch disappears.

**SQLite migrations:** For columns added via `ensureColumn()`, create dependent indexes after `ensureColumn()` in `runMigrations()`, not in the initial `schema.sql` exec.

**Managed repo storage:** Keep `packages/managed-repos/` ignored by git and ESLint; cloned customer repos are input data, not QA Lens source.

**Repo analysis cursor UI:** Repo list responses include `analysisCursor` (`none`/`active`/`baseline`); active projects count pending commits from `activeTestSet.commit_ranges[repoId].to`, not `last_analyzed_commit_hash`.

**Timestamps:** SQLite `datetime('now')` returns UTC without a timezone suffix; normalize API timestamps to ISO `Z` in mappers before frontend relative-time parsing.

**Active analysis updates:** If a project has an `active` test set, `AnalysisService.run()` analyzes from that test set's `commit_ranges[repo].to` to HEAD, appends AI tests to the same set, and expands `commit_ranges` instead of creating another active set.

**Test set deletion:** Plain `DELETE /api/test-sets/:id` removes history only; `?rewind=true` also recomputes each repo's cursor from the latest remaining `passed` test sets.

**TestSet DTO / `checklistCounts`:** `GET /api/projects/:id/test-sets` adds per-row aggregates via SQL subqueries on `tests`; `GET /api/test-sets/:id` derives counts from loaded tests; `PATCH` (and other `SELECT *` rows) uses `fetchChecklistCounts` in `routes/testSets.ts` when list-query aliases are absent.

**`Array#map` + DTO mappers:** If a mapper accepts an optional second argument, never `rows.map(toDto)` — `map` passes the index as that parameter. Use `(row) => toDto(row)`.

### Frontend

**Routing:** Three pages via React Router v6 — `/`, `/projects/:id`, `/test-sets/:id`.

**API calls:** All via `src/api/client.ts` → `apiFetch<T>()` which unwraps `{ data: T }` and throws on error.

**Polling:** `ProjectDetailPage` polls repo unanalyzed counts every 10s via `setInterval`. The analysis status endpoint (`GET /api/projects/:id/analyze/status`) is polled every 2s while a job is running; on completion the page navigates directly to the new test set.

**Analysis status** is held in local component state (`AnalysisStatus`), not in a global store. The backend tracks running jobs in memory; the frontend polls until `running: false`.

**Styling:** Tailwind only — no CSS modules or separate CSS files (except `index.css` for base/scrollbar styles). Design tokens: `gray-950` app background, `gray-900` cards, `indigo-500/600` accent, `emerald` for pass/passed, `red-400` for fail, `amber` for regressions.

**UI language:** English only.

**TypeScript (frontend):** the workspace `tsc` target does not include `Array.prototype.at` — use `arr[arr.length - 1]` (otherwise `npm run type-check` fails with TS2550).

**Repo refresh UI:** `RepoCard` ties the refresh icon spin to `syncingRepoId === repo.id` from `ProjectDetailPage` — wrap `POST /api/repos/:id/fetch` with `setSyncingRepoId`, not only `sync-branches`.

**Dark UI branch pickers:** prefer custom popover menus over native `<select>` for branch lists (see `RepoCard` active branch + remote “track branch” flows).

**Test sets list API:** `GET /api/projects/:id/test-sets` includes `analysisRunCount` / `latestAnalysisRunAt` from `analysis_runs` (`GROUP BY test_sets.id`), **`checklistCounts`** (execution progress on `tests`); UI may group history by `analysisContextId` / `branchSignature`. **`TestSetCard`** renders the segmented checklist bar; **`ProjectDetailPage`** passes **`executionUpdating`** when `analysisStatus.running && activeTestSet?.id === ts.id`.

## Environment

Key variables:

| Variable             | Default                   | Purpose                                                |
| -------------------- | ------------------------- | ------------------------------------------------------ |
| `PORT`               | `3001`                    | Backend port                                           |
| `DB_PATH`            | `packages/qa-lens.db`     | SQLite file location                                   |
| `MANAGED_REPOS_PATH` | `packages/managed-repos`  | Internal clone storage for GitHub-managed repositories |
| `CLIENT_ORIGIN`      | `http://localhost:5173`   | Allowed CORS origin for the backend                    |
| `VITE_API_URL`       | `http://localhost:3001`   | Frontend API base URL                                  |
| `AI_PROVIDERS`       | `claude,gemini,anthropic` | Provider order for waterfall                           |
| `ANTHROPIC_API_KEY`  | —                         | Required only if `anthropic` provider is used          |

The backend does not load `.env` files itself; provide backend env vars through the shell/process manager unless env loading is added. Vite env vars must be available to the frontend package when running `packages/frontend`.

For Claude CLI provider to work, `claude` must be installed and authenticated on the host machine. Same for `gemini` CLI.
