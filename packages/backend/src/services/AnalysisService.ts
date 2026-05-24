import {getDb} from '../db/index.js'
import {repoBranchFromRow, repoFromRow} from '../db/mappers.js'
import * as GitService from './GitService.js'
import * as AIService from './AIService.js'
import type {AIAnalysisOutput, AnalysisJob, Repository, RepositoryBranch} from '../types/index.js'
import {ulid} from '../utils/ulid.js'
import {parseStringArray} from '../utils/json.js'
import {
  appendSummary,
  buildTestSetName,
  mergeStringArrays,
  normalizeResolutionNote,
} from './analysis/helpers.js'

export class NoNewCommitsError extends Error {
  constructor() {
    super('No new commits to analyze')
  }
}

const runningJobs = new Map<string, AnalysisJob>()

type CommitRanges = Record<string, {from: string | null; to: string}>

interface ActiveTestSetRow {
  id: string
  name: string
  analysis_context_id: string | null
  commit_ranges: string
  ai_summary: string | null
  regressions: string | null
  cross_impacts: string | null
  is_empty_review: number
}

export function getRunningJob(projectId: string): AnalysisJob | null {
  return runningJobs.get(projectId) ?? null
}

export interface AnalysisResult {
  testSetId: string
  addedTests: number
  totalTests: number
  isEmptyReview: boolean
}

export async function run(job: AnalysisJob): Promise<AnalysisResult> {
  if (runningJobs.has(job.projectId)) {
    throw new Error('Analysis already running for this project')
  }

  runningJobs.set(job.projectId, job)

  try {
    return await _run(job)
  } finally {
    runningJobs.delete(job.projectId)
  }
}

