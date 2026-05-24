import {Router} from 'express'
import {mkdirSync} from 'fs'
import {join} from 'path'
import {config} from '../config.js'
import {getDb} from '../db/index.js'
import {credentialToDto, repoBranchFromRow, repoFromRow} from '../db/mappers.js'
import {asyncHandler} from './asyncHandler.js'
import {deleteManagedRepoFolders} from '../services/ManagedRepoStorage.js'
import {ulid} from '../utils/ulid.js'
import * as GitService from '../services/GitService.js'
import type {Repository} from '../types/index.js'
import {
  commitUrl,
  getActiveBranch,
  getCredentialToken,
  getRepoBranches,
  insertBranches,
  normalizeBranchNames,
  repoToDto,
  safeRepoSlug,
  syncTrackedBranchStatuses,
  type CommitRanges,
} from './repositories.helpers.js'

export const reposRouter = Router({mergeParams: true})
export const repoActionsRouter = Router({mergeParams: true})

reposRouter.get('/credentials', (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const credentials = getDb()
    .prepare(
      `
      SELECT id, project_id, name, token IS NOT NULL AS has_token, created_at
      FROM github_credentials
      WHERE project_id = ? OR project_id IS NULL
      ORDER BY (project_id IS NULL) DESC, name
    `
    )
    .all(projectId)
  res.json({data: credentials.map((row) => credentialToDto(row))})
})

reposRouter.post('/credentials', (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const {name, token} = req.body as {name?: string; token?: string}
  if (!name?.trim()) return res.status(400).json({error: 'name is required'})
  if (!token?.trim()) return res.status(400).json({error: 'token is required'})

  const id = ulid()
  try {
    getDb()
      .prepare(
        `
        INSERT INTO github_credentials (id, project_id, name, token)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(id, projectId, name.trim(), token.trim())
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return res.status(409).json({error: 'Credential with this name already exists'})
    }
    throw err
  }

  const credential = getDb()
    .prepare(
      'SELECT id, project_id, name, token IS NOT NULL AS has_token, created_at FROM github_credentials WHERE id = ?'
    )
    .get(id)
  return res.status(201).json({data: credentialToDto(credential)})
})

reposRouter.post(
  '/discover-branches',
  asyncHandler(async (req, res) => {
    const {projectId} = req.params as {projectId: string}
    const {githubUrl, githubToken, githubCredentialId} = req.body as {
      githubUrl?: string
      githubToken?: string
      githubCredentialId?: string
    }
    if (!githubUrl?.trim()) return res.status(400).json({error: 'githubUrl is required'})

    try {
      const token = githubToken ?? getCredentialToken(projectId, githubCredentialId)
      const branches = await GitService.listRemoteBranches(githubUrl.trim(), token)
      return res.json({data: {branches}})
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to discover remote branches',
      })
    }
  })
)

reposRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {projectId} = req.params as {projectId: string}
    const db = getDb()
    const repos = db
      .prepare('SELECT * FROM repositories WHERE project_id = ? ORDER BY rowid')
      .all(projectId)
    const repoModels = repos.map((row) => {
      const repo = repoFromRow(row)
      const branches = getRepoBranches(repo.id)
      return {repo, branches, activeBranch: getActiveBranch(branches, repo)}
    })
    const branchSignature = repoModels
      .map(({activeBranch}) => activeBranch?.id)
      .filter(Boolean)
      .sort()
      .join('|')
    const activeTestSet = branchSignature
      ? (db
          .prepare(
            `
          SELECT ts.commit_ranges
          FROM test_sets ts
          JOIN analysis_contexts ac ON ac.id = ts.analysis_context_id
          WHERE ts.project_id = ? AND ts.status = 'active' AND ac.branch_signature = ?
          ORDER BY ts.created_at DESC, ts.rowid DESC
          LIMIT 1
        `
          )
          .get(projectId, branchSignature) as {commit_ranges: string} | undefined)
      : undefined
    const legacyActiveTestSet = activeTestSet
      ? undefined
      : (db
          .prepare(
            `
      SELECT commit_ranges
      FROM test_sets
      WHERE project_id = ? AND status = 'active'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `
          )
          .get(projectId) as {commit_ranges: string} | undefined)
    const activeCommitRanges = activeTestSet
      ? (JSON.parse(activeTestSet.commit_ranges) as CommitRanges)
      : legacyActiveTestSet
        ? (JSON.parse(legacyActiveTestSet.commit_ranges) as CommitRanges)
        : null

    const enriched = await Promise.all(
      repoModels.map(async ({repo, branches, activeBranch}) => {
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
        const latestCommit =
          activeBranch?.status === 'active'
            ? await GitService.getLatestCommit(repo.localPath, activeBranch.name).catch(() => null)
            : null

        return {
          ...repoToDto(repo, branches, activeBranch),
          unanalyzedCount,
          analysisCursor,
          latestCommit: latestCommit
            ? {...latestCommit, url: commitUrl(repo.githubUrl, latestCommit.hash)}
            : null,
        }
      })
    )

    res.json({data: enriched})
  })
)

reposRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {projectId} = req.params as {projectId: string}
    const {
      githubUrl,
      githubToken,
      githubCredentialId,
      branch = 'main',
      branchNames,
    } = req.body as {
      githubUrl?: string
      githubToken?: string
      githubCredentialId?: string
      branch?: string
      branchNames?: string[]
    }
    const remoteUrl = githubUrl?.trim() || null
    if (!remoteUrl) return res.status(400).json({error: 'githubUrl is required'})

    const selectedBranches = normalizeBranchNames(branchNames?.length ? branchNames : [branch])
    if (selectedBranches.length === 0)
      return res.status(400).json({error: 'At least one branch is required'})

    const sourceType: Repository['sourceType'] = 'managed_clone'
    const remoteToken = githubToken?.trim() || getCredentialToken(projectId, githubCredentialId)
    const credentialId = githubCredentialId?.trim() || null
    const id = ulid()
    const repoLocalPath = join(config.managedReposPath, `${safeRepoSlug(remoteUrl)}-${id}`)

    mkdirSync(config.managedReposPath, {recursive: true})
    try {
      await GitService.cloneRepository(remoteUrl, repoLocalPath, remoteToken)
      await GitService.fetchOrigin(repoLocalPath, selectedBranches[0], remoteToken)
      await GitService.checkoutBranch(repoLocalPath, selectedBranches[0])
    } catch (err) {
      deleteManagedRepoFolders([{localPath: repoLocalPath, sourceType}])
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to clone repository',
      })
    }

    const db = getDb()
    try {
      db.transaction(() => {
        db.prepare(
          `
        INSERT INTO repositories (id, project_id, local_path, github_url, github_token, github_credential_id, source_type, branch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        ).run(
          id,
          projectId,
          repoLocalPath,
          remoteUrl,
          remoteToken,
          credentialId,
          sourceType,
          selectedBranches[0]
        )

        insertBranches(id, selectedBranches, selectedBranches[0])
      })()
    } catch (err: unknown) {
      deleteManagedRepoFolders([{localPath: repoLocalPath, sourceType}])
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        return res.status(409).json({error: 'Repository already added to this project'})
      }
      throw err
    }

    const rawRepo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(id)
    const repo = repoFromRow(rawRepo)
    const branches = getRepoBranches(repo.id)
    return res.status(201).json({data: repoToDto(repo, branches, getActiveBranch(branches, repo))})
  })
)

