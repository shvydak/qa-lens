I'm a QA Engineer / SDET and I want to build a local web platform called **QA Diff Analyzer**.

## My context
- I work on multiple projects simultaneously
- Each project has multiple GitHub repositories (e.g. web frontend + api backend + mobile app)
- Developers push code without always updating Jira tickets properly
- I need to know WHAT to test after each commit — not just what files changed, but what functionality is affected and what regressions are possible
- I already have a working Playwright test dashboard (https://github.com/shvydak/yshvydak-test-dashboard) built with vibe coding — this new tool is separate

## The product idea

A local web platform where I manage QA analysis across projects.

### Core entities

**Projects**
- A project has a name (e.g. "Probuild") and contains multiple repositories
- Each repo has a configured branch to track

**Repository sync**
- Works like VSCode source control: runs git fetch in background, shows indicator when new commits are available that haven't been analyzed yet
- Manual "Pull" action to sync
- Shows "unanalyzed commits" — commits that arrived after the last successful Test Set

**Analysis Templates**
- Editable prompts/templates for the AI agent
- Each template is linked to specific repositories within a project
- Templates define what the agent should focus on (e.g. cross-repo impact: "api change affects web form and mobile app using same endpoint")

**AI Agent Analysis**
- On demand: user clicks "Analyze"
- Agent has access to git diff of all linked repos
- Agent understands cross-repo relationships (e.g. if api endpoint changes → check which web components and mobile screens use it)
- Project context: user can write a description of the project (architecture, critical areas, how repos relate) — this is the agent's CLAUDE.md equivalent
- Output: prioritized list of what to test, possible regressions, integration checks between repos

**Test Sets**
- Created from analysis output
- Auto-named by commit hashes + date, with option to rename
- Each test in the set has a status (pass / fail / skip / not tested)
- User can manually add tests to the set
- When all tests pass → mark set as successful
- Test sets are persisted and linked to specific commits

## Tech preferences
- Local-first (runs on my machine, no cloud deployment needed for MVP)
- Node.js backend
- Simple frontend (React or plain HTML — whatever makes sense for MVP)
- Uses Claude API (claude-sonnet-4-20250514) for the agent
- Git operations via simple shell commands (git fetch, git diff, git log)

## What I want to do in this session
Before writing any code — let's build a proper PRD (Product Requirements Document).

I want to discuss and finalize:
1. Full feature list with priorities (MVP vs later)
2. Data model (how Projects, Repos, Templates, TestSets are structured)
3. User flows for each main screen
4. Open questions and edge cases
5. Tech stack decisions

Please start by asking me clarifying questions if needed, then help me build the PRD iteratively.