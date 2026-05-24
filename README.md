# QA Lens

QA Lens turns code changes into manual QA test plans. It connects to GitHub
repositories, watches selected branches for new commits, and asks an AI provider
to generate a prioritized, plain-English checklist of manual tests for what
changed — across multiple repositories at once.

## How it works

1. Create a **project** and add one or more **GitHub repositories** (cloned and
   managed internally by QA Lens — your working directories are never touched).
2. Pick the **branches** to track. QA Lens fetches them every 60 seconds.
3. Run an **analysis**: QA Lens gathers the diff since the last analyzed commit,
   sends it to an AI provider, and produces a **test set** — a checklist of
   manual tests grouped by priority, plus regression and cross-repo risks.
4. QA engineers work through the checklist, marking tests pass/fail/skip. Closing
   a review advances the "last analyzed" cursor so the next run only covers new
   commits.

## Architecture

npm workspaces monorepo:

- `packages/backend` — Node.js + Express + TypeScript + better-sqlite3
- `packages/frontend` — React + Vite + TypeScript + Tailwind CSS

The backend stores everything in a local SQLite file. AI analysis runs through a
provider waterfall: **Claude CLI → Gemini CLI → Cursor CLI → Anthropic API**
(order configurable). Git operations are read-only (`clone`, `fetch`, `log`,
`diff`, `ls-remote`, `rev-parse`) and run via `execFile` with a command
allowlist and HTTPS-only transport.

For deeper internals (data model, analysis cursor, migrations, conventions) see
[CLAUDE.md](CLAUDE.md).

## Prerequisites

- Node.js 20+
- For the default AI provider, an authenticated **Claude CLI** (`claude`) on the
  host. Gemini / Cursor CLIs or an `ANTHROPIC_API_KEY` work as alternatives.

## Setup

```bash
npm install
cp .env.example .env   # then edit values as needed
```

The backend does **not** auto-load `.env`; export the variables into the backend
process (e.g. via your shell or a process manager). See
[.env.example](.env.example) for all supported variables.

## Commands

```bash
npm run dev          # start backend (:3001) and frontend (:5173)
npm test             # backend test suite (vitest)
npm run type-check   # type-check all packages
npm run lint         # lint all packages
npm run format       # format with Prettier
npm run build        # production build
npm start            # start production backend (after build)
```

Backend runs on http://localhost:3001, frontend on http://localhost:5173. The
SQLite database is created at `packages/qa-lens.db` on first run.

## Testing

Backend tests use **vitest** with a real in-memory SQLite database (no DB
mocks). Frontend tests use **vitest** + React Testing Library. Run the whole
backend suite with `npm test`, or a single file:

```bash
cd packages/backend && npm test -- src/__tests__/routes/repositories.test.ts
cd packages/frontend && npm test
```

## Git hooks

Husky runs format + lint + type-check on pre-commit and additionally tests on
pre-push. Bypass with `SKIP_PRECOMMIT=1`, `SKIP_PREPUSH=1`, or `SKIP_TESTS=1`.