repoActionsRouter.delete('/:repoId', (req, res) => {
  const db = getDb()
  const repo = db
    .prepare('SELECT local_path, source_type FROM repositories WHERE id = ?')
    .get(req.params.repoId) as {local_path: string; source_type: string | null} | undefined

  if (!repo) return res.status(404).json({error: 'Repository not found'})

  db.prepare('DELETE FROM repositories WHERE id = ?').run(req.params.repoId)

  const stillReferenced = db
    .prepare('SELECT COUNT(*) as count FROM repositories WHERE local_path = ?')
    .get(repo.local_path) as {count: number}
  if (stillReferenced.count === 0) {
    deleteManagedRepoFolders([{localPath: repo.local_path, sourceType: repo.source_type}])
  }

  res.json({data: {ok: true}})
})

repoActionsRouter.post(
  '/:repoId/fetch',
  asyncHandler(async (req, res) => {
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
      db.prepare(
        "UPDATE repository_branches SET last_fetched_at = datetime('now') WHERE id = ?"
      ).run(activeBranch.id)

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
)

repoActionsRouter.post(
  '/:repoId/sync-branches',
  asyncHandler(async (req, res) => {
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
          repo: repoToDto(repo, branches, getActiveBranch(branches, repo)),
          untrackedBranches,
        },
      })
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to sync branches',
      })
    }
  })
)

repoActionsRouter.post(
  '/:repoId/branches',
  asyncHandler(async (req, res) => {
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
      return res
        .status(201)
        .json({data: repoToDto(repo, branches, getActiveBranch(branches, repo))})
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to add branch',
      })
    }
  })
)

repoActionsRouter.patch('/:repoId/branches/:branchId', (req, res) => {
  const {status} = req.body as {status?: string}
  if (status !== 'archived' && status !== 'active') {
    return res.status(400).json({error: 'status must be archived or active'})
  }

  const db = getDb()
  const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(req.params.repoId)
  if (!repo) return res.status(404).json({error: 'Repository not found'})

  const branch = db
    .prepare('SELECT * FROM repository_branches WHERE id = ? AND repository_id = ?')
    .get(req.params.branchId, req.params.repoId)
  if (!branch) return res.status(404).json({error: 'Branch not found'})

  const repoBranch = repoBranchFromRow(branch)
  if (repoBranch.isActive && status === 'archived') {
    return res.status(400).json({error: 'Cannot archive the active branch'})
  }

  db.prepare('UPDATE repository_branches SET status = ? WHERE id = ?').run(status, repoBranch.id)
  const mappedRepo = repoFromRow(repo)
  const branches = getRepoBranches(mappedRepo.id)
  return res.json({data: repoToDto(mappedRepo, branches, getActiveBranch(branches, mappedRepo))})
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
  return res.json({data: repoToDto({...repo, branch: repoBranch.name}, branches, repoBranch)})
})
