import {getDb} from '../db/index.js'
import {repoFromRow} from '../db/mappers.js'
import * as GitService from './GitService.js'
import * as AIService from './AIService.js'
import type {AIAnalysisOutput, AnalysisJob} from '../types/index.js'
import {ulid} from '../utils/ulid.js'

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
  commit_ranges: string
  ai_summary: string | null
  regressions: string | null
  cross_impacts: string | null
}

export function getRunningJob(projectId: string): AnalysisJob | null {
  return runningJobs.get(projectId) ?? null
}

export async function run(job: AnalysisJob): Promise<{testSetId: string}> {
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

async function _run(job: AnalysisJob): Promise<{testSetId: string}> {
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

  if (repos.length === 0) throw new Error('No repositories configured for this project')

  const activeTestSet = db
    .prepare(
      `
      SELECT id, name, commit_ranges, ai_summary, regressions, cross_impacts
      FROM test_sets
      WHERE project_id = ? AND status = 'active'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `
    )
    .get(job.projectId) as ActiveTestSetRow | undefined
  const activeCommitRanges = activeTestSet
    ? (JSON.parse(activeTestSet.commit_ranges) as CommitRanges)
    : null

  const diffs = await Promise.all(
    repos.map(async (repo) => {
      const headHash = await GitService.getHeadHash(repo.localPath, repo.branch)
      const fromHash = activeCommitRanges?.[repo.id]?.to ?? repo.lastAnalyzedCommitHash
      return GitService.getDiff(
        repo.id,
        repo.localPath,
        repo.branch,
        fromHash,
        headHash
      )
    })
  )

  const hasChanges = diffs.some((d) => d.commits.length > 0 || d.filesChanged.length > 0)
  if (!hasChanges) throw new NoNewCommitsError()

  const commitRanges: CommitRanges = activeCommitRanges ? {...activeCommitRanges} : {}
  for (const diff of diffs) {
    const existingRange = commitRanges[diff.repoId]
    commitRanges[diff.repoId] = {
      from: existingRange ? existingRange.from : diff.fromHash,
      to: diff.toHash,
    }
  }

  const aiOutput = await AIService.analyze({
    projectName: project.name,
    projectDescription: project.description,
    repos: diffs,
  })

  const allCommitHashes = diffs.flatMap((d) => d.commits.map((c) => c.shortHash))
  const dateStr = new Date().toISOString().slice(0, 10)
  const name =
    allCommitHashes.length > 0
      ? `${allCommitHashes[allCommitHashes.length - 1]}..${allCommitHashes[0]} · ${dateStr}`
      : `Analysis · ${dateStr}`

  const testSetId = ulid()

  if (activeTestSet) {
    const nextSortOrder = ((db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tests WHERE test_set_id = ?')
      .get(activeTestSet.id) as {next: number}).next)

    db.transaction(() => {
      db.prepare(
        `
        UPDATE test_sets
        SET commit_ranges = ?,
            ai_summary = ?,
            regressions = ?,
            cross_impacts = ?
        WHERE id = ?
      `
      ).run(
        JSON.stringify(commitRanges),
        appendSummary(activeTestSet.ai_summary, aiOutput.summary),
        JSON.stringify(mergeStringArrays(parseStringArray(activeTestSet.regressions), aiOutput.regressions)),
        JSON.stringify(
          mergeStringArrays(parseStringArray(activeTestSet.cross_impacts), aiOutput.cross_repo_impacts)
        ),
        activeTestSet.id
      )

      insertAiTests(activeTestSet.id, aiOutput.tests, nextSortOrder)
    })()

    return {testSetId: activeTestSet.id}
  }

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO test_sets (id, project_id, name, commit_ranges, ai_summary, regressions, cross_impacts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      testSetId,
      job.projectId,
      name,
      JSON.stringify(commitRanges),
      aiOutput.summary,
      JSON.stringify(aiOutput.regressions),
      JSON.stringify(aiOutput.cross_repo_impacts)
    )

    insertAiTests(testSetId, aiOutput.tests)
  })()

  return {testSetId}
}

function insertAiTests(
  testSetId: string,
  tests: AIAnalysisOutput['tests'],
  sortOrderOffset = 0
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
      sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      sortOrderOffset + i
    )
  })
}

function appendSummary(current: string | null, next: string): string {
  if (!current?.trim()) return next
  if (!next.trim()) return current
  const date = new Date().toISOString().slice(0, 10)
  return `${current}\n\nUpdate ${date}: ${next}`
}

function parseStringArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function mergeStringArrays(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b].map((item) => item.trim()).filter(Boolean))]
}

export function markTestSetPassed(testSetId: string): void {
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
    const updateRepo = db.prepare(
      'UPDATE repositories SET last_analyzed_commit_hash = ? WHERE id = ?'
    )
    for (const [repoId, range] of Object.entries(commitRanges)) {
      updateRepo.run(range.to, repoId)
    }

    db.prepare(
      `
      UPDATE test_sets SET status = 'passed', completed_at = datetime('now') WHERE id = ?
    `
    ).run(testSetId)
  })()
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
  const repos = db
    .prepare('SELECT id FROM repositories WHERE project_id = ?')
    .all(projectId) as Array<{
    id: string
  }>
  const passedTestSets = db
    .prepare(
      `
      SELECT commit_ranges
      FROM test_sets
      WHERE project_id = ? AND status = 'passed'
      ORDER BY created_at DESC, rowid DESC
    `
    )
    .all(projectId) as Array<{commit_ranges: string}>

  const latestAnalyzedHashByRepo = new Map<string, string | null>()

  for (const testSet of passedTestSets) {
    const commitRanges = JSON.parse(testSet.commit_ranges) as Record<string, {to: string}>

    for (const repo of repos) {
      if (!latestAnalyzedHashByRepo.has(repo.id) && commitRanges[repo.id]) {
        latestAnalyzedHashByRepo.set(repo.id, commitRanges[repo.id].to)
      }
    }
  }

  const updateRepo = db.prepare(
    'UPDATE repositories SET last_analyzed_commit_hash = ? WHERE id = ?'
  )
  for (const repo of repos) {
    updateRepo.run(latestAnalyzedHashByRepo.get(repo.id) ?? null, repo.id)
  }
}
