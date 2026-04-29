import {describe, it, expect, vi, beforeEach} from 'vitest'
import type Database from 'better-sqlite3'
import {createTestDb, seedProject, seedRepo, seedTestSet} from '../helpers/db.js'

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

const mockGetHeadHash = vi.hoisted(() => vi.fn<() => Promise<string>>())
const mockGetDiff = vi.hoisted(() => vi.fn())
const mockAnalyze = vi.hoisted(() => vi.fn())

vi.mock('../../services/GitService.js', () => ({
  getHeadHash: mockGetHeadHash,
  getDiff: mockGetDiff,
}))

vi.mock('../../services/AIService.js', () => ({
  analyze: mockAnalyze,
}))

import {
  run,
  markTestSetPassed,
  deleteTestSet,
  getRunningJob,
  NoNewCommitsError,
  ActiveTestSetExistsError,
} from '../../services/AnalysisService.js'
import type {AnalysisJob, DiffResult, AIAnalysisOutput} from '../../types/index.js'

const fakeDiff = (repoId: string, from: string | null = null, to = 'head-hash'): DiffResult => ({
  repoId,
  repoPath: '/fake/path',
  branch: 'main',
  commits: [
    {
      hash: to,
      shortHash: to.slice(0, 7),
      author: 'Dev',
      date: '2024-01-01',
      message: 'fix: something',
    },
  ],
  diff: 'diff --git a/file.ts b/file.ts\n...',
  filesChanged: ['file.ts'],
  stats: '1 file changed',
  fromHash: from,
  toHash: to,
})

const fakeAiOutput = (): AIAnalysisOutput => ({
  summary: 'Some changes were made.',
  tests: [{title: 'Auth flow works', priority: 'high', area: 'auth'}],
  regressions: [],
  cross_repo_impacts: [],
})

const makeJob = (projectId: string, repoIds: string[] = []): AnalysisJob => ({
  projectId,
  repoIds,
  startedAt: new Date().toISOString(),
})

beforeEach(() => {
  testDb = createTestDb()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// markTestSetPassed
// ---------------------------------------------------------------------------

describe('markTestSetPassed', () => {
  it('sets status to passed and advances last_analyzed_commit_hash for each repo', () => {
    const projectId = seedProject(testDb)
    const repoId1 = seedRepo(testDb, projectId, {id: 'repo-1', localPath: '/path/repo1'})
    const repoId2 = seedRepo(testDb, projectId, {id: 'repo-2', localPath: '/path/repo2'})
    const testSetId = seedTestSet(testDb, projectId, {
      commitRanges: {
        'repo-1': {from: 'old-hash', to: 'new-hash-1'},
        'repo-2': {from: null, to: 'new-hash-2'},
      },
    })

    markTestSetPassed(testSetId)

    const ts = testDb.prepare('SELECT status FROM test_sets WHERE id = ?').get(testSetId) as {
      status: string
    }
    expect(ts.status).toBe('passed')

    const r1 = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId1) as {last_analyzed_commit_hash: string}
    expect(r1.last_analyzed_commit_hash).toBe('new-hash-1')

    const r2 = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId2) as {last_analyzed_commit_hash: string}
    expect(r2.last_analyzed_commit_hash).toBe('new-hash-2')
  })

  it('throws when test set does not exist', () => {
    expect(() => markTestSetPassed('nonexistent')).toThrow('Test set not found')
  })
})

// ---------------------------------------------------------------------------
// deleteTestSet
// ---------------------------------------------------------------------------

describe('deleteTestSet', () => {
  it('removes the test set from DB', () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId)
    const testSetId = seedTestSet(testDb, projectId)

    deleteTestSet(testSetId)

    const ts = testDb.prepare('SELECT id FROM test_sets WHERE id = ?').get(testSetId)
    expect(ts).toBeUndefined()
  })

  it('throws when test set does not exist', () => {
    expect(() => deleteTestSet('nonexistent')).toThrow('Test set not found')
  })

  it('without rewind leaves repo cursor unchanged', () => {
    const projectId = seedProject(testDb)
    const repoId = seedRepo(testDb, projectId, {lastAnalyzedCommitHash: 'current-hash'})
    const testSetId = seedTestSet(testDb, projectId, {
      status: 'passed',
      commitRanges: {'repo-1': {from: null, to: 'current-hash'}},
    })

    deleteTestSet(testSetId)

    const repo = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId) as {last_analyzed_commit_hash: string}
    expect(repo.last_analyzed_commit_hash).toBe('current-hash')
  })

  it('with rewind recomputes cursor from remaining passed test sets', () => {
    const projectId = seedProject(testDb)
    const repoId = seedRepo(testDb, projectId, {id: 'repo-1'})

    // Older passed test set: hash1
    seedTestSet(testDb, projectId, {
      id: 'ts-old',
      status: 'passed',
      commitRanges: {'repo-1': {from: null, to: 'hash1'}},
    })

    // Newer passed test set: hash2 — this will be deleted
    const newerId = seedTestSet(testDb, projectId, {
      id: 'ts-new',
      status: 'passed',
      commitRanges: {'repo-1': {from: 'hash1', to: 'hash2'}},
    })

    // Set cursor to latest state
    testDb
      .prepare('UPDATE repositories SET last_analyzed_commit_hash = ? WHERE id = ?')
      .run('hash2', repoId)

    deleteTestSet(newerId, {rewind: true})

    const repo = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId) as {last_analyzed_commit_hash: string | null}
    expect(repo.last_analyzed_commit_hash).toBe('hash1')
  })

  it('with rewind sets cursor to null when no passed test sets remain', () => {
    const projectId = seedProject(testDb)
    const repoId = seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'some-hash'})

    const testSetId = seedTestSet(testDb, projectId, {
      status: 'passed',
      commitRanges: {'repo-1': {from: null, to: 'some-hash'}},
    })

    deleteTestSet(testSetId, {rewind: true})

    const repo = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId) as {last_analyzed_commit_hash: string | null}
    expect(repo.last_analyzed_commit_hash).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getRunningJob