async function _run(job: AnalysisJob): Promise<AnalysisResult> {
  const db = getDb()

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(job.projectId) as
    | {id: string; name: string; description: string}
    | undefined

  if (!project) throw new Error('Project not found')

  const repoRows =
    job.repoIds.length > 0
      ? db
          .prepare(
            `SELECT * FROM repositories WHERE id IN (${job.repoIds.map(() => '?').join(',')})`
          )
          .all(...job.repoIds)
      : db.prepare('SELECT * FROM repositories WHERE project_id = ?').all(job.projectId)
  const repos = repoRows.map(repoFromRow)
  const repoTargets = repos.map((repo) => ({
    repo,
    branch: getActiveBranch(repo),
  }))

  if (repos.length === 0) throw new Error('No repositories configured for this project')
  if (repoTargets.some((target) => !target.branch)) {
    throw new Error('Every repository needs an active branch before analysis can run')
  }
  const context = getOrCreateAnalysisContext(
    job.projectId,
    repoTargets.map(({branch}) => branch!)
  )

  const activeTestSet =
    (db
      .prepare(
        `
        SELECT id, name, analysis_context_id, commit_ranges, ai_summary, regressions, cross_impacts, is_empty_review
        FROM test_sets
        WHERE project_id = ? AND analysis_context_id = ? AND status = 'active'
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `
      )
      .get(job.projectId, context.id) as ActiveTestSetRow | undefined) ??
    (db
      .prepare(
        `
        SELECT id, name, analysis_context_id, commit_ranges, ai_summary, regressions, cross_impacts, is_empty_review
        FROM test_sets
        WHERE project_id = ? AND analysis_context_id IS NULL AND status = 'active'
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `
      )
      .get(job.projectId) as ActiveTestSetRow | undefined)
  const activeCommitRanges = activeTestSet
    ? (JSON.parse(activeTestSet.commit_ranges) as CommitRanges)
    : null

  const diffs = await Promise.all(
    repoTargets.map(async ({repo, branch}) => {
      const activeBranch = branch!
      if (repo.sourceType === 'managed_clone') {
        await GitService.fetchOrigin(repo.localPath, activeBranch.name, repo.githubToken)
        await GitService.checkoutBranch(repo.localPath, activeBranch.name)
      }
      const headHash = await GitService.getHeadHash(repo.localPath, activeBranch.name)
      const fromHash =
        activeCommitRanges?.[activeBranch.id]?.to ??
        activeCommitRanges?.[repo.id]?.to ??
        activeBranch.lastAnalyzedCommitHash ??
        repo.lastAnalyzedCommitHash
      return GitService.getDiff(
        repo.id,
        activeBranch.id,
        repo.localPath,
        activeBranch.name,
        fromHash,
        headHash
      )
    })
  )

  const hasChanges = diffs.some((d) => d.commits.length > 0 || d.filesChanged.length > 0)
  if (!hasChanges) throw new NoNewCommitsError()

  const commitRanges: CommitRanges = activeCommitRanges ? {...activeCommitRanges} : {}
  for (const diff of diffs) {
    const existingRange = commitRanges[diff.repositoryBranchId]
    commitRanges[diff.repositoryBranchId] = {
      from: existingRange ? existingRange.from : diff.fromHash,
      to: diff.toHash,
    }
  }

  const aiOutput = await AIService.analyze({
    projectName: project.name,
    projectDescription: project.description,
    repos: diffs,
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  const name = buildTestSetName(
    diffs.flatMap((d) => d.commits),
    dateStr
  )

  const testSetId = ulid()
  const analysisRunId = ulid()
  const analysisRunLabel = activeTestSet ? `Update ${dateStr}` : `Initial analysis ${dateStr}`
  const singleRepositoryBranchId = diffs.length === 1 ? diffs[0].repositoryBranchId : null

  const addedTests = aiOutput.tests.length

  if (activeTestSet) {
    const previousCount = (
      db.prepare('SELECT COUNT(*) AS c FROM tests WHERE test_set_id = ?').get(activeTestSet.id) as {
        c: number
      }
    ).c
    const nextSortOrder = (
      db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tests WHERE test_set_id = ?'
        )
        .get(activeTestSet.id) as {next: number}
    ).next

    db.transaction(() => {
      db.prepare(
        `
        UPDATE test_sets
        SET commit_ranges = ?,
            analysis_context_id = ?,
            ai_summary = ?,
            regressions = ?,
            cross_impacts = ?
        WHERE id = ?
      `
      ).run(
        JSON.stringify(commitRanges),
        context.id,
        appendSummary(activeTestSet.ai_summary, aiOutput.summary),
        JSON.stringify(
          mergeStringArrays(parseStringArray(activeTestSet.regressions), aiOutput.regressions)
        ),
        JSON.stringify(
          mergeStringArrays(
            parseStringArray(activeTestSet.cross_impacts),
            aiOutput.cross_repo_impacts
          )
        ),
        activeTestSet.id
      )

      insertAnalysisRun(
        analysisRunId,
        activeTestSet.id,
        analysisRunLabel,
        commitRanges,
        aiOutput.summary
      )
      if (addedTests > 0) {
        insertAiTests(
          activeTestSet.id,
          aiOutput.tests,
          nextSortOrder,
          analysisRunId,
          singleRepositoryBranchId
        )
      }
    })()

    const totalTests = previousCount + addedTests
    return {
      testSetId: activeTestSet.id,
      addedTests,
      totalTests,
      isEmptyReview: activeTestSet.is_empty_review === 1 && totalTests === 0,
    }
  }

  const isEmptyReview = addedTests === 0

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO test_sets (
        id,
        project_id,
        analysis_context_id,
        name,
        commit_ranges,
        ai_summary,
        regressions,
        cross_impacts,
        is_empty_review
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      testSetId,
      job.projectId,
      context.id,
      name,
      JSON.stringify(commitRanges),
      aiOutput.summary,
      JSON.stringify(aiOutput.regressions),
      JSON.stringify(aiOutput.cross_repo_impacts),
      isEmptyReview ? 1 : 0
    )

    insertAnalysisRun(analysisRunId, testSetId, analysisRunLabel, commitRanges, aiOutput.summary)
    if (addedTests > 0) {
      insertAiTests(testSetId, aiOutput.tests, 0, analysisRunId, singleRepositoryBranchId)
    }
  })()

  return {testSetId, addedTests, totalTests: addedTests, isEmptyReview}
}

