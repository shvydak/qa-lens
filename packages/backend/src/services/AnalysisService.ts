import { getDb } from '../db/index.js'
import { repoFromRow } from '../db/mappers.js'
import * as GitService from './GitService.js'
import * as AIService from './AIService.js'
import type { AnalysisJob, TestSet, Test } from '../types/index.js'
import { ulid } from '../utils/ulid.js'

export class NoNewCommitsError extends Error {
  constructor() { super('No new commits to analyze') }
}

const runningJobs = new Map<string, AnalysisJob>()

export function getRunningJob(projectId: string): AnalysisJob | null {
  return runningJobs.get(projectId) ?? null
}

export async function run(job: AnalysisJob): Promise<{ testSetId: string }> {
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

async function _run(job: AnalysisJob): Promise<{ testSetId: string }> {
  const db = getDb()

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(job.projectId) as
    | { id: string; name: string; description: string }
    | undefined

  if (!project) throw new Error('Project not found')

  const repoRows = (
    job.repoIds.length > 0
      ? db
          .prepare(`SELECT * FROM repositories WHERE id IN (${job.repoIds.map(() => '?').join(',')})`)
          .all(...job.repoIds)
      : db.prepare('SELECT * FROM repositories WHERE project_id = ?').all(job.projectId)
  )
  const repos = repoRows.map(repoFromRow)

  if (repos.length === 0) throw new Error('No repositories configured for this project')

  const diffs = await Promise.all(
    repos.map(async (repo) => {
      const headHash = await GitService.getHeadHash(repo.localPath, repo.branch)
      return GitService.getDiff(repo.id, repo.localPath, repo.branch, repo.lastAnalyzedCommitHash, headHash)
    })
  )

  const hasChanges = diffs.some((d) => d.commits.length > 0 || d.filesChanged.length > 0)
  if (!hasChanges) throw new NoNewCommitsError()

  const aiOutput = await AIService.analyze({
    projectName: project.name,
    projectDescription: project.description,
    repos: diffs,
  })

  const commitRanges: Record<string, { from: string | null; to: string }> = {}
  for (const diff of diffs) {
    commitRanges[diff.repoId] = { from: diff.fromHash, to: diff.toHash }
  }

  const allCommitHashes = diffs.flatMap((d) => d.commits.map((c) => c.shortHash))
  const dateStr = new Date().toISOString().slice(0, 10)
  const name = allCommitHashes.length > 0
    ? `${allCommitHashes[allCommitHashes.length - 1]}..${allCommitHashes[0]} · ${dateStr}`
    : `Analysis · ${dateStr}`

  const testSetId = ulid()

  db.transaction(() => {
    db.prepare(`
      INSERT INTO test_sets (id, project_id, name, commit_ranges, ai_summary, regressions, cross_impacts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      testSetId,
      job.projectId,
      name,
      JSON.stringify(commitRanges),
      aiOutput.summary,
      JSON.stringify(aiOutput.regressions),
      JSON.stringify(aiOutput.cross_repo_impacts)
    )

    const insertTest = db.prepare(`
      INSERT INTO tests (id, test_set_id, description, priority, area, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    aiOutput.tests.forEach((t, i) => {
      insertTest.run(ulid(), testSetId, t.title, t.priority, t.area, i)
    })
  })()

  return { testSetId }
}

export function markTestSetPassed(testSetId: string): void {
  const db = getDb()

  const testSet = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(testSetId) as
    | TestSet
    | undefined

  if (!testSet) throw new Error('Test set not found')

  const commitRanges: Record<string, { from: string | null; to: string }> =
    typeof testSet.commitRanges === 'string'
      ? JSON.parse(testSet.commitRanges as unknown as string)
      : testSet.commitRanges

  db.transaction(() => {
    const updateRepo = db.prepare(
      'UPDATE repositories SET last_analyzed_commit_hash = ? WHERE id = ?'
    )
    for (const [repoId, range] of Object.entries(commitRanges)) {
      updateRepo.run(range.to, repoId)
    }

    db.prepare(`
      UPDATE test_sets SET status = 'passed', completed_at = datetime('now') WHERE id = ?
    `).run(testSetId)
  })()
}
