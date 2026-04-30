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
  hasAuthToken: boolean
  sourceType: 'local_path' | 'managed_clone'
  branch: string
  lastFetchedAt: string | null
  lastAnalyzedCommitHash: string | null
  branches: RepositoryBranch[]
  activeBranch: RepositoryBranch | null
  unanalyzedCount?: number
  analysisCursor?: 'active' | 'baseline' | 'none'
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

export interface RemoteBranch {
  name: string
  commitHash: string
}

export interface TestSet {
  id: string
  projectId: string
  name: string
  status: 'active' | 'passed' | 'failed'
  commitRanges: Record<string, {from: string | null; to: string}>
  commitTargets?: TestSetCommitTarget[]
  aiSummary: string | null
  regressions: string[]
  crossImpacts: string[]
  createdAt: string
  completedAt: string | null
  tests?: Test[]
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
  status: 'not_tested' | 'pass' | 'fail' | 'skip'
  source: 'ai' | 'manual'
  sortOrder: number
}

export interface AnalysisStatus {
  running: boolean
  testSetId: string | null
  error: string | null
}