function insertAiTests(
  testSetId: string,
  tests: AIAnalysisOutput['tests'],
  sortOrderOffset = 0,
  analysisRunId: string | null = null,
  repositoryBranchId: string | null = null
): void {
  const db = getDb()
  const insertTest = db.prepare(`
    INSERT INTO tests (
      id,
      test_set_id,
      description,
      title,
      priority,
      area,
      user_scenario,
      preconditions,
      steps,
      expected_result,
      risk,
      technical_context,
      analysis_run_id,
      repository_branch_id,
      sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  tests.forEach((t, i) => {
    insertTest.run(
      ulid(),
      testSetId,
      t.title,
      t.title,
      t.priority,
      t.area,
      t.user_scenario || null,
      JSON.stringify(t.preconditions),
      JSON.stringify(t.steps),
      t.expected_result || null,
      t.risk || null,
      t.technical_context || null,
      analysisRunId,
      repositoryBranchId,
      sortOrderOffset + i
    )
  })
}

function insertAnalysisRun(
  id: string,
  testSetId: string,
  label: string,
  commitRanges: CommitRanges,
  aiSummary: string
): void {
  getDb()
    .prepare(
      `
      INSERT INTO analysis_runs (id, test_set_id, label, commit_ranges, ai_summary)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(id, testSetId, label, JSON.stringify(commitRanges), aiSummary)
}

function getOrCreateAnalysisContext(
  projectId: string,
  branches: RepositoryBranch[]
): {id: string; branchSignature: string} {
  const db = getDb()
  const branchIds = branches.map((branch) => branch.id).sort()
  const branchSignature = branchIds.join('|')
  const existing = db
    .prepare(
      'SELECT id, branch_signature FROM analysis_contexts WHERE project_id = ? AND branch_signature = ?'
    )
    .get(projectId, branchSignature) as {id: string; branch_signature: string} | undefined

  if (existing) return {id: existing.id, branchSignature: existing.branch_signature}

  const id = ulid()
  const name = branches
    .map((branch) => branch.name)
    .sort()
    .join(' · ')
  db.prepare(
    `
    INSERT INTO analysis_contexts (id, project_id, name, branch_signature, branch_ids)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, projectId, name || 'Default context', branchSignature, JSON.stringify(branchIds))

  return {id, branchSignature}
}

export type TestSetResolutionStatus = 'passed' | 'failed' | 'reviewed' | 'not_required'

export function closeTestSetReview(
  testSetId: string,
  status: TestSetResolutionStatus,
  resolutionNote?: string
): void {
  const db = getDb()

  const testSet = db.prepare('SELECT commit_ranges FROM test_sets WHERE id = ?').get(testSetId) as
    | {commit_ranges: string | null}
    | undefined

  if (!testSet) throw new Error('Test set not found')
  if (!testSet.commit_ranges) throw new Error('Test set has no commit ranges')

  const commitRanges: Record<string, {from: string | null; to: string}> = JSON.parse(
    testSet.commit_ranges
  )

  db.transaction(() => {
    const updateBranch = db.prepare(
      'UPDATE repository_branches SET last_analyzed_commit_hash = ? WHERE id = ?'
    )
    const updateRepoForActiveBranch = db.prepare(`
      UPDATE repositories
      SET last_analyzed_commit_hash = ?
      WHERE id = (
        SELECT repository_id
        FROM repository_branches
        WHERE id = ? AND is_active = 1
      )
    `)
    const updateLegacyRepo = db.prepare(
      'UPDATE repositories SET last_analyzed_commit_hash = ? WHERE id = ?'
    )
    for (const [targetId, range] of Object.entries(commitRanges)) {
      const branchResult = updateBranch.run(range.to, targetId)
      if (branchResult.changes === 0) {
        updateLegacyRepo.run(range.to, targetId)
      } else {
        updateRepoForActiveBranch.run(range.to, targetId)
      }
    }

    if (status === 'reviewed' || status === 'not_required') {
      db.prepare(
        `
        UPDATE tests
        SET status = 'skip'
        WHERE test_set_id = ?
          AND status NOT IN ('pass', 'fail')
      `
      ).run(testSetId)
    }

    db.prepare(
      `
      UPDATE test_sets
      SET status = ?,
          resolution_note = ?,
          completed_at = datetime('now')
      WHERE id = ?
    `
    ).run(status, normalizeResolutionNote(resolutionNote), testSetId)
  })()
}

export function markTestSetPassed(testSetId: string): void {
  closeTestSetReview(testSetId, 'passed')
}

export function deleteTestSet(testSetId: string, options: {rewind?: boolean} = {}): void {
  const db = getDb()

  const testSet = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(testSetId) as
    | {project_id: string}
    | undefined

  if (!testSet) throw new Error('Test set not found')

  db.transaction(() => {
    db.prepare('DELETE FROM test_sets WHERE id = ?').run(testSetId)

    if (options.rewind) {
      recomputeProjectAnalysisCursor(db, testSet.project_id)
    }
  })()
}

function recomputeProjectAnalysisCursor(db: ReturnType<typeof getDb>, projectId: string): void {
  const branches = db
    .prepare(
      `
      SELECT rb.id
      FROM repository_branches rb
      JOIN repositories r ON r.id = rb.repository_id
      WHERE r.project_id = ?
    `
    )
    .all(projectId) as Array<{
    id: string
  }>
  const repos = db
    .prepare('SELECT id FROM repositories WHERE project_id = ?')
    .all(projectId) as Array<{id: string}>
  const closedTestSets = db
    .prepare(
      `
      SELECT commit_ranges
      FROM test_sets
      WHERE project_id = ? AND status IN ('passed', 'failed', 'reviewed', 'not_required')
      ORDER BY created_at DESC, rowid DESC
    `
    )
    .all(projectId) as Array<{commit_ranges: string}>

  const latestAnalyzedHashByBranch = new Map<string, string | null>()

  for (const testSet of closedTestSets) {
    const commitRanges = JSON.parse(testSet.commit_ranges) as Record<string, {to: string}>

    for (const branch of branches) {
      if (!latestAnalyzedHashByBranch.has(branch.id) && commitRanges[branch.id]) {
        latestAnalyzedHashByBranch.set(branch.id, commitRanges[branch.id].to)
      }
    }

    for (const repo of repos) {
      const legacyBranch = branches.find((branch) => branch.id === `${repo.id}-branch`)
      if (
        legacyBranch &&
        !latestAnalyzedHashByBranch.has(legacyBranch.id) &&
        commitRanges[repo.id]
      ) {
        latestAnalyzedHashByBranch.set(legacyBranch.id, commitRanges[repo.id].to)
      }
    }
  }

  const updateBranch = db.prepare(
    'UPDATE repository_branches SET last_analyzed_commit_hash = ? WHERE id = ?'
  )
  const updateRepo = db.prepare(
    `
    UPDATE repositories
    SET last_analyzed_commit_hash = (
      SELECT last_analyzed_commit_hash
      FROM repository_branches
      WHERE repository_id = repositories.id AND is_active = 1
      LIMIT 1
    )
    WHERE project_id = ?
  `
  )
  for (const branch of branches) {
    updateBranch.run(latestAnalyzedHashByBranch.get(branch.id) ?? null, branch.id)
  }
  updateRepo.run(projectId)
}

function getActiveBranch(repo: Repository): RepositoryBranch | null {
  const db = getDb()
  const row =
    db
      .prepare(
        `
        SELECT *
        FROM repository_branches
        WHERE repository_id = ? AND is_active = 1
        LIMIT 1
      `
      )
      .get(repo.id) ??
    db.prepare('SELECT * FROM repository_branches WHERE repository_id = ? LIMIT 1').get(repo.id)

  return row ? repoBranchFromRow(row) : null
}
