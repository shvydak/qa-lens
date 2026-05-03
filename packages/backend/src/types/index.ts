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
  githubToken: string | null
  githubCredentialId: string | null
  hasAuthToken?: boolean
  sourceType: 'local_path' | 'managed_clone'
  branch: string
  lastFetchedAt: string | null
  lastAnalyzedCommitHash: string | null
  branches?: RepositoryBranch[]
  activeBranch?: RepositoryBranch | null
  unanalyzedCount?: number
  analysisCursor?: 'active' | 'baseline' | 'none'
}

export interface GitHubCredential {
  id: string
  projectId: string
  name: string
  hasToken: boolean
  createdAt: string
}

export interface RepositoryBranch {
  id: string
  repositoryId: string
  name: string
  status: 'active' | 'missing' | 'archived'
  isActive: boolean
  lastFetchedAt: string | null
  lastAnalyzedCommitHash: string | null
}

export interface TestSet {
  id: string
  projectId: string
  analysisContextId: string | null
  branchSignature: string | null
  name: string
  status: 'active' | 'passed' | 'failed'
  commitRanges: Record<string, {from: string | null; to: string}>
  commitTargets?: TestSetCommitTarget[]
  aiSummary: string | null
  regressions: string[]
  crossImpacts: string[]
  createdAt: string
  completedAt: string | null
  analysisRuns?: AnalysisRun[]
}

export interface AnalysisRun {
  id: string
  testSetId: string
  label: string
  commitRanges: Record<string, {from: string | null; to: string}>
  aiSummary: string | null
  createdAt: string
}

export interface TestSetCommitTarget {
  id: string
  repositoryId: string
  repositoryPath: string
  branchName: string
  from: string | null
  to: string
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
  analysisRunId: string | null
  repositoryBranchId: string | null
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
  repositoryBranchId: string
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
