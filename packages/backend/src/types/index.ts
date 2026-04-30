export interface Project {
  id: string
  name: string
  description: string
  createdAt: string
}

export interface Repository {
  id: string
  projectId: string
  localPath: string
  githubUrl: string | null
  branch: string
  lastFetchedAt: string | null
  lastAnalyzedCommitHash: string | null
  unanalyzedCount?: number
  analysisCursor?: 'active' | 'baseline' | 'none'
}

export interface TestSet {
  id: string
  projectId: string
  name: string
  status: 'active' | 'passed' | 'failed'
  commitRanges: Record<string, {from: string | null; to: string}>
  aiSummary: string | null
  regressions: string[]
  crossImpacts: string[]
  createdAt: string
  completedAt: string | null
}

export interface Test {
  id: string
  testSetId: string
  description: string
  title: string | null
  priority: 'high' | 'medium' | 'low'
  area: string | null
  userScenario: string | null
  preconditions: string[]
  steps: string[]
  expectedResult: string | null
  risk: string | null
  technicalContext: string | null
  status: 'not_tested' | 'pass' | 'fail' | 'skip'
  source: 'ai' | 'manual'
  sortOrder: number
}

export interface CommitInfo {
  hash: string
  shortHash: string
  author: string
  date: string
  message: string
}

export interface DiffResult {
  repoId: string
  repoPath: string
  branch: string
  commits: CommitInfo[]
  diff: string
  filesChanged: string[]
  stats: string
  fromHash: string | null
  toHash: string
}

export interface AIAnalysisOutput {
  summary: string
  tests: Array<{
    title: string
    priority: 'high' | 'medium' | 'low'
    area: string
    user_scenario: string
    preconditions: string[]
    steps: string[]
    expected_result: string
    risk: string
    technical_context?: string
  }>
  regressions: string[]
  cross_repo_impacts: string[]
}

export interface AnalysisJob {
  projectId: string
  repoIds: string[]
  startedAt: string
}
