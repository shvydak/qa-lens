import {Router} from 'express'
import {getDb} from '../db/index.js'
import {repoFromRow} from '../db/mappers.js'
import {ulid} from '../utils/ulid.js'
import * as GitService from '../services/GitService.js'
import type {Repository} from '../types/index.js'

export const reposRouter = Router({mergeParams: true})
export const repoActionsRouter = Router({mergeParams: true})

type CommitRanges = Record<string, {from: string | null; to: string}>

reposRouter.get('/', async (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const db = getDb()
  const repos = db
    .prepare('SELECT * FROM repositories WHERE project_id = ? ORDER BY rowid')
    .all(projectId)
  const activeTestSet = db
    .prepare(
      `
      SELECT commit_ranges
      FROM test_sets
      WHERE project_id = ? AND status = 'active'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `
    )
    .get(projectId) as {commit_ranges: string} | undefined
  const activeCommitRanges = activeTestSet
    ? (JSON.parse(activeTestSet.commit_ranges) as CommitRanges)
    : null

  const enriched = await Promise.all(
    repos.map(async (row) => {
      const repo = repoFromRow(row)
      const activeRange = activeCommitRanges?.[repo.id]
      const sinceHash = activeRange?.to ?? repo.lastAnalyzedCommitHash
      const analysisCursor = activeRange
        ? 'active'
        : repo.lastAnalyzedCommitHash
          ? 'baseline'
          : 'none'
      let unanalyzedCount = 0
      try {
        const commits = await GitService.getCommitsSince(repo.localPath, repo.branch, sinceHash)
        unanalyzedCount = commits.length
      } catch {}
      return {...toDto(repo), unanalyzedCount, analysisCursor}
    })
  )

  res.json({data: enriched})
})

reposRouter.post('/', async (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const {
    localPath,
    githubUrl,
    branch = 'main',
  } = req.body as {
    localPath?: string
    githubUrl?: string
    branch?: string
  }

  if (!localPath?.trim()) return res.status(400).json({error: 'localPath is required'})

  const validation = await GitService.validateRepo(localPath.trim())
  if (!validation.valid) return res.status(400).json({error: validation.error})

  const db = getDb()
  const id = ulid()
  try {
    db.prepare(
      'INSERT INTO repositories (id, project_id, local_path, github_url, branch) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectId, localPath.trim(), githubUrl ?? null, branch)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return res.status(409).json({error: 'Repository already added to this project'})
    }
    throw err
  }

  const rawRepo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(id)
  const repo = repoFromRow(rawRepo)
  return res.status(201).json({data: toDto(repo)})
})

repoActionsRouter.delete('/:repoId', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM repositories WHERE id = ?').run(req.params.repoId)
  res.json({data: {ok: true}})
})

repoActionsRouter.post('/:repoId/fetch', async (req, res) => {
  const db = getDb()
  const repoRow = db.prepare('SELECT * FROM repositories WHERE id = ?').get(req.params.repoId)
  if (!repoRow) return res.status(404).json({error: 'Repository not found'})
  const repo = repoFromRow(repoRow)

  try {
    await GitService.fetchOrigin(repo.localPath, repo.branch)
    db.prepare("UPDATE repositories SET last_fetched_at = datetime('now') WHERE id = ?").run(
      repo.id
    )

    const commits = await GitService.getCommitsSince(
      repo.localPath,
      repo.branch,
      repo.lastAnalyzedCommitHash
    )
    return res.json({data: {fetchedAt: new Date().toISOString(), newCommits: commits.length}})
  } catch (err) {
    return res.status(500).json({error: err instanceof Error ? err.message : 'Fetch failed'})
  }
})

function toDto(r: Repository) {
  return {
    id: r.id,
    projectId: r.projectId,
    localPath: r.localPath,
    githubUrl: r.githubUrl,
    branch: r.branch,
    lastFetchedAt: r.lastFetchedAt,
    lastAnalyzedCommitHash: r.lastAnalyzedCommitHash,
  }
}
