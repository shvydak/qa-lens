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

  return `You are a senior QA engineer analyzing code changes across multiple repositories.

## Project: ${input.projectName}

## Project Architecture & Context:
${input.projectDescription || 'No additional context provided.'}

## Code Changes to Analyze:
${repoSections}

## Your Task:
Analyze all changes across ALL repositories simultaneously. Focus on:
1. What functionality is affected and needs testing
2. Possible regressions (things that worked before and might break)
3. Cross-repository impacts (e.g., API endpoint changed → check frontend form + mobile screen)
4. Integration points between services

You have access to the repository files via the --add-dir tool. Use it to:
- Read surrounding code to understand the context of changes
- Check if changed API endpoints are used in other repos
- Look at related test files to understand expected behavior
- Trace data flow across services

Output ONLY valid JSON matching this exact schema:
{
  "summary": "<3-5 sentence overview of what changed and key testing priorities>",
  "tests": [
    {
      "title": "<specific actionable test case>",
      "priority": "high|medium|low",
      "area": "<feature area, e.g. 'Auth', 'Checkout', 'Mobile API'>"
    }
  ],
  "regressions": ["<specific regression risk>"],
  "cross_repo_impacts": ["<specific cross-repo integration concern>"]
}

Rules:
- tests array: 5-20 items, sorted by priority (high first)
- Be specific: "Test POST /api/orders with discount_code field" not "Test orders API"
- regressions: focus on things that WORKED BEFORE but could break
- cross_repo_impacts: only include if you found actual shared code/endpoints between repos
- Output ONLY the JSON object, no markdown, no explanation`
}
