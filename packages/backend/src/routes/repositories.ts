import {Router} from 'express'
import {mkdirSync} from 'fs'
import {join} from 'path'
import {config} from '../config.js'
import {getDb} from '../db/index.js'
import {repoBranchFromRow, repoFromRow} from '../db/mappers.js'
import {ulid} from '../utils/ulid.js'
import * as GitService from '../services/GitService.js'
import type {Repository, RepositoryBranch} from '../types/index.js'

export const reposRouter = Router({mergeParams: true})
export const repoActionsRouter = Router({mergeParams: true})

type CommitRanges = Record<string, {from: string | null; to: string}>

reposRouter.post('/discover-branches', async (req, res) => {
  const {githubUrl, githubToken} = req.body as {githubUrl?: string; githubToken?: string}
  if (!githubUrl?.trim()) return res.status(400).json({error: 'githubUrl is required'})

  try {
    const branches = await GitService.listRemoteBranches(githubUrl.trim(), githubToken)
    return res.json({data: {branches}})
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to discover remote branches',
    })
  }
})

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
      const branches = getRepoBranches(repo.id)
      const activeBranch = getActiveBranch(branches, repo)
      const activeRange =
        (activeBranch ? activeCommitRanges?.[activeBranch.id] : null) ??
        activeCommitRanges?.[repo.id]
      const sinceHash =
        activeRange?.to ?? activeBranch?.lastAnalyzedCommitHash ?? repo.lastAnalyzedCommitHash
      const analysisCursor = activeRange
        ? 'active'
        : activeBranch?.lastAnalyzedCommitHash || repo.lastAnalyzedCommitHash
          ? 'baseline'
          : 'none'
      let unanalyzedCount = 0
      if (activeBranch?.status === 'active') {
        try {
          const commits = await GitService.getCommitsSince(
            repo.localPath,
            activeBranch.name,
            sinceHash
          )
          unanalyzedCount = commits.length
        } catch {}
      }
      return {...toDto(repo, branches, activeBranch), unanalyzedCount, analysisCursor}
    })
  )

  res.json({data: enriched})
})

reposRouter.post('/', async (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const {
    localPath,
    githubUrl,
    githubToken,
    branch = 'main',
    branchNames,
  } = req.body as {
    localPath?: string
    githubUrl?: string
    githubToken?: string
    branch?: string
    branchNames?: string[]
  }

  const selectedBranches = normalizeBranchNames(branchNames?.length ? branchNames : [branch])
  if (selectedBranches.length === 0)
    return res.status(400).json({error: 'At least one branch is required'})

  let sourceType: Repository['sourceType'] = 'local_path'
  let repoLocalPath = localPath?.trim() ?? ''
  const remoteUrl = githubUrl?.trim() || null
  const remoteToken = githubToken?.trim() || null
  const id = ulid()

  if (repoLocalPath) {
    const validation = await GitService.validateRepo(repoLocalPath)
    if (!validation.valid) return res.status(400).json({error: validation.error})
  } else if (remoteUrl) {
    sourceType = 'managed_clone'
    mkdirSync(config.managedReposPath, {recursive: true})
    repoLocalPath = join(config.managedReposPath, `${safeRepoSlug(remoteUrl)}-${id}`)
    try {
      await GitService.cloneRepository(remoteUrl, repoLocalPath, remoteToken)
      await GitService.fetchOrigin(repoLocalPath, selectedBranches[0], remoteToken)
      await GitService.checkoutBranch(repoLocalPath, selectedBranches[0])
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to clone repository',
      })
    }
  } else {
    return res.status(400).json({error: 'githubUrl or localPath is required'})
  }

  const db = getDb()
  try {
    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO repositories (id, project_id, local_path, github_url, github_token, source_type, branch)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(id, projectId, repoLocalPath, remoteUrl, remoteToken, sourceType, selectedBranches[0])

      insertBranches(id, selectedBranches, selectedBranches[0])
    })()
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return res.status(409).json({error: 'Repository already added to this project'})
    }
    throw err
  }

  const rawRepo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(id)
  const repo = repoFromRow(rawRepo)
  const branches = getRepoBranches(repo.id)
  return res.status(201).json({data: toDto(repo, branches, getActiveBranch(branches, repo))})
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
  await syncTrackedBranchStatuses(repo)
  const branches = getRepoBranches(repo.id)
  const activeBranch = getActiveBranch(branches, repo)
  if (!activeBranch) return res.status(404).json({error: 'Active branch not found'})
  if (activeBranch.status !== 'active') {
    return res.status(409).json({error: `Remote branch ${activeBranch.name} no longer exists`})
  }

  try {
    await GitService.fetchOrigin(repo.localPath, activeBranch.name, repo.githubToken)
    if (repo.sourceType === 'managed_clone') {
      await GitService.checkoutBranch(repo.localPath, activeBranch.name)
    }
    db.prepare(
      "UPDATE repositories SET last_fetched_at = datetime('now'), branch = ? WHERE id = ?"
    ).run(activeBranch.name, repo.id)
    db.prepare("UPDATE repository_branches SET last_fetched_at = datetime('now') WHERE id = ?").run(
      activeBranch.id
    )

    const commits = await GitService.getCommitsSince(
      repo.localPath,
      activeBranch.name,
      activeBranch.lastAnalyzedCommitHash
    )
    return res.json({data: {fetchedAt: new Date().toISOString(), newCommits: commits.length}})
  } catch (err) {
    return res.status(500).json({error: err instanceof Error ? err.message : 'Fetch failed'})
  }
})

