import type {DiffResult} from '../../types/index.js'

interface PromptInput {
  projectName: string
  projectDescription: string
  repos: DiffResult[]
}

export function buildAnalysisPrompt(input: PromptInput): string {
  const repoSections = input.repos
    .map((r) => {
      const commitList = r.commits
        .slice(0, 20)
        .map((c) => `  ${c.shortHash} ${c.date.slice(0, 10)} ${c.author}: ${c.message}`)
        .join('\n')

      return `
### Repository: ${r.repoPath} (branch: ${r.branch})

**Commits analyzed:**
${commitList || '  (no new commits)'}

**Files changed:**
${r.filesChanged.slice(0, 50).join('\n') || '  (none)'}

**Diff stats:**
${r.stats || '  (none)'}

**Diff:**
\`\`\`
${r.diff || '(empty)'}
\`\`\`
`
    })
    .join('\n---\n')

  return `You are a senior QA lead creating a manual QA test plan from code changes.

## Project: ${input.projectName}

## Project Architecture & Context:
${input.projectDescription || 'No additional context provided.'}

## Code Changes to Analyze:
${repoSections}

## Your Task:
Analyze all changes across ALL repositories simultaneously. Focus on:
1. What user-facing functionality is affected and needs manual testing
2. Possible regressions (things that worked before and might break)
3. Cross-repository impacts (e.g., backend change → check the related frontend flow)
4. Integration points between services

You have access to the repository files via the --add-dir tool. Use it to:
- Read surrounding code to understand the context of changes
- Check if changed API endpoints are used in other repos
- Look at related test files to understand expected behavior
- Trace data flow across services

## Audience:
The output is for manual QA engineers. They do not read code and may not know technical terms.

Use Simple English:
- Use short sentences.
- Use common words.
- Avoid idioms.
- Avoid function names, variable names, cache keys, database names, API paths, and framework terms in QA-facing text.
- If a technical detail is important, put it only in "technical_context".
- Write tests as steps a QA engineer can run in the product.
- Do not ask QA to inspect code, logs, database rows, cache internals, or network payloads unless there is no user-facing way to test the risk.

Output ONLY valid JSON matching this exact schema:
{
  "summary": "<3-5 short Simple English sentences about what changed and what QA should test first>",
  "tests": [
    {
      "title": "<short manual QA test title in Simple English>",
      "priority": "high|medium|low",
      "area": "<product area, e.g. 'Login', 'Checkout', 'Reports'>",
      "user_scenario": "<one short sentence describing the user workflow>",
      "preconditions": ["<setup needed before the test, or empty array>"],
      "steps": ["<manual step 1>", "<manual step 2>", "<manual step 3>"],
      "expected_result": "<clear pass condition written for manual QA>",
      "risk": "<what may break for the user if this fails>",
      "technical_context": "<optional short note for QA leads or developers; use only when useful>"
    }
  ],
  "regressions": ["<Simple English user-facing regression risk>"],
  "cross_repo_impacts": ["<Simple English integration concern that QA can validate in the product>"]
}

Rules:
- tests array: 5-20 items, sorted by priority (high first)
- Every test must have 3-8 manual steps.
- Every test must have a clear expected_result.
- Treat Project Architecture & Context as the source of truth for product scope.
- Do not create tests for clients, platforms, apps, or workflows that are marked out of scope in Project Architecture & Context.
- If a shared backend change affects both in-scope and out-of-scope clients, write tests only for the in-scope client and mention the shared risk in technical_context only when useful.
- Prefer user workflows over implementation details.
- Good: "Create an order with a discount and check the total price."
- Bad: "Test POST /api/orders with discount_code field."
- regressions: focus on things that WORKED BEFORE but could break
- cross_repo_impacts: only include if you found actual shared code/endpoints between repos
- Output ONLY the JSON object, no markdown, no explanation`
}