// ---------------------------------------------------------------------------

describe('getRunningJob', () => {
  it('returns null when no job is running', () => {
    expect(getRunningJob('any-project')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

describe('run', () => {
  it('throws when project does not exist', async () => {
    await expect(run(makeJob('nonexistent'))).rejects.toThrow('Project not found')
  })

  it('throws when project has no repositories', async () => {
    const projectId = seedProject(testDb)
    await expect(run(makeJob(projectId))).rejects.toThrow('No repositories configured')
  })

  it('throws NoNewCommitsError when there are no diffs', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})

    mockGetHeadHash.mockResolvedValue('head-hash')
    mockGetDiff.mockResolvedValue({
      repoId: 'repo-1',
      repoPath: '/fake/path',
      branch: 'main',
      commits: [],
      diff: '',
      filesChanged: [],
      stats: '',
      fromHash: null,
      toHash: 'head-hash',
    } satisfies DiffResult)

    await expect(run(makeJob(projectId))).rejects.toThrow(NoNewCommitsError)
  })

  it('throws ActiveTestSetExistsError when same commit ranges already active', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})

    mockGetHeadHash.mockResolvedValue('head-hash')
    mockGetDiff.mockResolvedValue(fakeDiff('repo-1', null, 'head-hash'))

    // Pre-existing active test set with same ranges
    seedTestSet(testDb, projectId, {
      id: 'existing-ts',
      status: 'active',
      commitRanges: {'repo-1': {from: null, to: 'head-hash'}},
    })

    const err = await run(makeJob(projectId)).catch((e) => e)
    expect(err).toBeInstanceOf(ActiveTestSetExistsError)
    expect((err as ActiveTestSetExistsError).testSetId).toBe('existing-ts')
  })

  it('creates test set and tests on successful analysis', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})

    mockGetHeadHash.mockResolvedValue('head-hash')
    mockGetDiff.mockResolvedValue(fakeDiff('repo-1', null, 'head-hash'))
    mockAnalyze.mockResolvedValue(fakeAiOutput())

    const {testSetId} = await run(makeJob(projectId))

    const ts = testDb.prepare('SELECT * FROM test_sets WHERE id = ?').get(testSetId) as
      | {status: string; commit_ranges: string}
      | undefined
    expect(ts).toBeDefined()
    expect(ts!.status).toBe('active')
    expect(JSON.parse(ts!.commit_ranges)).toMatchObject({'repo-1': {to: 'head-hash'}})

    const tests = testDb.prepare('SELECT * FROM tests WHERE test_set_id = ?').all(testSetId)
    expect(tests).toHaveLength(1)
  })

  it('prevents concurrent runs for the same project', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})

    mockGetHeadHash.mockResolvedValue('head-hash')
    // Make getDiff hang until we resolve manually
    let resolveDiff!: (v: DiffResult) => void
    const diffPromise = new Promise<DiffResult>((resolve) => {
      resolveDiff = resolve
    })
    mockGetDiff.mockReturnValue(diffPromise)

    // Start first run (will hang)
    const firstRun = run(makeJob(projectId))

    // Second run should throw immediately
    await expect(run(makeJob(projectId))).rejects.toThrow('Analysis already running')

    // Clean up the hanging first run
    resolveDiff(fakeDiff('repo-1'))
    mockAnalyze.mockResolvedValue(fakeAiOutput())
    await firstRun.catch(() => {})
  })

  it('does not treat active test sets with different ranges as duplicates', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'old-hash'})

    mockGetHeadHash.mockResolvedValue('new-head')
    mockGetDiff.mockResolvedValue(fakeDiff('repo-1', 'old-hash', 'new-head'))
    mockAnalyze.mockResolvedValue(fakeAiOutput())

    // Active test set with DIFFERENT ranges
    seedTestSet(testDb, projectId, {
      status: 'active',
      commitRanges: {'repo-1': {from: null, to: 'old-hash'}},
    })

    // Should succeed — ranges differ
    const {testSetId} = await run(makeJob(projectId))
    expect(testSetId).toBeDefined()
  })
})