repoActionsRouter.post('/:repoId/sync-branches', async (req, res) => {
  const db = getDb()
  const repoRow = db.prepare('SELECT * FROM repositories WHERE id = ?').get(req.params.repoId)
  if (!repoRow) return res.status(404).json({error: 'Repository not found'})
  const repo = repoFromRow(repoRow)
  if (!repo.githubUrl) return res.status(400).json({error: 'Repository has no GitHub URL'})

  try {
    const remoteBranches = await syncTrackedBranchStatuses(repo)
    const branches = getRepoBranches(repo.id)
    const trackedNames = new Set(branches.map((branch) => branch.name))
    const untrackedBranches = remoteBranches.filter((branch) => !trackedNames.has(branch.name))

    return res.json({
      data: {
        repo: toDto(repo, branches, getActiveBranch(branches, repo)),
        untrackedBranches,
      },
    })
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to sync branches',
    })
  }
})

repoActionsRouter.post('/:repoId/branches', async (req, res) => {
  const {branchName} = req.body as {branchName?: string}
  if (!branchName?.trim()) return res.status(400).json({error: 'branchName is required'})

  const db = getDb()
  const repoRow = db.prepare('SELECT * FROM repositories WHERE id = ?').get(req.params.repoId)
  if (!repoRow) return res.status(404).json({error: 'Repository not found'})
  const repo = repoFromRow(repoRow)
  if (!repo.githubUrl) return res.status(400).json({error: 'Repository has no GitHub URL'})

  const normalizedBranchName = branchName.trim()

  try {
    const remoteBranches = await syncTrackedBranchStatuses(repo)
    if (!remoteBranches.some((branch) => branch.name === normalizedBranchName)) {
      return res.status(404).json({error: 'Remote branch not found'})
    }

    db.prepare(
      `
      INSERT INTO repository_branches (id, repository_id, name, status, is_active)
      VALUES (?, ?, ?, 'active', 0)
      ON CONFLICT(repository_id, name) DO UPDATE SET status = 'active'
    `
    ).run(ulid(), repo.id, normalizedBranchName)

    const branches = getRepoBranches(repo.id)
    return res.status(201).json({data: toDto(repo, branches, getActiveBranch(branches, repo))})
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to add branch',
    })
  }
})

