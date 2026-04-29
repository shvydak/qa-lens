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
  tests?: Test[]
}

export interface Test {
  id: string
  testSetId: string
  description: string
  priority: 'high' | 'medium' | 'low'
  area: string | null
  status: 'not_tested' | 'pass' | 'fail' | 'skip'
  source: 'ai' | 'manual'
  sortOrder: number
}

export interface AnalysisStatus {
  running: boolean
  testSetId: string | null
  error: string | null
}