repoActionsRouter.patch('/:repoId/active-branch', (req, res) => {
  const {branchId} = req.body as {branchId?: string}
  if (!branchId) return res.status(400).json({error: 'branchId is required'})

  const db = getDb()
  const repoRow = db.prepare('SELECT * FROM repositories WHERE id = ?').get(req.params.repoId)
  if (!repoRow) return res.status(404).json({error: 'Repository not found'})
  const repo = repoFromRow(repoRow)

  const branch = db
    .prepare('SELECT * FROM repository_branches WHERE id = ? AND repository_id = ?')
    .get(branchId, repo.id)
  if (!branch) return res.status(404).json({error: 'Branch not found'})

  const repoBranch = repoBranchFromRow(branch)
  if (repoBranch.status !== 'active') {
    return res.status(400).json({error: 'Cannot activate a branch that is not active in remote'})
  }

  db.transaction(() => {
    db.prepare('UPDATE repository_branches SET is_active = 0 WHERE repository_id = ?').run(repo.id)
    db.prepare('UPDATE repository_branches SET is_active = 1 WHERE id = ?').run(repoBranch.id)
    db.prepare('UPDATE repositories SET branch = ? WHERE id = ?').run(repoBranch.name, repo.id)
  })()

  const branches = getRepoBranches(repo.id)
  return res.json({data: toDto({...repo, branch: repoBranch.name}, branches, repoBranch)})
})

function getRepoBranches(repositoryId: string): RepositoryBranch[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM repository_branches WHERE repository_id = ? ORDER BY is_active DESC, name'
    )
    .all(repositoryId)
    .map(repoBranchFromRow)
}

function getActiveBranch(branches: RepositoryBranch[], repo: Repository): RepositoryBranch | null {
  return (
    branches.find((branch) => branch.isActive) ??
    branches.find((branch) => branch.name === repo.branch) ??
    branches[0] ??
    null
  )
}

function insertBranches(
  repositoryId: string,
  branchNames: string[],
  activeBranchName: string
): void {
  const db = getDb()
  const insertBranch = db.prepare(`
    INSERT INTO repository_branches (id, repository_id, name, status, is_active)
    VALUES (?, ?, ?, 'active', ?)
  `)

  for (const name of branchNames) {
    insertBranch.run(ulid(), repositoryId, name, name === activeBranchName ? 1 : 0)
  }
}

async function syncTrackedBranchStatuses(repo: Repository): Promise<GitService.RemoteBranch[]> {
  if (!repo.githubUrl) return []

  const remoteBranches = await GitService.listRemoteBranches(repo.githubUrl, repo.githubToken)
  const remoteNames = new Set(remoteBranches.map((branch) => branch.name))
  const db = getDb()
  const branches = getRepoBranches(repo.id)
  const updateStatus = db.prepare('UPDATE repository_branches SET status = ? WHERE id = ?')

  for (const branch of branches) {
    if (branch.status === 'archived') continue
    updateStatus.run(remoteNames.has(branch.name) ? 'active' : 'missing', branch.id)
  }

  return remoteBranches
}

function normalizeBranchNames(branchNames: string[]): string[] {
  return [...new Set(branchNames.map((name) => name.trim()).filter(Boolean))]
}

function safeRepoSlug(githubUrl: string): string {
  const withoutGitSuffix = githubUrl.replace(/\.git$/, '')
  const parts = withoutGitSuffix.split(/[/:]/).filter(Boolean)
  return (parts.slice(-2).join('-') || 'repo').replace(/[^a-zA-Z0-9._-]/g, '-')
}

function toDto(
  r: Repository,
  branches: RepositoryBranch[] = [],
  activeBranch?: RepositoryBranch | null
) {
  return {
    id: r.id,
    projectId: r.projectId,
    localPath: r.localPath,
    githubUrl: r.githubUrl,
    hasAuthToken: Boolean(r.githubToken),
    sourceType: r.sourceType,
    branch: activeBranch?.name ?? r.branch,
    branches,
    activeBranch: activeBranch ?? null,
    lastFetchedAt: activeBranch?.lastFetchedAt ?? r.lastFetchedAt,
    lastAnalyzedCommitHash: activeBranch?.lastAnalyzedCommitHash ?? r.lastAnalyzedCommitHash,
  }
}
